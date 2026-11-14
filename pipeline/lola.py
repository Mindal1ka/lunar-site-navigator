"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Reader for LOLA south-polar stereographic DEMs (PDS LDEM_80S_*.IMG).

Projection per PDS catalog file DSMAP_POLAR.CAT (rev. 2022-01-15), southern
hemisphere, 1-based sample I / line J, N pixels per side, scale s (m/px):

    X = (I - N/2 - 0.5) * s
    Y = -(J - N/2 - 0.5) * s          (Y points Earthward, i.e. to lon 0)
    lon = atan2(X, Y)                 (east longitude)
    lat = -90 + 2*atan(R / (2*1737400))   with R = hypot(X, Y)

Map orientation: lon 0 straight up from the pole, lon 90E to the right.
Heights: DN * 0.5 m relative to a 1737.4 km sphere.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numba import njit

from common import LOLA_DIR, MOON_R_M


@dataclass
class Dem:
    path: Path
    n: int  # pixels per side
    scale: float  # metres per pixel
    max_lat: float  # map edge latitude (e.g. -80)
    dn: np.ndarray  # int16 memmap (n, n), row = line

    @property
    def heights_scale(self) -> float:
        return 0.5


def _label_value(text: str, key: str) -> str:
    m = re.search(rf"^\s*{key}\s*=\s*(.+?)\s*$", text, re.MULTILINE)
    if not m:
        raise KeyError(key)
    return m.group(1).split("<")[0].strip().strip('"')


def open_dem(name: str = "ldem_80s_40m") -> Dem:
    lbl = (LOLA_DIR / f"{name}.lbl").read_text()
    n = int(_label_value(lbl, "LINES"))
    assert n == int(_label_value(lbl, "LINE_SAMPLES"))
    assert _label_value(lbl, "SAMPLE_TYPE") == "LSB_INTEGER"
    assert float(_label_value(lbl, "SCALING_FACTOR")) == 0.5
    assert float(_label_value(lbl, "OFFSET")) == MOON_R_M
    assert _label_value(lbl, "KEYWORD_LATITUDE_TYPE") == "PLANETOCENTRIC"
    scale = float(_label_value(lbl, "MAP_SCALE"))
    max_lat = float(_label_value(lbl, "MAXIMUM_LATITUDE"))
    path = LOLA_DIR / f"{name}.img"
    dn = np.memmap(path, dtype="<i2", mode="r", shape=(n, n))
    return Dem(path=path, n=n, scale=scale, max_lat=max_lat, dn=dn)


# ---------------------------------------------------------------- projection
@njit(cache=True)
def latlon_to_xy(lat_deg, lon_deg):
    """Planetocentric lat/lon (deg, south hemisphere) -> map X, Y (m)."""
    colat = np.radians(90.0 + lat_deg)  # angular distance from south pole
    r = 2.0 * MOON_R_M * np.tan(0.5 * colat)
    lon = np.radians(lon_deg)
    return r * np.sin(lon), r * np.cos(lon)


@njit(cache=True)
def xy_to_latlon(x, y):
    r = np.hypot(x, y)
    lat = -90.0 + np.degrees(2.0 * np.arctan(0.5 * r / MOON_R_M))
    lon = np.degrees(np.arctan2(x, y)) % 360.0
    return lat, lon


@njit(cache=True)
def xy_to_pixel(x, y, n, scale):
    """Map X, Y -> fractional 0-based (col, row) of pixel centres."""
    col = x / scale + n / 2.0 - 0.5
    row = -y / scale + n / 2.0 - 0.5
    return col, row


@njit(cache=True)
def sample_bilinear(dn, n, scale, x, y):
    """Height (m, relative to 1737.4 km) at map X, Y; NaN outside the grid."""
    col, row = xy_to_pixel(x, y, n, scale)
    c0 = int(np.floor(col))
    r0 = int(np.floor(row))
    if c0 < 0 or r0 < 0 or c0 + 1 >= n or r0 + 1 >= n:
        return np.nan
    fc = col - c0
    fr = row - r0
    h00 = dn[r0, c0]
    h01 = dn[r0, c0 + 1]
    h10 = dn[r0 + 1, c0]
    h11 = dn[r0 + 1, c0 + 1]
    top = h00 + (h01 - h00) * fc
    bot = h10 + (h11 - h10) * fc
    return 0.5 * (top + (bot - top) * fr)


def height_at(dem: Dem, lat: float, lon: float) -> float:
    x, y = latlon_to_xy(lat, lon)
    return float(sample_bilinear(dem.dn, dem.n, dem.scale, x, y))
