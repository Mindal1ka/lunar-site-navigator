"""[AI-assisted: written with Claude, reviewed by the team.]
Build a 16:9 .pptx from per-slide PNGs (one full-bleed picture per slide).
Usage: python pitch_pptx.py <png dir> <file1.png,file2.png,...> <out.pptx>
"""
import sys
from pathlib import Path

from pptx import Presentation
from pptx.util import Emu

src, names, out = Path(sys.argv[1]), sys.argv[2].split(","), sys.argv[3]
prs = Presentation()
prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)  # 13.333 x 7.5 in
blank = prs.slide_layouts[6]
for name in names:
    s = prs.slides.add_slide(blank)
    s.shapes.add_picture(str(src / name), 0, 0, prs.slide_width, prs.slide_height)
prs.save(out)
