"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Terrain horizon and Sun / Earth visibility for a lunar south-pole site.

Reference implementation (Python + numba). The browser version in
src/lib/ must reproduce these numbers; see pipeline/validate_*.py.

Geometry
--------
* Moon is the LOLA sphere R = 1737.4 km plus DEM heights; everything is done
  with exact 3D vectors in MOON_ME, so lunar curvature is included.
* Local frame at the site: up = radial unit vector, east = z x up,
  north = up x east. Azimuth is measured from north, clockwise (towards east).
  Elevations are relative to the plane perpendicular to the radial direction,
  the same convention JPL Horizons uses for surface sites.
* Horizon: for each azimuth bin we march along the great circle on the sphere,
  sample the DEM (bilinear), and keep the maximum elevation angle of terrain
  seen from the observer (site height + observer/mast height).

Visibility
----------
* Sun: fraction of the solar disk above the local horizon (0..1), treating the
  horizon as locally straight across the ~0.53 deg disk (circular segment).
* Earth: centre of Earth above horizon + antenna margin (deg).
"""
from __future__ import annotations

import math

import numpy as np
from numba import njit

from common import MOON_R_M, SUN_R_KM
from lola import Dem, latlon_to_xy, sample_bilinear, xy_to_latlon

N_AZ = 1440  # 0.25 deg azimuth bins


@njit(cache=True)
def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


@njit(cache=True)
def _norm(a):
    return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


@njit(cache=True)
def _cross(a, b):
    return np.array([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]])


@njit(cache=True)
def _unit_from_latlon(lat_deg, lon_deg):
    la = math.radians(lat_deg)
    lo = math.radians(lon_deg)
    return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])


@njit(cache=True)
def local_frame(lat_deg, lon_deg):
    up = _unit_from_latlon(lat_deg, lon_deg)
    z = np.array([0.0, 0.0, 1.0])
    east = _cross(z, up)
    east /= _norm(east)
    north = _cross(up, east)
    return up, east, north


@njit(cache=True)
def _height_at_unit(dn, n, scale, v):
    lat = math.degrees(math.asin(v[2]))
    lon = math.degrees(math.atan2(v[1], v[0])) % 360.0
    x, y = latlon_to_xy(lat, lon)
    return sample_bilinear(dn, n, scale, x, y)


@njit(cache=True)
def horizon_profile(dn, n, scale, lat_deg, lon_deg, obs_height_m, max_dist_m, n_az):
    """Max terrain elevation angle (deg) per azimuth bin seen from the site."""
    up, east, north = local_frame(lat_deg, lon_deg)
    h0 = _height_at_unit(dn, n, scale, up)
    p = up * (MOON_R_M + h0 + obs_height_m)
    out = np.full(n_az, -90.0)
    for k in range(n_az):
        az = 2.0 * math.pi * (k + 0.5) / n_az
        d = np.cos(az) * north + np.sin(az) * east  # tangent direction
        best = -1.0  # sin of max elevation
        dist = scale * 0.5
        while dist < max_dist_m:
            th = dist / MOON_R_M
            q_dir = math.cos(th) * up + math.sin(th) * d
            h = _height_at_unit(dn, n, scale, q_dir)
            if math.isnan(h):
                break  # left the DEM
            q = q_dir * (MOON_R_M + h)
            v = q - p
            s = _dot(v, up) / _norm(v)
            if s > best:
                best = s
            # step grows with distance: fine near the site, ~0.2% of range far out
            step = max(scale * 0.5, min(dist * 0.0025, 4.0 * scale))
            dist += step
        out[k] = math.degrees(math.asin(best))
    return out, h0


@njit(cache=True)
def _horizon_at(prof, az_deg):
    n_az = prof.size
    f = (az_deg % 360.0) / 360.0 * n_az - 0.5
    i0 = int(math.floor(f))
    t = f - i0
    a = prof[i0 % n_az]
    b = prof[(i0 + 1) % n_az]
    return a + (b - a) * t


@njit(cache=True)
def _disk_fraction(u):
    """Visible fraction of a disk whose centre is u radii above a straight edge."""
    if u >= 1.0:
        return 1.0
    if u <= -1.0:
        return 0.0
    return 1.0 - (math.acos(u) - u * math.sqrt(1.0 - u * u)) / math.pi


@njit(cache=True)
def visibility_series(prof, lat_deg, lon_deg, site_radius_m, sun_dir, sun_dist_au, earth_km,
                      earth_margin_deg):
    """Per-time Sun disk fraction, Sun elev/az, Earth elev/az and visibility flag."""
    up, east, north = local_frame(lat_deg, lon_deg)
    m = sun_dir.shape[0]
    sun_frac = np.empty(m)
    sun_el = np.empty(m)
    sun_az = np.empty(m)
    earth_el = np.empty(m)
    earth_az = np.empty(m)
    earth_vis = np.empty(m, dtype=np.bool_)
    p_km = up * (site_radius_m / 1000.0)
    for i in range(m):
        s = sun_dir[i]
        el = math.degrees(math.asin(min(1.0, max(-1.0, _dot(s, up)))))
        az = math.degrees(math.atan2(_dot(s, east), _dot(s, north))) % 360.0
        r_sun = math.degrees(math.asin(SUN_R_KM / (sun_dist_au[i] * 149597870.7)))
        hor = _horizon_at(prof, az)
        sun_frac[i] = _disk_fraction((el - hor) / r_sun)
        sun_el[i] = el
        sun_az[i] = az

        e = earth_km[i] - p_km
        e = e / _norm(e)
        eel = math.degrees(math.asin(min(1.0, max(-1.0, _dot(e, up)))))
        eaz = math.degrees(math.atan2(_dot(e, east), _dot(e, north))) % 360.0
        earth_el[i] = eel
        earth_az[i] = eaz
        earth_vis[i] = eel - _horizon_at(prof, eaz) > earth_margin_deg
    return sun_frac, sun_el, sun_az, earth_el, earth_az, earth_vis


def longest_run(mask: np.ndarray) -> int:
    """Length (samples) of the longest run of True values."""
    best = cur = 0
    for v in mask:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best


def site_horizon(dem: Dem, lat: float, lon: float, obs_height_m: float = 2.0,
                 max_dist_m: float = 200_000.0, n_az: int = N_AZ):
    """Horizon profile (deg per azimuth bin) and DEM height (m) at the site.

    Rays stop at the DEM edge (-80 deg for LDEM_80S). For the curated sites this
    does not change any metric (checked by filling the missing terrain with up to
    +8 km); for custom points north of about -81.5 deg the UI shows a warning.
    """
    if not np.isfinite(_site_height(dem, lat, lon)):
        raise ValueError(f"site {lat}, {lon} is outside the DEM ({dem.path.name})")
    prof, h0 = horizon_profile(dem.dn, dem.n, dem.scale, lat, lon, obs_height_m, max_dist_m, n_az)
    return prof, float(h0)


def _site_height(dem: Dem, lat: float, lon: float) -> float:
    x, y = latlon_to_xy(lat, lon)
    return sample_bilinear(dem.dn, dem.n, dem.scale, x, y)
