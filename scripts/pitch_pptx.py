"""[AI-assisted: written with Claude, reviewed by the team.]
Build a 16:9 .pptx from per-slide PNGs (one full-bleed picture per slide).
Usage: python pitch_pptx.py <png dir> <n slides> <out.pptx>
"""
import sys
from pathlib import Path

from pptx import Presentation
from pptx.util import Emu

src, n, out = Path(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
prs = Presentation()
prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)  # 13.333 x 7.5 in
blank = prs.slide_layouts[6]
for i in range(1, n + 1):
    s = prs.slides.add_slide(blank)
    s.shapes.add_picture(str(src / f"s{i}.png"), 0, 0, prs.slide_width, prs.slide_height)
prs.save(out)
