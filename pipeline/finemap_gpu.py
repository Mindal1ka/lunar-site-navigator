"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Fine illumination map of the whole region on the GPU, written as small tiles for the browser.

Same method and definitions as heatmap.py / heatmap_gpu.py (80 m LOLA DEM, 720 azimuth bins,
rays up to 150 km, 2 m panel height, first 12 months of the hourly ephemeris), on a 100 m grid
over |x|, |y| <= 210 km, split into 10 x 10 km tiles of 100 x 100 cells.

Tile file static/data/fine/<row>_<col>.bin: uint8 x 4 planes [sun, earth, night, slope], row-major,
row 0 at +y (towards lon 0), col 0 at -x:
  sun, earth  value / 200 = fraction (0.5 % steps), 255 = no data
  night       days; 253 = 253 days or more; 254 = no sunlight in the whole period; 255 = no data
  slope       degrees x 4 (0.25 deg steps, 254 = 63.5 deg or more), 255 = no data;
              from the 40 m LOLA DEM: steepest 2 x 2 pixel plane within the cell (see slope_deg)

The run is resumable (existing tiles are skipped) and can be split between machines:
  python finemap_gpu.py --part 0/2   and   python finemap_gpu.py --part 1/2
take interleaved tiles; copy the tiles into one static/data/fine folder afterwards.
Usage: python finemap_gpu.py [--part i/n] [--reverse] [--limit N] [--batch 1024]
"""
from __future__ import annotations

import json
import os
import sys
import time

import numpy as np

from common import MOON_R_M, OUT
from heatmap import EARTH_MARGIN, HALF_KM, OBS_H
from heatmap_gpu import Gpu
from lola import open_dem, xy_to_latlon

CELL_M = 100.0
TILE_CELLS = 100
FINE = OUT / "fine"


def encode(out: np.ndarray, n_hours: int, step_s: float) -> np.ndarray:
    """(N, 3) metrics -> (3, N) uint8 planes, same encoding as heatmap.bin."""
    valid = out[:, 0] >= 0
    p = np.full((3, out.shape[0]), 255, np.uint8)
    p[0, valid] = np.clip(np.round(out[valid, 0] * 200), 0, 200)
    p[1, valid] = np.clip(np.round(out[valid, 1] * 200), 0, 200)
    days = np.clip(np.round(out[valid, 2] * step_s / 86400.0), 0, 253)
    p[2, valid] = np.where(out[valid, 2] >= n_hours, 254, days)
    return p


def slope_deg(dn: np.ndarray, n: int, scale: float, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Surface slope (deg) of the cell at map x, y: the steepest of the four planes fitted to the
    2 x 2 pixel quads of the 3 x 3 pixel block around the nearest pixel (40 m DEM: ~120 m footprint,
    80 m baselines). A plain central difference reads ~0 on top of a symmetric ridge, where both
    flanks are steep; the steepest quad does not."""
    col = np.rint(x / scale + n / 2.0 - 0.5).astype(np.int64)
    row = np.rint(-y / scale + n / 2.0 - 0.5).astype(np.int64)
    ok = (col >= 1) & (row >= 1) & (col < n - 1) & (row < n - 1)
    out = np.full(x.shape, np.nan)
    c, r = col[ok], row[ok]
    best = np.zeros(c.shape)
    for dr in (-1, 0):
        for dc in (-1, 0):
            z00 = dn[r + dr, c + dc].astype(float)
            z01 = dn[r + dr, c + dc + 1].astype(float)
            z10 = dn[r + dr + 1, c + dc].astype(float)
            z11 = dn[r + dr + 1, c + dc + 1].astype(float)
            # dn is in 0.5 m units; mean difference across the quad over one pixel (scale m)
            dzdx = ((z01 + z11) - (z00 + z10)) * 0.5 * 0.5 / scale
            dzdy = ((z00 + z01) - (z10 + z11)) * 0.5 * 0.5 / scale
            best = np.maximum(best, np.hypot(dzdx, dzdy))
    out[ok] = np.degrees(np.arctan(best))
    return out


def tile_cells(tr: int, tc: int) -> tuple[np.ndarray, np.ndarray]:
    """Map x, y (m) of the cell centres of tile (row, col), row-major."""
    x0 = -HALF_KM * 1000 + tc * TILE_CELLS * CELL_M
    y0 = HALF_KM * 1000 - tr * TILE_CELLS * CELL_M
    k = (np.arange(TILE_CELLS) + 0.5) * CELL_M
    xx, yy = np.meshgrid(x0 + k, y0 - k)
    return xx.ravel(), yy.ravel()


def main() -> None:
    part, nparts = (int(v) for v in sys.argv[sys.argv.index("--part") + 1].split("/")) if "--part" in sys.argv else (0, 1)
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    batch = int(sys.argv[sys.argv.index("--batch") + 1]) if "--batch" in sys.argv else 1024
    nt = int(round(2 * HALF_KM * 1000 / (TILE_CELLS * CELL_M)))
    FINE.mkdir(parents=True, exist_ok=True)
    (FINE / "fine.json").write_text(json.dumps({
        "cell_m": CELL_M, "tile_cells": TILE_CELLS, "tiles": nt, "half_km": HALF_KM,
        "file": "<row>_<col>.bin, row 0 at +y (towards lon 0), col 0 at -x",
        "planes": ["sun", "earth", "night", "slope"],
        "sun_earth_scale": "value / 200 = fraction (0.5 % steps); 255 = no data",
        "night_unit": "days; 253 = 253 days or more; 254 = no sunlight in the whole period; 255 = no data",
        "slope_unit": "degrees x 4 (254 = 63.5 deg or more); 255 = no data; LOLA 40 m DEM, steepest 2 x 2 pixel plane within the cell",
        "observer_height_m": OBS_H, "earth_margin_deg": EARTH_MARGIN,
        "method": "LOLA LDEM_80S_80M, 720 azimuth bins, rays up to 150 km, hourly SPICE ephemeris (GPU)",
    }, indent=1))

    g = Gpu()
    d40 = open_dem("ldem_80s_40m")
    todo = [(r, c) for r in range(nt) for c in range(nt)][part::nparts]
    todo = [rc for rc in todo if not (FINE / f"{rc[0]}_{rc[1]}.bin").exists()]
    if "--reverse" in sys.argv:  # a second worker on the same part starts from the other end
        todo = todo[::-1]
    if limit:
        todo = todo[:limit]
    print(f"part {part}/{nparts}: {len(todo)} tiles to compute", flush=True)
    t0 = time.perf_counter()
    for i, (tr, tc) in enumerate(todo):
        if (FINE / f"{tr}_{tc}.bin").exists():  # done meanwhile by another worker (tiles are synced in)
            continue
        x, y = tile_cells(tr, tc)
        lat, lon = xy_to_latlon(x, y)
        out = g.compute(np.ascontiguousarray(lat), np.ascontiguousarray(lon), batch=batch)
        planes = encode(out, g.n_hours, g.meta["step_s"])
        sl = slope_deg(d40.dn, d40.n, d40.scale, x, y)
        sp = np.full(sl.shape, 255, np.uint8)
        ok = np.isfinite(sl)
        sp[ok] = np.clip(np.round(sl[ok] * 4), 0, 254)
        data = np.concatenate([planes, sp[None]], 0).tobytes()
        tmp = FINE / f"{tr}_{tc}.bin.tmp"
        tmp.write_bytes(data)
        os.replace(tmp, FINE / f"{tr}_{tc}.bin")
        el = time.perf_counter() - t0
        if i % 5 == 0 or i == len(todo) - 1:
            print(f"  tile {i + 1}/{len(todo)} ({tr},{tc})  {el:.0f} s, "
                  f"{(i + 1) * TILE_CELLS ** 2 / el:.0f} cells/s, ETA {el / (i + 1) * (len(todo) - i - 1) / 60:.0f} min",
                  flush=True)


if __name__ == "__main__":
    main()
