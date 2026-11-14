# Lunar Landing Site Navigator

**NASA Space Apps Challenge 2026 · Challenge: [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)**
Team ✦ IT STEP Poltava × Mindal1ka.com ✦ · Live: https://space.mindal1ka.com

An interactive tool to compare lunar south pole landing sites and dates: where the Sun and Earth are relative to the **real local horizon** (from NASA LOLA topography), how much sunlight a site gets, the longest night, and when direct-to-Earth communication is possible.

> Work in progress during the hackathon (Nov 14–15, 2026).

## How the numbers are computed

| Step | Method | Data |
|---|---|---|
| Terrain | LOLA south-polar DEM, 40 m/px (horizons) and 80 m/px (3D), polar stereographic, heights relative to a 1737.4 km sphere | NASA PDS `LDEM_80S_40M`, `LDEM_80S_80M` |
| Sun & Earth positions | Apparent (light time + stellar aberration) vectors from the Moon's centre in the Moon Mean-Earth frame (same frame as LOLA), 1-hour steps, Nov 2026 – Jan 2031 | NASA/JPL NAIF SPICE: `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `pck00011.tpc`, `naif0012.tls` |
| Horizon | For each 0.25° azimuth bin, march along the great circle (up to 200 km or the DEM edge), sample the DEM, keep the maximum elevation angle; lunar curvature handled with exact 3D vectors | — |
| Sun visibility | Visible fraction of the solar disk (0–1) above the horizon (circular-segment model, disk radius from the actual Sun distance) | — |
| Earth visibility | Earth centre above the horizon plus an antenna margin (default 1°), with topocentric parallax | — |
| Validation | Flat-horizon Sun/Earth azimuth & elevation vs JPL Horizons; illumination vs published NASA illumination maps | JPL Horizons API |

Definitions shown next to every number in the app:

- **Sun %** — mean visible fraction of the solar disk over the selected period.
- **Longest night** — longest continuous interval with the solar disk fully hidden.
- **Earth %** — share of time the Earth's centre is above the horizon + antenna margin.
- **Battery** — load × longest night ÷ allowed depth of discharge (default 80 %).

## Validation (reproducible: `pipeline/validate_*.py`)

| Check | Reference | Result |
|---|---|---|
| Sun & Earth azimuth/elevation (sphere horizon) | JPL Horizons API, 3 sites × 293 epochs (2026-12 – 2030-12) | max difference **0.1″** |
| Sun and Earth visibility, 150 random points 85.2–89.8°S, **same height as the maps (surface, 0 m)**, same definition (any part of the disc, share of time) | NASA LOLA average-visibility maps `AVGVISIB_85S_060M_201608` (Sun, Earth), 18.6 yr | Sun: bias −0.3 pp, MAE 1.0 pp, r = 0.965 · Earth: bias −0.2 pp, MAE 1.2 pp, r = 0.98 |
| Same points computed at 2 m (control) | same maps | bias turns positive (Sun +0.7 pp, Earth +1.05 pp), as expected for a raised observer; MAE stays ~1 pp, so this test checks the method across terrain but is only weakly sensitive to height |
| Average illumination (mean visible disc fraction) at published points, **at the published heights** (0 m, 2 m, 10 m), 2017–2037 | Gläser et al. 2018 (PSS 162), Gläser et al. EPSC2014 | 2 m / 10 m: Connecting Ridge C2 78.0 vs 78.1 %, Shackleton rim 85.5 vs 85.5 %, ridge spot at 10 m 92.5 vs 92.5 % (longest darkness 3.04 vs 3.08 d), Connecting Ridge C1 86.4 vs 88.0 %. 0 m: 8–28 pp lower than published (see limitation below) |

Known limitation: at exactly ground level (0 m) results at sharp ridge tops depend strongly on sub-pixel terrain (+0.5 m of height can change sunlight by 10–18 pp), so published surface-level values are not reproduced reliably by any 20–40 m DEM method; the app therefore defaults to a 2 m observer height and shows the height next to every number.

## Landing sites

Artemis candidate regions follow NASA's list of 28 Oct 2024. NASA does not publish region centre coordinates, so each region is represented by the centre of its LROC NAC "Artemis III candidate landing site" mosaic (Mons Mouton and Nobile Rim 1 share one mosaic; Slater Plain is an approximate reading from a published figure). Per NASA release 26-022 (27 Feb 2026) the first crewed landing moved to Artemis IV (2028); the candidate regions are unchanged. Additional reference points: IM-2 Athena landing site (LROC), high-illumination points from Gläser et al. 2018 and Peña-Asensio et al. 2025, and crater floors from the IAU Gazetteer. Every site in `static/data/sites.json` carries its source URL.

## Project layout

```
pipeline/   Python data pipeline (SPICE ephemerides, LOLA reader, horizon & visibility reference code)
src/        SvelteKit app (static SPA, three.js 3D, uPlot charts)
static/data Pre-computed data served to the browser
serve.mjs   Tiny static server for the production build
```

Rebuild data: `python -m venv .venv && .venv/Scripts/pip install numpy spiceypy numba`, download the files listed above into `data/raw/lola` and `data/raw/spice`, then `cd pipeline && python ephem.py`.

Heat map: `python heatmap_gpu.py` computes the 1 km map (2 m panel height, first 12 months) on an NVIDIA GPU with CuPy in about 2 minutes (`pip install cupy-cuda12x nvidia-cuda-nvrtc-cu12`). It is the same method as the CPU reference `heatmap.py`, which takes several hours. `python heatmap_gpu.py --validate 400` compares the two on random cells: the horizon differs by at most 0.007°, Sun/Earth by at most 0.023 pp, and no cell changes after the map's 0.5 % rounding.
Run the app: `npm install && npm run build && node serve.mjs` (serves `build/` on 127.0.0.1:44000).

## Data sources and references

- NASA LRO LOLA gridded polar data (PDS Geosciences Node): https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/ — projection per `catalog/DSMAP_POLAR.CAT`
- NASA/JPL NAIF SPICE generic kernels: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- JPL Horizons System: https://ssd.jpl.nasa.gov/horizons/
- Challenge resources: LROC QuickMap (https://quickmap.lroc.asu.edu/), NASA Moon Trek (https://trek.nasa.gov/moon/)
- NASA LOLA illumination maps (Mazarico et al. 2011, Icarus 211; PGDA product 69): https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/ , https://pgda.gsfc.nasa.gov/products/69
- Gläser et al. 2018, Planetary and Space Science 162, doi:10.1016/j.pss.2017.07.006 (NTRS 20170007365); Gläser et al., EPSC2014-136-1
- NASA, "NASA Provides Update on Artemis III Moon Landing Regions", 28 Oct 2024; NASA release 26-022, 27 Feb 2026
- LROC NAC Artemis candidate site mosaics (NASA/GSFC/Arizona State University): https://data.lroc.im-ldi.com/lroc/view_rdr/ ; IM-2 landing site: https://lroc.im-ldi.com/images/1408
- Peña-Asensio, Neira-Acosta, Sánchez-Lozano, Acta Astronautica 226 (2025), doi:10.1016/j.actaastro.2024.10.049
- Samaddar et al., LPSC 2025 abstract 2401 (Slater Plain)
- IAU / USGS Gazetteer of Planetary Nomenclature: https://planetarynames.wr.usgs.gov/

## Software and licenses

| Package | License |
|---|---|
| SvelteKit, Svelte, Vite | MIT |
| three.js | MIT |
| uPlot | MIT |
| NumPy | BSD-3-Clause |
| SpiceyPy | MIT (wraps NAIF CSPICE, public domain/NASA) |
| Numba | BSD-2-Clause |
| CuPy | MIT |

## Use of AI

An AI coding assistant (Claude, by Anthropic) was used to speed up implementation: writing and reviewing code in `pipeline/` and `src/`, looking up data formats and documentation, and checking calculations. The project idea, the features and the product decisions are the team's own. All numbers are produced by the code from NASA data and are checked against JPL Horizons and published NASA products. AI-assisted source files carry a note in their header. No AI-generated images, audio or video are used; if any are added they will carry a visible "AI-generated" label.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
