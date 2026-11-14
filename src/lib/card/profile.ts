// AI-assisted: written with Claude, reviewed by the team.
// Sunlight / Earth / night for every mast height of one site (uses the validated engine).

import type { Ephem, Site } from '#lib/engine/data.ts';
import { computeSeries, siteRadius, stats } from '#lib/engine/visibility.ts';

export interface HeightProfile {
	siteId: string;
	sun: number[];
	earth: number[];
	night: number[];
}

export function heightProfile(
	site: Site,
	eph: Ephem,
	heights: number[],
	i0: number,
	i1: number,
	marginDeg: number
): HeightProfile | null {
	if (!site.horizons) return null;
	const out: HeightProfile = { siteId: site.id, sun: [], earth: [], night: [] };
	heights.forEach((h, k) => {
		const prof = site.horizons![k];
		const s = computeSeries(prof, site.lat, site.lon, siteRadius(site.elevation_m, h), eph, i0, i1, marginDeg);
		const st = stats(s, eph.step_s / 3600);
		out.sun.push(st.sunPct);
		out.earth.push(st.earthPct);
		out.night.push(st.longestNightH);
	});
	return out;
}
