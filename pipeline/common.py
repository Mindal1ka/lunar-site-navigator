"""Shared constants and paths for the data pipeline.

Note: parts of this pipeline were written with the help of an AI coding
assistant (Claude); every formula is checked against JPL Horizons and
published NASA products (see pipeline/validate_*.py and README "Use of AI").
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# LUNAR_ROOT (optional) points RAW at another checkout, e.g. when running from a git worktree
# that has no data/raw of its own. Everything else stays relative to this checkout.
RAW = Path(os.environ.get("LUNAR_ROOT") or ROOT) / "data" / "raw"
WORK = ROOT / "data" / "work"
OUT = ROOT / "static" / "data"

SPICE_DIR = RAW / "spice"
LOLA_DIR = RAW / "lola"

# LOLA polar products use a sphere of this radius as the height reference
# and for the polar stereographic projection (PDS DSMAP_POLAR.CAT).
MOON_R_M = 1737400.0

# Body-fixed frame of the LOLA DEMs is "MEAN EARTH/POLAR AXIS OF DE421".
# In the NAIF kernel moon_de440_250416.tf the alias MOON_ME points to
# MOON_ME_DE440_ME421, the DE440 realisation of that same frame.
MOON_FRAME = "MOON_ME"

KERNELS = [
    "naif0012.tls",
    "pck00011.tpc",
    "de440s.bsp",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
]

# Mean solar radius (IAU 2015 nominal) for the apparent solar disk size.
SUN_R_KM = 695700.0
AU_KM = 149597870.7
