"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Point API for custom sites: the same validated horizon code as the curated sites.

  GET /api/point?lat=-89.44&lon=222.83
      -> JSON: site height, horizon profiles for every mast height (1/100 deg,
         base64 int16-le, same layout as horizons.bin), 40 m terrain tile info,
         edge warning for points close to the 80S DEM edge
  GET /api/tile?lat=..&lon=..   -> 512 x 512 int16-le 40 m terrain tile
  GET /api/health               -> "ok"

Binds to 127.0.0.1 only; serve.mjs proxies /api/* to it.
Usage: python api.py [PORT]
"""
from __future__ import annotations

import base64
import json
import math
import sys
import threading
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np
from numba import njit, prange

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
