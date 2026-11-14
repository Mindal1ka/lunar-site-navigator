"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Illumination heatmap with the app's own method (option B):
  * observer 2 m above the LOLA surface
  * Sun %      = mean visible fraction of the solar disk
  * Earth %    = share of hours with Earth centre > horizon + 1 deg antenna margin
  * longest night = longest run of hours with the disk fully hidden
over the default window (first 12 months of static/data/ephem.bin, Nov 2026 - Nov 2027).

Grid: 1 km cells on the south polar stereographic map, |x|,|y| <= HALF_KM, cells
inside the 80S DEM. Horizons for the map use 720 azimuth bins (0.5 deg) and rays
up to 150 km on the 80 m DEM — a faster variant of the site method; agreement with
the full 40 m / 1440-bin site method is checked by `python heatmap.py --check`.

Output (static/data/):
  heatmap.json  grid metadata
  heatmap.bin   uint8 x 3 planes [sun, earth, night]: sun/earth in 0..200 (= 0.5 % steps),
                night in days (0..254, 255 = no data)

Usage: python heatmap.py [--check] [--cell-km 1.0]
"""
from __future__ import annotations

import json
import math
import sys
import time

import numpy as np
from numba import njit, prange

from common import MOON_R_M, OUT, SUN_R_KM
from horizon import _horizon_at, _disk_fraction, horizon_profile, local_frame, _dot, _norm
from lola import latlon_to_xy, open_dem, sample_bilinear, xy_to_latlon

HALF_KM = 210.0
OBS_H = 2.0
N_AZ_MAP = 720
MAX_DIST = 150_000.0
EARTH_MARGIN = 1.0


@njit(cache=True)
def _metrics(prof, lat, lon, r_site_m, sun_dir, sun_au, earth_km, margin):
    up, east, north = local_frame(lat, lon)
    m = sun_dir.shape[0]
    p_km = up * (r_site_m / 1000.0)
    sun_sum = 0.0
    earth_n = 0
    run = 0
    best = 0
    for i in range(m):
        s = sun_dir[i]
        el = math.degrees(math.asin(min(1.0, max(-1.0, _dot(s, up)))))
        az = math.degrees(math.atan2(_dot(s, east), _dot(s, north))) % 360.0
        r_sun = math.degrees(math.asin(SUN_R_KM / (sun_au[i] * 149597870.7)))
        f = _disk_fraction((el - _horizon_at(prof, az)) / r_sun)
        sun_sum += f
        if f == 0.0:
            run += 1
            if run > best:
                best = run
        else:
            run = 0
        e = earth_km[i] - p_km
        n = _norm(e)
        eel = math.degrees(math.asin(min(1.0, max(-1.0, _dot(e, up) / n))))
        eaz = math.degrees(math.atan2(_dot(e, east), _dot(e, north))) % 360.0
        if eel - _horizon_at(prof, eaz) > margin:
            earth_n += 1
    return sun_sum / m, earth_n / m, best


@njit(parallel=True, cache=True)
def _grid(dn, n, scale, lats, lons, sun_dir, sun_au, earth_km, out):
    for k in prange(lats.size):
        x, y = latlon_to_xy(lats[k], lons[k])
        h0 = sample_bilinear(dn, n, scale, x, y)
        if math.isnan(h0):
            out[k, 0] = -1.0
            continue
        prof, _ = horizon_profile(dn, n, scale, lats[k], lons[k], OBS_H, MAX_DIST, N_AZ_MAP)
        s, e, night = _metrics(prof, lats[k], lons[k], MOON_R_M + h0 + OBS_H, sun_dir, sun_au, earth_km,
                               EARTH_MARGIN)
        out[k, 0] = s
        out[k, 1] = e
        out[k, 2] = night


def load_year():
    meta = json.loads((OUT / "ephem.json").read_text())
    rec = np.frombuffer((OUT / "ephem.bin").read_bytes(), dtype="<f4").reshape(-1, 7).astype(np.float64)
    n = int(round(365.25 * 24 * 3600 / meta["step_s"]))
    return (np.ascontiguousarray(rec[:n, 0:3]), np.ascontiguousarray(rec[:n, 3]),
            np.ascontiguousarray(rec[:n, 4:7]), meta, n)


def run(cell_km: float) -> None:
    sun_dir, sun_au, earth, meta, n_hours = load_year()
    dem = open_dem("ldem_80s_80m")
    n_cells = int(round(2 * HALF_KM / cell_km))
    c = (np.arange(n_cells) + 0.5) * cell_km - HALF_KM  # cell centres, km
    xx, yy = np.meshgrid(c * 1000.0, -c * 1000.0)  # row 0 = top (+y, towards lon 0)
    lat, lon = xy_to_latlon(xx.ravel(), yy.ravel())
    out = np.zeros((lat.size, 3))
    t = time.perf_counter()
    _grid(dem.dn, dem.n, dem.scale, np.ascontiguousarray(lat), np.ascontiguousarray(lon),
          sun_dir, sun_au, earth, out)
    print(f"{lat.size} cells in {time.perf_counter() - t:.0f} s")

    valid = out[:, 0] >= 0
    planes = np.full((3, lat.size), 255, dtype=np.uint8)
    planes[0, valid] = np.clip(np.round(out[valid, 0] * 200), 0, 200)
    planes[1, valid] = np.clip(np.round(out[valid, 1] * 200), 0, 200)
    # night: days, 253 = 253 days or more, 254 = no sunlight in the whole period
    days = np.clip(np.round(out[valid, 2] * meta["step_s"] / 86400.0), 0, 253)
    planes[2, valid] = np.where(out[valid, 2] >= n_hours, 254, days)
    (OUT / "heatmap.bin").write_bytes(planes.tobytes())
    (OUT / "heatmap.json").write_text(json.dumps({
        "cell_km": cell_km, "n": n_cells, "half_km": HALF_KM,
        "layout": "3 planes [sun, earth, night], row-major, row 0 at +y (towards lon 0), col 0 at -x",
        "sun_earth_scale": "value / 200 = fraction (0.5 % steps); 255 = no data",
        "night_unit": "days; 253 = 253 days or more; 254 = no sunlight in the whole period; 255 = no data",
        "observer_height_m": OBS_H, "earth_margin_deg": EARTH_MARGIN,
        "period_utc": [meta["start_utc"], f"+{n_hours} h"],
        "method": "LOLA LDEM_80S_80M, 720 azimuth bins, rays up to 150 km, hourly SPICE ephemeris",
    }, indent=1))


def check(n_points: int = 40) -> None:
    """Compare the fast map method with the full site method at random cells."""
    from horizon import site_horizon, visibility_series, longest_run
    sun_dir, sun_au, earth, meta, _ = load_year()
    d80, d40 = open_dem("ldem_80s_80m"), open_dem("ldem_80s_40m")
    rng = np.random.default_rng(7)
    diffs = []
    while len(diffs) < n_points:
        x, y = rng.uniform(-HALF_KM, HALF_KM, 2) * 1000
        lat, lon = xy_to_latlon(x, y)
        h80 = sample_bilinear(d80.dn, d80.n, d80.scale, x, y)
        if math.isnan(h80):
            continue
        prof, _ = horizon_profile(d80.dn, d80.n, d80.scale, lat, lon, OBS_H, MAX_DIST, N_AZ_MAP)
        s_fast, e_fast, _ = _metrics(prof, lat, lon, MOON_R_M + h80 + OBS_H, sun_dir, sun_au, earth, EARTH_MARGIN)
        p2, h40 = site_horizon(d40, lat, lon, obs_height_m=OBS_H)
        sf, *_r, ev = visibility_series(p2, lat, lon, MOON_R_M + h40 + OBS_H, sun_dir, sun_au, earth, EARTH_MARGIN)
        diffs.append((s_fast - sf.mean(), e_fast - ev.mean()))
    d = np.array(diffs) * 100
    for i, k in enumerate(("sun", "earth")):
        print(f"{k}: bias {d[:, i].mean():+.2f} pp, MAE {np.abs(d[:, i]).mean():.2f} pp, "
              f"p90 {np.percentile(np.abs(d[:, i]), 90):.2f} pp (fast map vs full site method, n={len(d)})")


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    else:
        cell = float(sys.argv[sys.argv.index("--cell-km") + 1]) if "--cell-km" in sys.argv else 1.0
        run(cell)
