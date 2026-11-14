"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Quick check: horizon + one-year Sun/Earth statistics for a few sites.

Usage: python try_site.py
"""
import json
import time

import numpy as np

from common import OUT
from horizon import longest_run, site_horizon, visibility_series
from lola import open_dem

meta = json.loads((OUT / "ephem.json").read_text())
rec = np.frombuffer((OUT / "ephem.bin").read_bytes(), dtype="<f4").reshape(-1, 7).astype(np.float64)
step_h = meta["step_s"] / 3600.0
year = slice(0, int(365.25 * 24 / step_h))  # Nov 2026 - Nov 2027

dem = open_dem("ldem_80s_40m")
SITES = {
    "Shackleton crater floor": (-89.67, 129.78),
    "Shackleton rim (approx.)": (-89.45, 222.69),
    "Malapert massif (approx.)": (-85.99, 2.93),
}
for name, (lat, lon) in SITES.items():
    t = time.perf_counter()
    prof, h0 = site_horizon(dem, lat, lon, obs_height_m=2.0)
    t_h = time.perf_counter() - t
    r = 1737400.0 + h0 + 2.0
    sf, sel, saz, eel, eaz, ev = visibility_series(
        prof, lat, lon, r, rec[year, 0:3], rec[year, 3], rec[year, 4:7], 1.0)
    print(f"{name:28s} h={h0:7.0f} m  horizon {t_h*1000:6.0f} ms | "
          f"Sun {sf.mean()*100:5.1f}%  longest night {longest_run(sf == 0)*step_h/24:5.1f} d | "
          f"Earth {ev.mean()*100:5.1f}%  | horizon max {prof.max():4.1f} deg, sun el range "
          f"{sel.min():4.1f}..{sel.max():4.1f}")
