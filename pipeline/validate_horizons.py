"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Validation 1: our Sun/Earth azimuth & elevation (sphere horizon, no terrain)
versus JPL Horizons for sites on the lunar surface.

Horizons conventions (manual + API column notes): site coordinates in the
Moon Mean-Earth frame of DE421 on a 1737.4 km sphere, airless apparent az/el
of the target centre, azimuth clockwise from north, elevation relative to the
plane perpendicular to the local zenith. Fair use: one request at a time,
results cached in data/work/horizons/.

Usage: python validate_horizons.py
"""
from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request

import numpy as np
import spiceypy as sp

from common import MOON_FRAME, MOON_R_M, WORK
from ephem import furnish

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
UA = "lunar-site-navigator/0.1 (+https://github.com/Mindal1ka/lunar-site-navigator)"
CACHE = WORK / "horizons"

SITES = {
    "Connecting Ridge C1": (-89.4398, 222.83),
    "Malapert Massif": (-86.0, 0.3),
    "Peak near Cabeus B": (-83.6, 291.2),
}
START, STOP, STEP = "2026-12-01", "2030-12-01", "5 d"


def horizons(body: str, lat: float, lon: float) -> list[tuple[str, float, float]]:
    CACHE.mkdir(parents=True, exist_ok=True)
    key = f"{body}_{lat:+.4f}_{lon:.4f}_{START}_{STOP}_{STEP.replace(' ', '')}.txt"
    f = CACHE / key
    if not f.exists():
        q = {
            "format": "text", "COMMAND": f"'{body}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
            "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
            "SITE_COORD": f"'{lon},{lat},0'", "START_TIME": f"'{START}'", "STOP_TIME": f"'{STOP}'",
            "STEP_SIZE": f"'{STEP}'", "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'", "CSV_FORMAT": "'YES'",
            "TIME_DIGITS": "'MINUTES'",
        }
        url = API + "?" + urllib.parse.urlencode(q, safe="'")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            f.write_text(r.read().decode())
        time.sleep(1.0)  # be polite: sequential requests only
    text = f.read_text()
    if "$$SOE" not in text:
        raise RuntimeError(text[:2000])
    rows = []
    for line in text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        rows.append((parts[0], float(parts[3]), float(parts[4])))
    return rows


def ours(body: str, lat: float, lon: float, utc: str) -> tuple[float, float]:
    et = sp.str2et(utc)
    la, lo = math.radians(lat), math.radians(lon)
    up = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    east = np.cross([0, 0, 1.0], up); east /= np.linalg.norm(east)
    north = np.cross(up, east)
    v, _ = sp.spkpos(body, et, MOON_FRAME, "LT+S", "MOON")
    v = np.asarray(v) - up * MOON_R_M / 1000.0
    v /= np.linalg.norm(v)
    el = math.degrees(math.asin(v @ up))
    az = math.degrees(math.atan2(v @ east, v @ north)) % 360.0
    return az, el


def main() -> None:
    furnish()
    report = {}
    for name, (lat, lon) in SITES.items():
        for body, label in (("10", "SUN"), ("399", "EARTH")):
            rows = horizons(body, lat, lon)
            d_el, d_az = [], []
            for t, az_h, el_h in rows:
                az_o, el_o = ours(label, lat, lon, t.replace("A.D. ", ""))
                d_el.append(el_o - el_h)
                d_az.append(((az_o - az_h + 180) % 360 - 180) * math.cos(math.radians(el_h)))
            d_el, d_az = np.abs(d_el), np.abs(d_az)
            r = {"n": len(rows), "max_del_arcsec": float(d_el.max() * 3600),
                 "max_daz_cos_el_arcsec": float(d_az.max() * 3600),
                 "rms_del_arcsec": float(np.sqrt((d_el ** 2).mean()) * 3600)}
            report[f"{name} / {label}"] = r
            print(f"{name:22s} {label:5s} n={r['n']:3d}  |dEl| max {r['max_del_arcsec']:6.1f}\"  "
                  f"rms {r['rms_del_arcsec']:6.1f}\"  |dAz·cos el| max {r['max_daz_cos_el_arcsec']:6.1f}\"")
    (WORK / "validation_horizons.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
