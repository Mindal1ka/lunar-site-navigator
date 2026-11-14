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

## Project layout

```
pipeline/   Python data pipeline (SPICE ephemerides, LOLA reader, horizon & visibility reference code)
src/        SvelteKit app (static SPA, three.js 3D, uPlot charts)
static/data Pre-computed data served to the browser
serve.mjs   Tiny static server for the production build
```

Rebuild data: `python -m venv .venv && .venv/Scripts/pip install numpy spiceypy numba`, download the files listed above into `data/raw/lola` and `data/raw/spice`, then `cd pipeline && python ephem.py`.
Run the app: `npm install && npm run build && node serve.mjs` (serves `build/` on 127.0.0.1:44000).

## Data sources and references

- NASA LRO LOLA gridded polar data (PDS Geosciences Node): https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/ — projection per `catalog/DSMAP_POLAR.CAT`
- NASA/JPL NAIF SPICE generic kernels: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- JPL Horizons System: https://ssd.jpl.nasa.gov/horizons/
- Challenge resources: LROC QuickMap (https://quickmap.lroc.asu.edu/), NASA Moon Trek (https://trek.nasa.gov/moon/)

## Software and licenses

| Package | License |
|---|---|
| SvelteKit, Svelte, Vite | MIT |
| three.js | MIT |
| uPlot | MIT |
| NumPy | BSD-3-Clause |
| SpiceyPy | MIT (wraps NAIF CSPICE, public domain/NASA) |
| Numba | BSD-2-Clause |

## Use of AI

An AI coding assistant (Claude, by Anthropic) was used to speed up implementation: writing and reviewing code in `pipeline/` and `src/`, looking up data formats and documentation, and checking calculations. The project idea, the features and the product decisions are the team's own. All numbers are produced by the code from NASA data and are checked against JPL Horizons and published NASA products. AI-assisted source files carry a note in their header. No AI-generated images, audio or video are used; if any are added they will carry a visible "AI-generated" label.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
