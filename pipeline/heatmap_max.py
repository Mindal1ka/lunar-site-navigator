"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Overview "best in cell" layer from the 100 m fine tiles (finemap_gpu.py).

For every 1 km cell of heatmap.bin it takes the 10 x 10 fine cells inside it and keeps
the best value: highest Sun %, highest Earth %, shortest longest-night. Narrow sunlit ridges
(Shackleton rim, Malapert, the connecting ridge) stay visible on the overview this way, while
heatmap.bin samples the cell centre only.

Output: static/data/heatmap_max.bin (same layout and encoding as heatmap.bin) and heatmap_max.json.
Usage: python heatmap_max.py
"""
from __future__ import annotations

import json

import numpy as np

from common import OUT

FINE = OUT / "fine"


def main() -> None:
    fm = json.loads((FINE / "fine.json").read_text())
    hm = json.loads((OUT / "heatmap.json").read_text())
    tc, nt = fm["tile_cells"], fm["tiles"]
    k = int(round(hm["cell_km"] * 1000 / fm["cell_m"]))  # fine cells per overview cell (10)
    n = hm["n"]
    assert nt * tc == n * k, "fine grid and overview grid must cover the same square"
    full = np.full((4, nt * tc, nt * tc), 255, np.uint8)
    missing = 0
    for r in range(nt):
        for c in range(nt):
            p = FINE / f"{r}_{c}.bin"
            if not p.exists():
                missing += 1
                continue
            full[:, r * tc:(r + 1) * tc, c * tc:(c + 1) * tc] = np.frombuffer(p.read_bytes(), np.uint8).reshape(4, tc, tc)
    if missing:
        raise SystemExit(f"{missing} fine tiles are missing; run finemap_gpu.py first")
    blocks = full[:3].reshape(3, n, k, n, k).transpose(0, 1, 3, 2, 4).reshape(3, n, n, k * k)
    out = np.full((3, n, n), 255, np.uint8)
    for i in (0, 1):  # sun, earth: best = highest valid value
        b = blocks[i].astype(np.int16)
        b[b == 255] = -1
        m = b.max(axis=2)
        out[i][m >= 0] = m[m >= 0]
    b = blocks[2].astype(np.int16)  # night: best = shortest (254 = dark all period is the worst)
    b[b == 255] = 999
    m = b.min(axis=2)
    out[2][m < 999] = m[m < 999]
    (OUT / "heatmap_max.bin").write_bytes(out.tobytes())
    meta = {**hm, "aggregate": f"best of {k} x {k} cells of {fm['cell_m']:.0f} m (fast map method)",
            "method": fm["method"]}
    (OUT / "heatmap_max.json").write_text(json.dumps(meta, indent=1))
    for i, name in enumerate(("sun", "earth", "night")):
        v = out[i][out[i] != 255]
        print(f"{name}: {v.size} cells, median {np.median(v)}, max {v.max()}")


if __name__ == "__main__":
    main()
