"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Rewrite only the slope plane of the precomputed fine tiles and detail squares with the current
slope_deg (no horizon recomputation, CPU only, a few seconds). Prints before/after statistics.
Usage: python reslope.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np

from common import OUT, ROOT
from finemap_gpu import FINE, TILE_CELLS, slope_deg, tile_cells
from lola import open_dem
from squares_gpu import N, SQ, square_xy


def enc(sl: np.ndarray) -> np.ndarray:
    sp = np.full(sl.shape, 255, np.uint8)
    ok = np.isfinite(sl)
    sp[ok] = np.clip(np.round(sl[ok] * 4), 0, 254)
    return sp


def rewrite(path: Path, n_planes: int, side: int, plane: int, new: np.ndarray) -> np.ndarray:
    a = np.frombuffer(path.read_bytes(), np.uint8).reshape(n_planes, side * side).copy()
    old = a[plane].copy()
    a[plane] = new
    tmp = path.with_suffix(".reslope.tmp")
    tmp.write_bytes(a.tobytes())
    os.replace(tmp, path)
    return old


def main() -> None:
    d40 = open_dem("ldem_80s_40m")
    # detail squares (static) and the on-demand cache
    meta = json.loads((SQ / "squares.json").read_text(encoding="utf-8"))
    print("site                         centre slope old -> new (deg)")
    for sid, s in meta["sites"].items():
        x, y = square_xy(s["lat"], s["lon"])
        new = enc(slope_deg(d40.dn, d40.n, d40.scale, x, y))
        old = rewrite(SQ / f"{sid}.bin", 7, N, 6, new)
        c = (N // 2) * N + N // 2
        print(f"  {sid:28s} {old[c] / 4:5.2f} -> {new[c] / 4:5.2f}")
    meta["slope_unit"] = "degrees x 4 (254 = 63.5 deg or more); 255 = no data; LOLA 40 m DEM, steepest 2 x 2 pixel plane within the cell"
    (SQ / "squares.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    cache = ROOT / "data" / "work" / "square_cache"
    nc = 0
    for f in sorted(cache.glob("*.bin")) if cache.exists() else []:
        lat, lon = (float(v) for v in f.stem.split("_"))
        x, y = square_xy(lat, lon)
        rewrite(f, 7, N, 6, enc(slope_deg(d40.dn, d40.n, d40.scale, x, y)))
        nc += 1
    print(f"cached squares rewritten: {nc}")
    # fine tiles
    tiles = sorted(FINE.glob("*_*.bin"))
    sun_all, old_all, new_all = [], [], []
    for i, f in enumerate(tiles):
        tr, tc = (int(v) for v in f.stem.split("_"))
        x, y = tile_cells(tr, tc)
        new = enc(slope_deg(d40.dn, d40.n, d40.scale, x, y))
        a = np.frombuffer(f.read_bytes(), np.uint8).reshape(4, -1)
        sun_all.append(a[0].copy())
        old_all.append(rewrite(f, 4, TILE_CELLS, 3, new))
        new_all.append(new)
        if i % 200 == 0:
            print(f"  fine tiles {i + 1}/{len(tiles)}", flush=True)
    sun, old, new = (np.concatenate(v) for v in (sun_all, old_all, new_all))
    ok = (sun <= 200) & (old < 255) & (new < 255)
    top = np.argsort(np.where(ok, sun.astype(int), -1))[::-1][:300]
    print(f"fine tiles rewritten: {len(tiles)}")
    print(f"300 sunniest cells passing 8 deg: old {(old[top] / 4 <= 8).sum()}, new {(new[top] / 4 <= 8).sum()}")
    print(f"median slope of all cells: old {np.median(old[ok]) / 4:.2f}, new {np.median(new[ok]) / 4:.2f} deg")


if __name__ == "__main__":
    main()
