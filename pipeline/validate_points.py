"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Validation 2: terrain-aware illumination at published high-illumination points.

Reference values (all time averages of the VISIBLE FRACTION OF THE SOLAR DISK,
hourly, LOLA 20 m DTM):
  * Gläser et al. 2018, PSS 162 (NTRS 20170007365), 2017-01-01..2037-01-01,
    Table 1 (surface) and Table 2 (2 m above ground).
  * Gläser et al. EPSC2014-136-1, Connecting Ridge spots, ~19-20 years
    (we use 2017-2037 as the closest common window), plus longest darkness.

Our model uses the 40 m LOLA DEM, so differences of a few percent at sharp
ridge-top maxima are expected; the comparison is reported as-is.

Usage: python validate_points.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import numpy as np
import spiceypy as sp

from common import AU_KM, WORK
from ephem import body_vectors, furnish
from horizon import longest_run, site_horizon, visibility_series
from lola import open_dem

REF = [
    # name, lat, lon_east, observer height m, published avg illumination %, source
    ("Connecting Ridge C1 (2 m)", -89.4398, 222.83, 2.0, 88.0, "Gläser 2018 Tab.2"),
    ("Connecting Ridge C2 (2 m)", -89.3130, 245.98, 2.0, 78.1, "Gläser 2018 Tab.2"),
    ("Shackleton rim S1 (2 m)", -89.6866, 197.19, 2.0, 85.5, "Gläser 2018 Tab.2"),
    ("Shackleton rim S2 (2 m)", -89.7815, 204.70, 2.0, 82.1, "Gläser 2018 Tab.2"),
    ("Connecting Ridge C1 (surface)", -89.4505, 222.84, 0.0, 76.0, "Gläser 2018 Tab.1"),
    ("Connecting Ridge C2 (surface)", -89.3157, 245.94, 0.0, 75.6, "Gläser 2018 Tab.1"),
    ("Shackleton rim (surface)", -89.7849, 203.97, 0.0, 81.0, "Gläser 2018 Tab.1"),
    ("EPSC2014 spot 1 (2 m)", -89.4395, 222.8066, 2.0, 88.1, "Gläser EPSC2014; longest dark 4.58 d"),
    ("EPSC2014 spot 3 (10 m)", -89.4516, 222.7581, 10.0, 92.5, "Gläser EPSC2014; longest dark 3.08 d"),
]


def ephemeris(start: str, end: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    cache = WORK / f"ephem_{start[:4]}_{end[:4]}.npz"
    if cache.exists():
        z = np.load(cache)
        return z["sun_dir"], z["sun_au"], z["earth"]
    furnish()
    t0 = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
    t1 = datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
    n = int((t1 - t0).total_seconds() // 3600)
    et = sp.str2et(start) + np.arange(n) * 3600.0
    sun, earth = body_vectors(et)
    d = np.linalg.norm(sun, axis=1)
    WORK.mkdir(parents=True, exist_ok=True)
    np.savez(cache, sun_dir=sun / d[:, None], sun_au=d / AU_KM, earth=earth)
    return sun / d[:, None], d / AU_KM, earth


def main() -> None:
    sun_dir, sun_au, earth = ephemeris("2017-01-01T00:00:00", "2037-01-01T00:00:00")
    dem = open_dem("ldem_80s_40m")
    rows = []
    print(f"{'site':32s} {'ours %':>7s} {'paper %':>7s} {'diff':>6s} {'any-Sun %':>9s} {'longest dark d':>14s}")
    for name, lat, lon, h, ref, src in REF:
        prof, h0 = site_horizon(dem, lat, lon, obs_height_m=h)
        sf, *_ = visibility_series(prof, lat, lon, 1737400.0 + h0 + h, sun_dir, sun_au, earth, 1.0)
        ours = sf.mean() * 100
        anysun = (sf > 0).mean() * 100
        dark_d = longest_run(sf == 0) / 24
        rows.append({"site": name, "lat": lat, "lon_east": lon, "height_m": h, "ours_pct": round(ours, 2),
                     "published_pct": ref, "diff_pct": round(ours - ref, 2), "any_sun_pct": round(anysun, 2),
                     "longest_dark_days": round(dark_d, 2), "source": src})
        print(f"{name:32s} {ours:7.1f} {ref:7.1f} {ours - ref:+6.1f} {anysun:9.1f} {dark_d:14.2f}")
    diffs = np.array([r["diff_pct"] for r in rows])
    print(f"\nmean diff {diffs.mean():+.2f} pp, mean |diff| {np.abs(diffs).mean():.2f} pp, max |diff| {np.abs(diffs).max():.2f} pp")
    (WORK / "validation_points.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
