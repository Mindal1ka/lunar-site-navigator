"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Point API for custom sites: the same validated horizon code as the curated sites.

  GET /api/point?lat=-89.44&lon=222.83
      -> JSON: site height, horizon profiles for every mast height (1/100 deg,
         base64 int16-le, same layout as horizons.bin), 40 m terrain tile info,
         edge warning for points close to the 80S DEM edge
  GET /api/tile?lat=..&lon=..   -> 512 x 512 int16-le 40 m terrain tile
  GET /api/square?lat=..&lon=.. -> 101 x 101 cells of 100 m centred on the point, same 7-plane uint8
      format and method as static/data/squares/<site-id>.bin (see pipeline/squares_gpu.py):
        200 application/octet-stream, 7 * 101 * 101 bytes, when ready (disk + memory cache);
        202 {"state": "queued"|"running", "position": int, "eta_s": number} -> re-poll every ~2 s;
        503 {"error": "busy", "retry_s": n} when 6 squares are already waiting;
        503 {"error": "gpu unavailable"} without CuPy / CUDA;
        a client with 2 waiting squares that asks for a third loses its oldest waiting one;
        400 {"error": ...} for invalid points (same validation as /api/point).
      One background GPU worker computes one square at a time (FIFO); requests for the same
      rounded point share one job; waiting jobs nobody polled for 60 s are dropped.
  GET /api/health               -> "ok"

Binds to 127.0.0.1 only; serve.mjs proxies /api/* to it (and forwards the client address).
Usage: python api.py [PORT]   (LUNAR_ROOT=<checkout> reads data/raw from another checkout)
"""
from __future__ import annotations

import base64
import json
import math
import os
import sys
import threading
import time
from collections import OrderedDict
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np
from numba import njit, prange

from common import WORK
from horizon import N_AZ, horizon_profile
from lola import latlon_to_xy, open_dem, sample_bilinear
from sites import HEIGHTS_M
from terrain import tile_for

DEM40 = open_dem("ldem_80s_40m")
HEIGHTS = np.array(HEIGHTS_M, dtype=np.float64)
LOCK = threading.Lock()  # numba parallel kernels: one computation at a time
EDGE_LAT = -81.5  # rays towards the equator may reach the DEM edge north of this


@njit(parallel=True, cache=True)
def _profiles(dn, n, scale, lat, lon, heights, n_az):
    out = np.empty((heights.size, n_az))
    for j in prange(heights.size):
        prof, _ = horizon_profile(dn, n, scale, lat, lon, heights[j], 200_000.0, n_az)
        out[j] = prof
    return out


def _parse(qs: dict) -> tuple[float, float]:
    lat = float(qs["lat"][0])
    lon = float(qs["lon"][0]) % 360.0
    if not (math.isfinite(lat) and -90.0 < lat <= -80.2):
        raise ValueError("Latitude must be between -80.2 and -90")
    x, y = latlon_to_xy(lat, lon)
    if math.isnan(sample_bilinear(DEM40.dn, DEM40.n, DEM40.scale, x, y)):
        raise ValueError("Point is outside the LOLA 80S map")
    return round(lat, 4), round(lon, 4)


@lru_cache(maxsize=512)
def point(lat: float, lon: float) -> bytes:
    with LOCK:
        prof = _profiles(DEM40.dn, DEM40.n, DEM40.scale, lat, lon, HEIGHTS, N_AZ)
    x, y = latlon_to_xy(lat, lon)
    h0 = float(sample_bilinear(DEM40.dn, DEM40.n, DEM40.scale, x, y))
    _, tile = tile_for(DEM40, lat, lon)
    body = {
        "lat": lat, "lon": lon, "elevation_m": round(h0, 1), "heights_m": HEIGHTS_M, "n_az": N_AZ,
        "horizons_b64": base64.b64encode(np.round(prof * 100).astype("<i2").tobytes()).decode(),
        "tile": tile, "edge_warning": lat > EDGE_LAT,
        "method": "LOLA LDEM_80S_40M, 0.25 deg azimuth bins, rays up to 200 km or the DEM edge",
    }
    return json.dumps(body).encode()


@lru_cache(maxsize=64)
def tile(lat: float, lon: float) -> bytes:
    grid, _ = tile_for(DEM40, lat, lon)
    return grid.astype("<i2").tobytes()


# ------------------------------------------------------------------ /api/square
SQ_N = 101
SQ_BYTES = 7 * SQ_N * SQ_N
SQ_CACHE = WORK / "square_cache"
MAX_QUEUE = 6          # waiting jobs (the running one is not counted)
MAX_PER_CLIENT = 2     # waiting jobs per client address (newest click wins)
STALE_S = 60.0         # a waiting job nobody polled for this long is dropped
MEM_ITEMS = 64         # in-memory LRU of finished squares (70 kB each)


class _Job:
    __slots__ = ("key", "client", "state", "polled")

    def __init__(self, key: tuple[float, float], client: str) -> None:
        self.key, self.client = key, client
        self.state, self.polled = "queued", time.monotonic()


class SquareService:
    """FIFO queue + one GPU worker thread; results cached on disk and in a small in-memory LRU."""

    def __init__(self) -> None:
        self.cv = threading.Condition()
        self.queue: list[_Job] = []
        self.jobs: dict[tuple[float, float], _Job] = {}  # waiting, running, or failed until reported
        self.running: _Job | None = None
        self.started = 0.0
        self.avg_s = 90.0  # running average of the measured job time (2 heights x 10 201 cells)
        self.mem: OrderedDict[tuple[float, float], bytes] = OrderedDict()
        self.gpu_error: str | None = None
        self.gpu_retry_at = 0.0  # after a transient init failure (e.g. GPU memory full) try again later
        self.worker: threading.Thread | None = None

    @staticmethod
    def _path(key: tuple[float, float]):
        return SQ_CACHE / f"{key[0]:.4f}_{key[1]:.4f}.bin"

    def _remember(self, key, data: bytes) -> None:
        self.mem[key] = data
        self.mem.move_to_end(key)
        while len(self.mem) > MEM_ITEMS:
            self.mem.popitem(last=False)

    def _cached(self, key) -> bytes | None:
        if key in self.mem:
            self.mem.move_to_end(key)
            return self.mem[key]
        p = self._path(key)
        if p.is_file():
            data = p.read_bytes()
            if len(data) == SQ_BYTES:
                self._remember(key, data)
                return data
        return None

    def _drop_stale(self) -> None:
        now = time.monotonic()
        for j in [j for j in self.jobs.values() if j.state != "running" and now - j.polled > STALE_S]:
            if j in self.queue:
                self.queue.remove(j)
            del self.jobs[j.key]

    def _status(self, j: _Job) -> dict:
        left = max(self.avg_s - (time.monotonic() - self.started), 5.0) if self.running else 0.0
        if j.state == "running":
            return {"state": "running", "position": 0, "eta_s": round(left, 1)}
        pos = self.queue.index(j) + 1
        return {"state": "queued", "position": pos, "eta_s": round(left + pos * self.avg_s, 1)}

    def request(self, key: tuple[float, float], client: str) -> tuple[int, bytes | dict]:
        """(200, bytes) | (202, status dict) | (503, error dict with retry_s)."""
        with self.cv:
            data = self._cached(key)
            if data is not None:
                return 200, data
            if self.gpu_error:
                if time.monotonic() < self.gpu_retry_at:
                    return 503, {"error": "gpu unavailable", "retry_s": int(self.gpu_retry_at - time.monotonic()) + 1}
                self.gpu_error, self.worker = None, None  # transient failure: allow a new attempt
            self._drop_stale()
            j = self.jobs.get(key)
            if j is not None:
                if j.state == "failed":  # report once; the next request starts a new job
                    del self.jobs[key]
                    return 503, {"error": "computation failed", "retry_s": 30}
                j.polled = time.monotonic()
                return 202, self._status(j)
            mine = [o for o in self.queue if o.client == client]
            if len(mine) >= MAX_PER_CLIENT:  # the newest click wins: drop this client's oldest waiting job
                self.queue.remove(mine[0])
                del self.jobs[mine[0].key]
            if len(self.queue) >= MAX_QUEUE:
                return 503, {"error": "busy", "retry_s": int(round(self.avg_s))}
            j = _Job(key, client)
            self.jobs[key] = j
            self.queue.append(j)
            if self.worker is None:
                self.worker = threading.Thread(target=self._work, name="square-gpu", daemon=True)
                self.worker.start()
            self.cv.notify()
            return 202, self._status(j)

    def _work(self) -> None:
        try:  # CuPy, the CUDA kernels, the ephemeris and the 40 m DEM: loaded once, in this thread
            import squares_gpu
            from heatmap_gpu import Gpu
            g = Gpu(**squares_gpu.SITE_METHOD)
        except Exception as e:  # noqa: BLE001 - no CuPy / CUDA / GPU memory
            sys.stderr.write(f"api square: GPU unavailable: {e!r}\n")
            permanent = isinstance(e, ImportError) or "NoDevice" in repr(e) or "InsufficientDriver" in repr(e)
            with self.cv:
                self.gpu_error = repr(e)
                self.gpu_retry_at = time.monotonic() + (3600.0 if permanent else 60.0)
                self.queue.clear()
                self.jobs.clear()
            return
        while True:
            with self.cv:
                while True:
                    self._drop_stale()
                    if self.queue:
                        break
                    self.cv.wait(timeout=STALE_S)
                j = self.queue.pop(0)
                j.state, self.running, self.started = "running", j, time.monotonic()
            data = None
            try:  # g.dem is the same 40 m DEM, reused for the slope plane (as in squares_gpu.main)
                data = squares_gpu.compute_square(g, g.dem, *j.key)
                SQ_CACHE.mkdir(parents=True, exist_ok=True)
                tmp = self._path(j.key).with_suffix(".tmp")
                tmp.write_bytes(data)
                os.replace(tmp, self._path(j.key))
            except Exception as e:  # noqa: BLE001 - e.g. CUDA out of memory while the GPU is shared
                sys.stderr.write(f"api square {j.key}: {e!r}\n")
            dt = time.monotonic() - self.started
            with self.cv:
                self.running = None
                if data is not None and len(data) == SQ_BYTES:
                    self.avg_s = 0.7 * self.avg_s + 0.3 * dt
                    self._remember(j.key, data)
                    self.jobs.pop(j.key, None)
                    sys.stderr.write(f"api square {j.key}: {dt:.1f} s\n")
                else:
                    j.state, j.polled = "failed", time.monotonic()


SQUARES = SquareService()


def _client(h: BaseHTTPRequestHandler) -> str:
    """Client address: Cloudflare's header, else the first X-Forwarded-For hop, else the peer."""
    cf = (h.headers.get("CF-Connecting-IP") or "").strip()
    if cf:
        return cf
    first = (h.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return first or h.client_address[0]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=86400" if code == 200 else "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        try:
            if u.path == "/api/health":
                return self._send(200, b"ok", "text/plain")
            if u.path in ("/api/point", "/api/tile"):
                lat, lon = _parse(parse_qs(u.query))
                if u.path == "/api/point":
                    return self._send(200, point(lat, lon), "application/json")
                return self._send(200, tile(lat, lon), "application/octet-stream")
            if u.path == "/api/square":
                lat, lon = _parse(parse_qs(u.query))
                code, body = SQUARES.request((lat, lon), _client(self))
                if code == 200:
                    return self._send(200, body, "application/octet-stream")
                return self._send(code, json.dumps(body).encode(), "application/json")
            return self._send(404, b'{"error":"Not found"}', "application/json")
        except (KeyError, ValueError) as e:
            return self._send(400, json.dumps({"error": str(e) or "Bad request"}).encode(), "application/json")

    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("api %s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 44001
    point(-89.4398, 222.83)  # warm up the JIT before accepting requests
    print(f"api ready on 127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
