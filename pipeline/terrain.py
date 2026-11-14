"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Terrain height grids for the 3D scene.

All grids live on the LOLA south polar stereographic map (metres, X to lon 90E,
Y to lon 0). Row 0 is the +Y edge, column 0 the -X edge. Values: int16 metres
relative to the 1737.4 km sphere.

  overview.bin   N x N over |x|,|y| <= HALF_KM, box-filtered from LDEM_80S_80M
  site-<id>.bin  TILE x TILE at 40 m around a site, from LDEM_80S_40M

Usage: python terrain.py
"""
from __future__ import annotations

import json

import numpy as np
from numba import njit, prange

from common import OUT
from lola import latlon_to_xy, open_dem, sample_bilinear

HALF_KM = 210.0
N_OVERVIEW = 1024
TILE = 512
TILE_SCALE = 40.0
TERRAIN = OUT / "terrain"


@njit(parallel=True, cache=True)
def _grid(dn, n, scale, x0, y0, step, size, sub):
    """Box-filtered heights: `sub` x `sub` bilinear samples per output cell."""
    out = np.empty((size, size), dtype=np.int16)
    for r in prange(size):
        for c in range(size):
            acc = 0.0
            cnt = 0
            for i in range(sub):
                for j in range(sub):
                    x = x0 + (c + (j + 0.5) / sub) * step
                    y = y0 - (r + (i + 0.5) / sub) * step
                    h = sample_bilinear(dn, n, scale, x, y)
                    if not np.isnan(h):
                        acc += h
                        cnt += 1
            out[r, c] = np.int16(round(acc / cnt)) if cnt else np.int16(-32768)
    return out


def tile_for(dem40, lat: float, lon: float) -> tuple[np.ndarray, dict]:
    """40 m tile centred on the site, snapped to the 40 m grid."""
    x, y = latlon_to_xy(lat, lon)
    half = TILE * TILE_SCALE / 2
    x0 = round((x - half) / TILE_SCALE) * TILE_SCALE
    y0 = round((y + half) / TILE_SCALE) * TILE_SCALE
    grid = _grid(dem40.dn, dem40.n, dem40.scale, x0, y0, TILE_SCALE, TILE, 1)
    return grid, {"x0_m": x0, "y0_m": y0, "step_m": TILE_SCALE, "size": TILE}


def main() -> None:
    TERRAIN.mkdir(parents=True, exist_ok=True)
    d80 = open_dem("ldem_80s_80m")
    step = 2 * HALF_KM * 1000 / N_OVERVIEW
    ov = _grid(d80.dn, d80.n, d80.scale, -HALF_KM * 1000, HALF_KM * 1000, step, N_OVERVIEW, 5)
    (TERRAIN / "overview.bin").write_bytes(ov.astype("<i2").tobytes())
    meta = {"overview": {"x0_m": -HALF_KM * 1000, "y0_m": HALF_KM * 1000, "step_m": step, "size": N_OVERVIEW,
                         "min_m": int(ov.min()), "max_m": int(ov.max()), "source": "LOLA LDEM_80S_80M, box-filtered"},
            "tiles": {}}
    print("overview", ov.shape, ov.min(), ov.max())

    sites = json.loads((OUT / "sites.json").read_text(encoding="utf-8"))["sites"]
    d40 = open_dem("ldem_80s_40m")
    for s in sites:
        grid, info = tile_for(d40, s["lat"], s["lon"])
        (TERRAIN / f"site-{s['id']}.bin").write_bytes(grid.astype("<i2").tobytes())
        meta["tiles"][s["id"]] = info | {"source": "LOLA LDEM_80S_40M"}
    (TERRAIN / "terrain.json").write_text(json.dumps(meta, indent=1))
    print("tiles", len(sites))


if __name__ == "__main__":
    main()
