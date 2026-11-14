"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Detailed squares around the curated landing sites, computed on the GPU with the SAME method as the
site card (horizon.site_horizon: LOLA 40 m DEM, 1440 azimuth bins, rays up to 200 km) and the same
definitions (Sun % = mean visible disk fraction, Earth % = Earth centre > horizon + 1 deg,
longest night = longest run of hours with the disk fully hidden) over the first 12 months.

Each square: 101 x 101 cells of 100 m (10.1 km), centred on the site, so the centre cell is the site
itself. Heights 2 m and 10 m. File static/data/squares/<site-id>.bin, uint8 x 7 planes of 101 x 101,
row 0 at +y (towards lon 0), col 0 at -x:
  [sun, earth, night] at 2 m, [sun, earth, night] at 10 m, slope
encodings as in finemap_gpu.py (sun/earth /200, night days with 253/254 codes, slope deg x 4, 255 = no data).

`--check` compares the centre cell with the CPU site method (horizon.site_horizon + visibility_series)
for every site and height and fails if any quantised value differs.
Usage: python squares_gpu.py [--check] [--only <site-id>]
"""
from __future__ import annotations

import json
import os
import sys
import time

import numpy as np

from common import OUT
from finemap_gpu import encode, slope_deg
from heatmap import EARTH_MARGIN, load_year
from heatmap_gpu import Gpu
from lola import latlon_to_xy, open_dem, xy_to_latlon

N = 101
CELL_M = 100.0
HEIGHTS = [2.0, 10.0]
SITE_METHOD = dict(dem="ldem_80s_40m", n_az=1440, max_dist=200_000.0)
SQ = OUT / "squares"


def square_xy(lat: float, lon: float) -> tuple[np.ndarray, np.ndarray]:
    xs, ys = latlon_to_xy(lat, lon)
    k = (np.arange(N) - N // 2) * CELL_M
    xx, yy = np.meshgrid(xs + k, ys - k)
    return xx.ravel(), yy.ravel()


def compute_square(g: Gpu, d40, lat: float, lon: float) -> bytes:
    x, y = square_xy(lat, lon)
    la, lo = xy_to_latlon(x, y)
    la, lo = np.ascontiguousarray(la), np.ascontiguousarray(lo)
    planes = []
    for h in HEIGHTS:
        out = g.compute(la, lo, batch=512, obs_h=h)
        planes.append(encode(out, g.n_hours, g.meta["step_s"]))
    sl = slope_deg(d40.dn, d40.n, d40.scale, x, y)
    sp = np.full(sl.shape, 255, np.uint8)
    ok = np.isfinite(sl)
    sp[ok] = np.clip(np.round(sl[ok] * 4), 0, 254)
    return np.concatenate([*planes, sp[None]], 0).tobytes()


def meta_json(sites: list[dict], g: Gpu) -> dict:
    return {
        "cell_m": CELL_M, "n": N, "heights_m": HEIGHTS,
        "planes": ["sun@2", "earth@2", "night@2", "sun@10", "earth@10", "night@10", "slope"],
        "layout": "uint8 planes of n x n, row-major, row 0 at +y (towards lon 0), col 0 at -x; "
                  "centre cell (n // 2, n // 2) is the site",
        "sun_earth_scale": "value / 200 = fraction (0.5 % steps); 255 = no data",
        "night_unit": "days; 253 = 253 days or more; 254 = no sunlight in the whole period; 255 = no data",
        "slope_unit": "degrees x 4 (254 = 63.5 deg or more); 255 = no data; LOLA 40 m DEM, steepest 2 x 2 pixel plane within the cell",
        "earth_margin_deg": EARTH_MARGIN,
        "period_utc": [g.meta["start_utc"], f"+{g.n_hours} h"],
        "method": "same as the site card: LOLA LDEM_80S_40M, 1440 azimuth bins, rays up to 200 km, "
                  "hourly SPICE ephemeris (GPU)",
        "sites": {s["id"]: {"lat": s["lat"], "lon": s["lon"]} for s in sites},
    }


def check(g: Gpu, sites: list[dict]) -> bool:
    from horizon import longest_run, site_horizon, visibility_series
    from common import MOON_R_M
    d40 = g.dem
    sd, sa, ea, meta, n = load_year()
    bad = 0
    for s in sites:
        raw = (SQ / f"{s['id']}.bin").read_bytes()
        planes = np.frombuffer(raw, np.uint8).reshape(7, N, N)
        for hi, h in enumerate(HEIGHTS):
            prof, h0 = site_horizon(d40, s["lat"], s["lon"], obs_height_m=h)
            sf, _, _, _, _, ev = visibility_series(prof, s["lat"], s["lon"], MOON_R_M + h0 + h, sd, sa, ea, EARTH_MARGIN)
            night = longest_run(sf == 0.0)
            cpu = encode(np.array([[sf.mean(), ev.mean(), night]]), n, meta["step_s"])[:, 0]
            gpu = planes[3 * hi:3 * hi + 3, N // 2, N // 2]
            ok = np.array_equal(cpu, gpu)
            bad += not ok
            print(f"{s['id']:28s} {h:4.0f} m  CPU sun {cpu[0] / 2:5.1f} earth {cpu[1] / 2:5.1f} night {cpu[2]:3d} | "
                  f"GPU centre {gpu[0] / 2:5.1f} {gpu[1] / 2:5.1f} {gpu[2]:3d}  {'OK' if ok else 'DIFF'}", flush=True)
    print("centre test:", "PASS" if not bad else f"FAIL ({bad})")
    return not bad


def main() -> None:
    sites = json.loads((OUT / "sites.json").read_text(encoding="utf-8"))["sites"]
    if "--only" in sys.argv:
        sites = [s for s in sites if s["id"] == sys.argv[sys.argv.index("--only") + 1]]
    g = Gpu(**SITE_METHOD)
    if "--check" in sys.argv:
        sys.exit(0 if check(g, sites) else 1)
    d40 = g.dem
    SQ.mkdir(parents=True, exist_ok=True)
    all_sites = json.loads((OUT / "sites.json").read_text(encoding="utf-8"))["sites"]
    (SQ / "squares.json").write_text(json.dumps(meta_json(all_sites, g), indent=1))
    t0 = time.perf_counter()
    for i, s in enumerate(sites):
        data = compute_square(g, d40, s["lat"], s["lon"])
        tmp = SQ / f"{s['id']}.bin.tmp"
        tmp.write_bytes(data)
        os.replace(tmp, SQ / f"{s['id']}.bin")
        print(f"  {i + 1}/{len(sites)} {s['id']}  {time.perf_counter() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
