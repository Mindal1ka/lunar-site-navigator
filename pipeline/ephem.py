"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Pre-compute Sun and Earth positions in the Moon body-fixed frame (NAIF SPICE).

Output (static/data/):
  ephem.json  metadata: start time, step, count, frame, aberration corrections
  ephem.bin   little-endian float32, `count` records of 7 values:
              sun_dir_x, sun_dir_y, sun_dir_z   unit vector Moon centre -> Sun
              sun_dist_au                      Moon centre -> Sun distance (AU)
              earth_x, earth_y, earth_z         Moon centre -> Earth centre (km)

All vectors are in MOON_ME (= MOON_ME_DE440_ME421, the frame of LOLA DEMs),
apparent (light time + stellar aberration, 'LT+S') as seen from the Moon's
centre. The browser subtracts the site position from the Earth vector, so the
~0.26 deg topocentric parallax of Earth is handled exactly; for the Sun the
parallax (< 3 arcsec) is negligible.

Usage: python ephem.py [START_UTC] [END_UTC] [STEP_MINUTES]
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

import numpy as np
import spiceypy as sp

from common import AU_KM, KERNELS, MOON_FRAME, OUT, SPICE_DIR


def furnish() -> None:
    sp.kclear()
    for k in KERNELS:
        sp.furnsh(str(SPICE_DIR / k))


def utc_to_et(utc: str) -> float:
    return sp.str2et(utc)


def body_vectors(et: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Apparent Sun and Earth position vectors (km) from Moon centre, MOON_ME."""
    sun = np.empty((et.size, 3))
    earth = np.empty((et.size, 3))
    for i, t in enumerate(et):
        sun[i], _ = sp.spkpos("SUN", t, MOON_FRAME, "LT+S", "MOON")
        earth[i], _ = sp.spkpos("EARTH", t, MOON_FRAME, "LT+S", "MOON")
    return sun, earth


def build(start_utc: str, end_utc: str, step_min: float) -> dict:
    furnish()
    t0 = datetime.fromisoformat(start_utc).replace(tzinfo=timezone.utc)
    t1 = datetime.fromisoformat(end_utc).replace(tzinfo=timezone.utc)
    step_s = step_min * 60.0
    count = int((t1 - t0).total_seconds() // step_s) + 1
    et0 = utc_to_et(t0.strftime("%Y-%m-%dT%H:%M:%S"))
    # Uniform grid in UTC seconds; ET offsets differ from UTC only by
    # leap seconds, and none are scheduled in this window (naif0012.tls).
    et = et0 + np.arange(count) * step_s
    sun, earth = body_vectors(et)

    sun_dist = np.linalg.norm(sun, axis=1)
    rec = np.empty((count, 7), dtype="<f4")
    rec[:, 0:3] = sun / sun_dist[:, None]
    rec[:, 3] = sun_dist / AU_KM
    rec[:, 4:7] = earth

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "ephem.bin").write_bytes(rec.tobytes())
    meta = {
        "start_utc": t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "start_unix": int(t0.timestamp()),
        "step_s": step_s,
        "count": count,
        "record": ["sun_dir_x", "sun_dir_y", "sun_dir_z", "sun_dist_au",
                   "earth_x_km", "earth_y_km", "earth_z_km"],
        "dtype": "float32-le",
        "frame": "MOON_ME (MOON_ME_DE440_ME421, = LOLA 'Mean Earth/Polar Axis of DE421')",
        "observer": "Moon centre",
        "correction": "LT+S (apparent)",
        "kernels": KERNELS,
        "source": "NASA/JPL NAIF SPICE generic kernels, https://naif.jpl.nasa.gov/pub/naif/generic_kernels/",
    }
    (OUT / "ephem.json").write_text(json.dumps(meta, indent=2))
    return meta


if __name__ == "__main__":
    start = sys.argv[1] if len(sys.argv) > 1 else "2026-11-01T00:00:00"
    end = sys.argv[2] if len(sys.argv) > 2 else "2031-01-01T00:00:00"
    step = float(sys.argv[3]) if len(sys.argv) > 3 else 60.0
    m = build(start, end, step)
    print(json.dumps({k: m[k] for k in ("start_utc", "step_s", "count")}))
