// AI-assisted: written with Claude, reviewed by the team.
// CSV export of the selected window: one row per ephemeris step (hourly), site A
// columns and, when comparing, site B columns. Values come straight from the engine.

import type { Ephem } from '#lib/engine/data.ts';
import { timeOf } from '#lib/engine/visibility.ts';
import type { SiteView } from '#lib/state.svelte.ts';

export const CSV_COLUMNS = [
	'sun_el_deg',
	'sun_az_deg',
	'horizon_under_sun_deg',
	'sun_visible_fraction',
	'earth_el_deg',
	'earth_az_deg',
	'earth_visible'
] as const;

export interface CsvInput {
	eph: Ephem;
	a: SiteView;
	b: SiteView | null;
	heightM: number;
	marginDeg: number;
	demSource: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 16) + 'Z';
const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');
const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40) || 'site';

export function csvHeader(b: boolean): string[] {
	if (!b) return ['time_utc', ...CSV_COLUMNS];
	return ['time_utc', ...CSV_COLUMNS.map((c) => `a_${c}`), ...CSV_COLUMNS.map((c) => `b_${c}`)];
}

export function csvFilename(i: Pick<CsvInput, 'eph' | 'a' | 'b'>): string {
	const s = i.a.series;
	const from = ymd(timeOf(i.eph, s.i0));
	const to = ymd(timeOf(i.eph, s.i0 + s.n));
	const site = i.b ? `${slug(i.a.site.id)}-vs-${slug(i.b.site.id)}` : slug(i.a.site.id);
	return `lunar-${site}-${from}-${to}.csv`;
}

function cells(v: SiteView, k: number): string[] {
	const s = v.series;
	return [
		s.sunEl[k].toFixed(3),
		s.sunAz[k].toFixed(3),
		s.sunHorizon[k].toFixed(3),
		s.sunFrac[k].toFixed(4),
		s.earthEl[k].toFixed(3),
		s.earthAz[k].toFixed(3),
		String(s.earthVis[k])
	];
}

function siteLines(tag: string, v: SiteView): string[] {
	const st = v.site;
	return [
		`# Site ${tag}: ${st.name.en} (${st.id}), lat ${st.lat.toFixed(4)}°, lon ${st.lon.toFixed(4)}° E, surface elevation ${st.elevation_m.toFixed(1)} m`,
		`# Site ${tag} coordinates source: ${st.source}`
	];
}

export function csvComment(i: CsvInput): string[] {
	const s = i.a.series;
	const b = i.b && i.b.series.n === s.n ? i.b : null;
	return [
		'# Lunar Landing Site Navigator - hourly Sun / Earth visibility over the local LOLA horizon',
		...siteLines('A', i.a),
		...(b ? siteLines('B', b) : []),
		`# Period (UTC): ${iso(timeOf(i.eph, s.i0))} to ${iso(timeOf(i.eph, s.i0 + s.n))}, step ${i.eph.step_s / 3600} h, ${s.n} rows`,
		`# Panel/antenna height: ${i.heightM} m above the surface`,
		`# Antenna margin: ${i.marginDeg}° (earth_visible = 1 when the Earth centre is more than this above the horizon)`,
		'# sun_visible_fraction: visible share of the solar disk above the local horizon (0..1)',
		'# Angles: elevation above the astronomical horizon, azimuth clockwise from local north (90 = east), degrees',
		`# Terrain: ${i.demSource}`,
		'# Ephemerides: NASA/JPL NAIF SPICE generic kernels (DE440s, MOON_ME frame), https://naif.jpl.nasa.gov/pub/naif/generic_kernels/',
		`# Generated: ${new Date().toISOString().slice(0, 19)}Z`
	];
}

export function csvRow(i: CsvInput, k: number): string {
	const b = i.b && i.b.series.n === i.a.series.n ? i.b : null;
	const row = [iso(timeOf(i.eph, i.a.series.i0 + k)), ...cells(i.a, k), ...(b ? cells(b, k) : [])];
	return row.join(',');
}

export function buildCsv(i: CsvInput): string {
	const b = !!(i.b && i.b.series.n === i.a.series.n);
	const lines = [...csvComment(i), csvHeader(b).join(',')];
	for (let k = 0; k < i.a.series.n; k++) lines.push(csvRow(i, k));
	return lines.join('\n') + '\n';
}

export function downloadText(text: string, filename: string, type = 'text/csv;charset=utf-8') {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
