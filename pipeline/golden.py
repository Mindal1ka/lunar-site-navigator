"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Golden values for the TypeScript engine (src/lib/engine). Uses exactly the
browser inputs (ephem.bin float32, horizons.bin int16 1/100 deg) and the Python
reference functions, so the TS port must agree to rounding.

Usage: python golden.py   -> tests/golden.json
"""
import json

import numpy as np

from common import OUT, ROOT
from horizon import longest_run, visibility_series

meta = json.loads((OUT / "ephem.json").read_text())
rec = np.frombuffer((OUT / "ephem.bin").read_bytes(), dtype="<f4").reshape(-1, 7).astype(np.float64)
sites = json.loads((OUT / "sites.json").read_text(encoding="utf-8"))
hz = np.frombuffer((OUT / "horizons.bin").read_bytes(), dtype="<i2").reshape(
    len(sites["sites"]), len(sites["heights_m"]), sites["n_az"]).astype(np.float64) / 100.0

cases = []
for sid in ("connecting-ridge-c1", "malapert-massif", "im2-athena", "shackleton-floor"):
    i = next(k for k, s in enumerate(sites["sites"]) if s["id"] == sid)
    s = sites["sites"][i]
    for hi, h in enumerate(sites["heights_m"]):
        if h not in (0, 2, 10):
            continue
        for i0, i1 in ((0, 8766), (1000, 1000 + 709)):
            r = 1737400.0 + s["elevation_m"] + h
            sf, sel, saz, eel, eaz, ev = visibility_series(hz[i, hi], s["lat"], s["lon"], r, rec[i0:i1, 0:3],
                                                           rec[i0:i1, 3], rec[i0:i1, 4:7], 1.0)
            cases.append({"site": sid, "height_m": h, "i0": i0, "i1": i1,
                          "sun_mean": float(sf.mean()), "earth_frac": float(ev.mean()),
                          "longest_night_h": int(longest_run(sf == 0)),
                          "sample": [{"i": int(k), "sun_frac": float(sf[k]), "sun_el": float(sel[k]),
                                      "sun_az": float(saz[k]), "earth_el": float(eel[k]), "earth_az": float(eaz[k])}
                                     for k in (0, 123, 456)]})
(ROOT / "tests").mkdir(exist_ok=True)
(ROOT / "tests" / "golden.json").write_text(json.dumps(cases, indent=1))
print(len(cases), "cases")
