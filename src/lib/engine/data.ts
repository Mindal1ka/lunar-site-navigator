// AI-assisted: written with Claude, reviewed by the team.
// Loaders for the pre-computed data in static/data (see pipeline/*.py).

export interface EphemMeta {
	start_utc: string;
	start_unix: number;
	step_s: number;
	count: number;
}

export interface Ephem extends EphemMeta {
	/** count x 7 float32: sun_dir xyz, sun_dist_au, earth xyz (km), MOON_ME */
	rec: Float32Array;
}

export type Lang = 'en' | 'uk';
export type SiteCategory = 'artemis' | 'mission' | 'sunny' | 'shadow' | 'custom';

export interface Site {
	id: string;
	name: Record<Lang, string>;
	category: SiteCategory;
	lat: number;
	lon: number;
	elevation_m: number;
	coord_basis: string;
	source: string;
	note: string;
	/** horizon elevation (deg) per mast height, each n_az long */
	horizons?: Float32Array[];
	edge_warning?: boolean;
}

export interface SitesData {
	heights_m: number[];
	n_az: number;
	sites: Site[];
}

export interface Grid {
	x0_m: number;
	y0_m: number;
	step_m: number;
	size: number;
	heights: Int16Array;
}

export interface Heatmap {
	cell_km: number;
	n: number;
	half_km: number;
	sun: Uint8Array;
	earth: Uint8Array;
	night: Uint8Array;
	observer_height_m: number;
	earth_margin_deg: number;
	period_utc: [string, string];
}

const base = '/data';

async function bin(path: string): Promise<ArrayBuffer> {
	const r = await fetch(`${base}/${path}`);
	if (!r.ok) throw new Error(`${path}: ${r.status}`);
	return r.arrayBuffer();
}
async function json<T>(path: string): Promise<T> {
	const r = await fetch(`${base}/${path}`);
	if (!r.ok) throw new Error(`${path}: ${r.status}`);
	return r.json();
}

export async function loadEphem(): Promise<Ephem> {
	const [meta, buf] = await Promise.all([json<EphemMeta>('ephem.json'), bin('ephem.bin')]);
	return { ...meta, rec: new Float32Array(buf) };
}

export function splitHorizons(raw: Int16Array, nHeights: number, nAz: number, siteIndex = 0): Float32Array[] {
	const out: Float32Array[] = [];
	for (let h = 0; h < nHeights; h++) {
		const p = new Float32Array(nAz);
		const off = (siteIndex * nHeights + h) * nAz;
		for (let k = 0; k < nAz; k++) p[k] = raw[off + k] / 100;
		out.push(p);
	}
	return out;
}

export async function loadSites(): Promise<SitesData> {
	const [meta, buf] = await Promise.all([json<SitesData>('sites.json'), bin('horizons.bin')]);
	const raw = new Int16Array(buf);
	meta.sites.forEach((s, i) => (s.horizons = splitHorizons(raw, meta.heights_m.length, meta.n_az, i)));
	return meta;
}

interface TerrainMeta {
	overview: Omit<Grid, 'heights'> & { min_m: number; max_m: number };
	tiles: Record<string, Omit<Grid, 'heights'>>;
}
let terrainMeta: Promise<TerrainMeta> | null = null;
const terrainJson = () => (terrainMeta ??= json<TerrainMeta>('terrain/terrain.json'));

export async function loadOverview(): Promise<Grid & { min_m: number; max_m: number }> {
	const [m, buf] = await Promise.all([terrainJson(), bin('terrain/overview.bin')]);
	return { ...m.overview, heights: new Int16Array(buf) };
}

export async function loadSiteTile(id: string): Promise<Grid> {
	const [m, buf] = await Promise.all([terrainJson(), bin(`terrain/site-${id}.bin`)]);
	return { ...m.tiles[id], heights: new Int16Array(buf) };
}

export async function loadHeatmap(): Promise<Heatmap> {
	const [m, buf] = await Promise.all([
		json<Omit<Heatmap, 'sun' | 'earth' | 'night'>>('heatmap.json'),
		bin('heatmap.bin')
	]);
	const n2 = m.n * m.n;
	const u = new Uint8Array(buf);
	return { ...m, sun: u.subarray(0, n2), earth: u.subarray(n2, 2 * n2), night: u.subarray(2 * n2, 3 * n2) };
}

export class ApiError extends Error {}

/** Custom point: horizons for every mast height + 40 m terrain tile (server, same code as curated sites). */
export async function loadCustomPoint(lat: number, lon: number, heightsCount: number): Promise<{ site: Site; tile: Grid }> {
	const q = `lat=${lat.toFixed(4)}&lon=${(((lon % 360) + 360) % 360).toFixed(4)}`;
	const r = await fetch(`/api/point?${q}`);
	const body = await r.json().catch(() => ({ error: 'Point service is unavailable' }));
	if (!r.ok) throw new ApiError(body.error ?? 'Point service is unavailable');
	const bytes = Uint8Array.from(atob(body.horizons_b64), (c) => c.charCodeAt(0));
	const view = new Int16Array(bytes.buffer, 0, bytes.length / 2);
	const tileBuf = await fetch(`/api/tile?${q}`).then((t) => {
		if (!t.ok) throw new ApiError('Terrain tile is unavailable');
		return t.arrayBuffer();
	});
	const site: Site = {
		id: `pt-${body.lat}_${body.lon}`,
		name: { en: `${Math.abs(body.lat).toFixed(3)}° S, ${body.lon.toFixed(3)}° E`, uk: `${Math.abs(body.lat).toFixed(3)}° пд. ш., ${body.lon.toFixed(3)}° сх. д.` },
		category: 'custom',
		lat: body.lat,
		lon: body.lon,
		elevation_m: body.elevation_m,
		coord_basis: 'custom',
		source: '',
		note: body.method,
		horizons: splitHorizons(view, heightsCount, body.n_az),
		edge_warning: body.edge_warning
	};
	return { site, tile: { ...body.tile, heights: new Int16Array(tileBuf) } };
}
