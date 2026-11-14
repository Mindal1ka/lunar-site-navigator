"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Validation 3: statistical comparison with the NASA LOLA average-visibility
maps AVGVISIB_85S_060M_201608 (Sun) and ..._EARTH (Mazarico et al. 2011,
PGDA product 69; PDS extras, "not supported by the PDS or the LOLA team").

Map definition (label): fraction of timesteps in which ANY part of the solar
(Earth) disc is above the horizon, at the surface, ~18.6-year average, from
the 60 m LOLA DEM. We compute the same quantity at the same map pixel centres:
  Sun:   fraction of hours with visible disk fraction > 0
  Earth: fraction of hours with Earth centre above horizon - Earth radius
         (~0.95 deg, "any part of the disc"), no antenna margin
over 2017-01-01 + 18.6 years, observer at the surface (0 m) on our 40 m DEM.

Usage: python validate_map.py [N_POINTS] [OBSERVER_HEIGHT_M]   (the maps are at the surface: use 0)
"""
from __future__ import annotations

import json
import math
import sys

import numpy as np

from common import RAW, WORK
from horizon import site_horizon, visibility_series
from lola import open_dem, xy_to_latlon
from validate_points import ephemeris

N_MAP, SCALE_MAP = 5058, 60.0


def load_map(name: str) -> np.ndarray:
    return np.memmap(RAW / "illum" / f"{name}.img", dtype="<i2", mode="r", shape=(N_MAP, N_MAP))


def main(n_points: int = 150, obs_height_m: float = 0.0) -> None:
    sun_map = load_map("avgvisib_85s_060m_201608")
    earth_map = load_map("avgvisib_85s_060m_201608_earth")
    sd, sa, ea = ephemeris("2017-01-01T00:00:00", "2037-01-01T00:00:00")
    m = int(18.6 * 365.25 * 24)
    sd, sa, ea = sd[:m], sa[:m], ea[:m]
    dem = open_dem("ldem_80s_40m")

    rng = np.random.default_rng(2026)
    pts = []
    while len(pts) < n_points:
        col, row = rng.integers(0, N_MAP, 2)
        x, y = (col - 2528.5) * SCALE_MAP, -(row - 2528.5) * SCALE_MAP
        lat, lon = xy_to_latlon(x, y)
        if -89.8 < lat < -85.2:
            pts.append((int(col), int(row), float(lat), float(lon)))

    out = []
    for i, (col, row, lat, lon) in enumerate(pts):
        prof, h0 = site_horizon(dem, lat, lon, obs_height_m=obs_height_m)
        r = 1737400.0 + h0 + obs_height_m
        e_dist = np.linalg.norm(ea, axis=1).mean()
        earth_r_deg = math.degrees(math.asin(6378.137 / e_dist))
        sf, sel, saz, eel, eaz, ev = visibility_series(prof, lat, lon, r, sd, sa, ea, -earth_r_deg)
        out.append({"lat": lat, "lon": lon,
                    "sun_map": float(sun_map[row, col]) * 4e-5, "sun_ours": float((sf > 0).mean()),
                    "earth_map": float(earth_map[row, col]) * 4e-5, "earth_ours": float(ev.mean())})
        if (i + 1) % 25 == 0:
            print(f"{i + 1}/{len(pts)}", flush=True)

    res = {}
    for k in ("sun", "earth"):
        a = np.array([o[f"{k}_map"] for o in out]) * 100
        b = np.array([o[f"{k}_ours"] for o in out]) * 100
        d = b - a
        res[k] = {"n": len(a), "bias_pp": float(d.mean()), "mae_pp": float(np.abs(d).mean()),
                  "median_abs_pp": float(np.median(np.abs(d))), "p90_abs_pp": float(np.percentile(np.abs(d), 90)),
                  "pearson_r": float(np.corrcoef(a, b)[0, 1])}
        print(f"{k:5s} n={len(a)} bias {d.mean():+.2f} pp  MAE {np.abs(d).mean():.2f} pp  median|d| "
              f"{np.median(np.abs(d)):.2f}  p90|d| {np.percentile(np.abs(d), 90):.2f}  r={res[k]['pearson_r']:.3f}")
    (WORK / f"validation_map_{obs_height_m:g}m.json").write_text(json.dumps({"summary": res, "points": out}, indent=1))


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 150, float(sys.argv[2]) if len(sys.argv) > 2 else 0.0)
