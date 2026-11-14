"""[AI-assisted: written with Claude, reviewed and validated by the team.]
Curated landing sites (with sources) and their pre-computed terrain horizons.

Output (static/data/):
  sites.json    site list: id, names (en/uk), category, lat/lon, height, coordinate basis,
                source URL, notes, horizon heights available
  horizons.bin  int16 little-endian, horizon elevation in 1/100 deg,
                layout [site][mast_height][azimuth bin] (N_AZ bins, bin k centred at
                (k + 0.5) * 360 / N_AZ deg from north, clockwise)

Coordinates are planetocentric, east-positive, in the Moon Mean-Earth frame.
NASA does not publish centre coordinates for the Artemis candidate regions; we use
the centres of the LROC NAC "Artemis III candidate landing site" mosaics.

Usage: python sites.py
"""
from __future__ import annotations

import json

import numpy as np

from common import OUT
from horizon import N_AZ, site_horizon
from lola import open_dem

HEIGHTS_M = [0, 1, 2, 3, 5, 7, 10, 15, 20]

LROC = "https://data.lroc.im-ldi.com/lroc/view_rdr/"
GLASER = "https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf"
GAZ = "https://planetarynames.wr.usgs.gov/SearchResults?Target=16_Moon&Feature%20Name="
REGION_NOTE = ("Centre of the LROC NAC mosaic of this Artemis candidate region (NASA list of 28 Oct 2024). "
               "NASA does not publish region centre coordinates.")

SITES = [
    # id, name_en, name_uk, category, lat, lon_east, basis, source, note
    ("cabeus-b-peak", "Peak near Cabeus B", "Пік біля Кабеуса B", "artemis", -83.6, 291.2, "lroc_mosaic_centre",
     LROC + "NAC_ROI_CABEUSPKLO1", REGION_NOTE),
    ("haworth", "Haworth", "Гаворт", "artemis", -86.7, 336.3, "lroc_mosaic_centre",
     LROC + "NAC_ROI_HAWORTH_LO1", REGION_NOTE),
    ("malapert-massif", "Malapert Massif", "Масив Малаперт", "artemis", -86.0, 0.3, "lroc_mosaic_centre",
     LROC + "NAC_ROI_MALAPERTLO1", REGION_NOTE),
    ("mons-mouton-plateau", "Mons Mouton Plateau", "Плато гори Мутон", "artemis", -84.3, 30.6, "lroc_mosaic_centre",
     LROC + "NAC_ROI_MOUTNPLTLO1", REGION_NOTE),
    ("mons-mouton-nobile-rim-1", "Mons Mouton / Nobile Rim 1", "Гора Мутон / вал Нобіле 1", "artemis", -85.4, 35.3,
     "lroc_mosaic_centre", LROC + "NAC_ROI_MTMOUTONLO1",
     REGION_NOTE + " Two NASA regions share this one LROC mosaic, so a separate centre for each is not available."),
    ("nobile-rim-2", "Nobile Rim 2", "Вал Нобіле 2", "artemis", -83.9, 58.7, "lroc_mosaic_centre",
     LROC + "NAC_ROI_NOBILE02LO1", REGION_NOTE),
    ("de-gerlache-rim-2", "de Gerlache Rim 2", "Вал де Ґерлаша 2", "artemis", -88.5, 293.3, "lroc_mosaic_centre",
     LROC + "NAC_ROI_DEGERRIMLO1", REGION_NOTE + " The mosaic is titled 'de Gerlache Rim' and may cover Rim 1 and Rim 2."),
    ("slater-plain", "Slater Plain", "Рівнина Слейтера", "artemis", -87.4, 111.0, "estimated_from_figure",
     "https://www.hou.usra.edu/meetings/lpsc2025/pdf/2401.pdf",
     "Approximate (about ±0.5°): read from Fig. 1 of Samaddar et al., LPSC 2025 #2401 (plains north of Slater crater)."),
    ("im2-athena", "IM-2 Athena landing site", "Місце посадки IM-2 Athena", "mission", -84.7906, 29.1957, "official",
     "https://lroc.im-ldi.com/images/1408", "Intuitive Machines IM-2 landed here on 6 March 2025 (LROC)."),
    ("connecting-ridge-c1", "Connecting Ridge (C1)", "Сполучний хребет (C1)", "sunny", -89.4398, 222.83, "paper",
     GLASER, "Highest-illumination point at 2 m in Gläser et al. 2018 (88.0 % average illumination, 2017–2037)."),
    ("connecting-ridge-c2", "Connecting Ridge (C2)", "Сполучний хребет (C2)", "sunny", -89.3130, 245.98, "paper",
     GLASER, "Gläser et al. 2018, 78.1 % average illumination at 2 m."),
    ("shackleton-rim", "Shackleton rim", "Вал кратера Шеклтон", "sunny", -89.6866, 197.19, "paper",
     GLASER, "Gläser et al. 2018, 85.5 % average illumination at 2 m."),
    ("nobile-rim-2-best", "Nobile Rim 2 best point", "Найкраща точка валу Нобіле 2", "sunny", -84.20156, 60.69989,
     "paper", "https://arxiv.org/html/2406.19863v2",
     "Top-ranked landing point in Nobile Rim 2, Peña-Asensio et al., Acta Astronautica 226 (2025)."),
    ("shackleton-floor", "Shackleton crater floor", "Дно кратера Шеклтон", "shadow", -89.67, 129.78, "official",
     GAZ + "Shackleton", "Crater centre from the IAU Gazetteer; permanently shadowed floor."),
    ("haworth-floor", "Haworth crater floor", "Дно кратера Гаворт", "shadow", -87.45, 354.83, "official",
     GAZ + "Haworth", "Crater centre from the IAU Gazetteer; permanently shadowed region."),
]


def main() -> None:
    dem = open_dem("ldem_80s_40m")
    horizons = np.empty((len(SITES), len(HEIGHTS_M), N_AZ), dtype="<i2")
    out = []
    for i, (sid, en, uk, cat, lat, lon, basis, src, note) in enumerate(SITES):
        for j, h in enumerate(HEIGHTS_M):
            prof, h0 = site_horizon(dem, lat, lon, obs_height_m=float(h))
            horizons[i, j] = np.round(prof * 100).astype("<i2")
        out.append({"id": sid, "name": {"en": en, "uk": uk}, "category": cat, "lat": lat, "lon": lon,
                    "elevation_m": round(h0, 1), "coord_basis": basis, "source": src, "note": note})
        print(f"{en:32s} {lat:9.4f} {lon:9.4f}  h={h0:7.0f} m  max horizon {horizons[i, 0].max() / 100:5.2f} deg")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "horizons.bin").write_bytes(horizons.tobytes())
    meta = {
        "dem": "LOLA LDEM_80S_40M (40 m/px), NASA PDS",
        "n_az": N_AZ, "heights_m": HEIGHTS_M, "dtype": "int16-le, 1/100 deg",
        "layout": "[site][height][azimuth]", "max_distance_km": 200,
        "frame": "Moon Mean-Earth (DE421), planetocentric, east-positive longitude",
        "sites": out,
    }
    (OUT / "sites.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
