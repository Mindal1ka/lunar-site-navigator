// AI-assisted: written with Claude, reviewed by the team.
// Detail squares: 101 x 101 cells of 100 m centred on a site (pipeline/squares_gpu.py, or
// /api/square for custom points). Same method and definitions as the site card.
// Also a provisional square assembled from the fast 100 m map tiles (static/data/fine).

import { latLonToXY, xyToLatLon } from './geo';

/** 7 planes: [sun, earth, night] at heights_m[0], [sun, earth, night] at heights_m[1], slope */
export const SQ_PLANES = 7;

export interface SquareMeta {
	cell_m: number;
	n: number;
	heights_m: number[];
	earth_margin_deg: number;
	period_utc: [string, string];
	method: string;
	sites: Record<string, { lat: number; lon: number }>;
}

export type SquareKind = 'exact' | 'fast';

export interface Square {
	key: string;
	kind: SquareKind;
	lat: number;
	lon: number;
	/** map x, y of the centre cell (m) */
	cx: number;
	cy: number;
	n: number;
	cellM: number;
	/** heights with [sun, earth, night] planes, in plane order */
	heights: number[];
	/** n*n per plane; planes 3*h .. 3*h+2 for heights[h], then slope at index 3*heights.length */
	data: Uint8Array;
	marginDeg: number;
	/** period start (unix s) and length (hours) */
	startUnix: number;
	hours: number;
	method: string;
}

export interface Planes {
	/** height whose planes are shown */
	heightM: number;
	sun: Uint8Array;
	earth: Uint8Array;
	night: Uint8Array;
	slope: Uint8Array;
}

export function parsePeriod(p: [string, string]): { startUnix: number; hours: number } {
	const start = Date.parse(p[0]) / 1000;
	const m = /([+-]?\d+(?:\.\d+)?)\s*h/.exec(p[1] ?? '');
	const hours = m ? parseFloat(m[1]) : (Date.parse(p[1]) / 1000 - start) / 3600;
	return { startUnix: start, hours };
}

export function makeSquare(key: string, kind: SquareKind, lat: number, lon: number, meta: Omit<SquareMeta, 'sites'>, data: Uint8Array): Square {
	const [cx, cy] = latLonToXY(lat, lon);
	const { startUnix, hours } = parsePeriod(meta.period_utc);
	return {
		key,
		kind,
		lat,
		lon,
		cx,
		cy,
		n: meta.n,
		cellM: meta.cell_m,
		heights: meta.heights_m,
		data,
		marginDeg: meta.earth_margin_deg,
		startUnix,
		hours,
		method: meta.method
	};
}

/** Nearest computed height to the app height (ties go to the lower one). */
export function nearestHeight(sq: Square, heightM: number): number {
	return sq.heights.reduce((b, h) => (Math.abs(h - heightM) < Math.abs(b - heightM) ? h : b), sq.heights[0]);
}

export function planesFor(sq: Square, heightM: number): Planes {
	const h = nearestHeight(sq, heightM);
	const hi = sq.heights.indexOf(h);
	const n2 = sq.n * sq.n;
	const p = (k: number) => sq.data.subarray(k * n2, (k + 1) * n2);
	return { heightM: h, sun: p(3 * hi), earth: p(3 * hi + 1), night: p(3 * hi + 2), slope: p(3 * sq.heights.length) };
}

// ---- decoding (same encoding as heatmap.bin)
export const NODATA = 255;
export const pctOf = (v: number) => v / 2;
/** night code -> days; Infinity for "no sunlight in the whole period" */
export const nightDays = (v: number) => (v === 254 ? Infinity : v);
export const slopeOf = (v: number) => v / 4;

/** Cell (row, col) centre in map metres. Row 0 is at +y, col 0 at -x. */
export function cellXY(sq: Square, r: number, c: number): [number, number] {
	const h = (sq.n - 1) / 2;
	return [sq.cx + (c - h) * sq.cellM, sq.cy - (r - h) * sq.cellM];
}

/** Cell under a map point (m), or null outside the square. */
export function cellAt(sq: Square, x: number, y: number): { r: number; c: number } | null {
	const h = (sq.n - 1) / 2;
	const c = Math.round((x - sq.cx) / sq.cellM + h);
	const r = Math.round((sq.cy - y) / sq.cellM + h);
	if (r < 0 || c < 0 || r >= sq.n || c >= sq.n) return null;
	return { r, c };
}

export interface Range {
	min: number;
	max: number;
}
export interface Spread {
	radiusM: number;
	cells: number;
	sun: Range;
	earth: Range;
	/** days; max may be Infinity (a cell with no sunlight at all) */
	night: Range;
	nightCapped: boolean;
}

/** Min/max over cells whose centres are within radiusM of the site. */
export function spread(sq: Square, heightM: number, radiusM = 500): Spread | null {
	const P = planesFor(sq, heightM);
	const h = (sq.n - 1) / 2;
	const k = Math.ceil(radiusM / sq.cellM);
	const sun = { min: Infinity, max: -Infinity };
	const earth = { min: Infinity, max: -Infinity };
	const night = { min: Infinity, max: -Infinity };
	let cells = 0;
	let capped = false;
	for (let dr = -k; dr <= k; dr++)
		for (let dc = -k; dc <= k; dc++) {
			if (Math.hypot(dr, dc) * sq.cellM > radiusM + 1e-6) continue;
			const r = h + dr;
			const c = h + dc;
			if (r < 0 || c < 0 || r >= sq.n || c >= sq.n) continue;
			const i = r * sq.n + c;
			const s = P.sun[i];
			const e = P.earth[i];
			const nn = P.night[i];
			if (s === NODATA || e === NODATA || nn === NODATA) continue;
			cells++;
			sun.min = Math.min(sun.min, pctOf(s));
			sun.max = Math.max(sun.max, pctOf(s));
			earth.min = Math.min(earth.min, pctOf(e));
			earth.max = Math.max(earth.max, pctOf(e));
			const d = nightDays(nn);
			if (nn === 253) capped = true;
			night.min = Math.min(night.min, d);
			night.max = Math.max(night.max, d);
		}
	if (!cells) return null;
	return { radiusM, cells, sun, earth, night, nightCapped: capped };
}

export interface Spot {
	r: number;
	c: number;
	x: number;
	y: number;
	lat: number;
	lon: number;
	sunPct: number;
	earthPct: number;
	nightDays: number;
	slopeDeg: number;
	distM: number;
	/** compass bearing from the site, deg from north clockwise */
	bearingDeg: number;
	heightM: number;
}

/**
 * Best landing spot inside radiusM: highest Sun % among cells with slope <= maxSlopeDeg,
 * tie-break higher Earth %, then shorter longest night, then closer to the site.
 */
export function bestSpot(sq: Square, heightM: number, maxSlopeDeg: number, radiusM = 5000): Spot | null {
	const P = planesFor(sq, heightM);
	const h = (sq.n - 1) / 2;
	let best = -1;
	let bs = -1, be = -1, bn = Infinity, bd = Infinity;
	for (let r = 0; r < sq.n; r++)
		for (let c = 0; c < sq.n; c++) {
			const d = Math.hypot(r - h, c - h) * sq.cellM;
			if (d > radiusM + 1e-6) continue;
			const i = r * sq.n + c;
			const sl = P.slope[i];
			const s = P.sun[i];
			const e = P.earth[i];
			const nn = P.night[i];
			if (sl === NODATA || s === NODATA || e === NODATA || nn === NODATA) continue;
			if (slopeOf(sl) > maxSlopeDeg) continue;
			const n = nightDays(nn);
			const better = s > bs || (s === bs && (e > be || (e === be && (n < bn || (n === bn && d < bd)))));
			if (better) {
				best = i;
				bs = s;
				be = e;
				bn = n;
				bd = d;
			}
		}
	if (best < 0) return null;
	const r = Math.floor(best / sq.n);
	const c = best % sq.n;
	const [x, y] = cellXY(sq, r, c);
	const [lat, lon] = xyToLatLon(x, y);
	return {
		r,
		c,
		x,
		y,
		lat,
		lon,
		sunPct: pctOf(bs),
		earthPct: pctOf(be),
		nightDays: bn,
		slopeDeg: slopeOf(P.slope[best]),
		distM: bd,
		bearingDeg: bearing(sq.cx, sq.cy, x, y),
		heightM: P.heightM
	};
}

/** Compass bearing (deg) from map point a to b in south polar stereographic: north points away from the pole. */
export function bearing(ax: number, ay: number, bx: number, by: number): number {
	const lon = Math.atan2(ax, ay);
	const dx = bx - ax;
	const dy = by - ay;
	const east = dx * Math.cos(lon) - dy * Math.sin(lon);
	const north = dx * Math.sin(lon) + dy * Math.cos(lon);
	return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

const COMPASS = { en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], uk: ['Пн', 'ПнСх', 'Сх', 'ПдСх', 'Пд', 'ПдЗх', 'Зх', 'ПнЗх'] };
export function compass(deg: number, lang: 'en' | 'uk'): string {
	return COMPASS[lang][Math.round(deg / 45) % 8];
}

// ---- loading

const base = '/data/squares';
let metaP: Promise<SquareMeta | null> | null = null;
export function loadSquaresMeta(): Promise<SquareMeta | null> {
	return (metaP ??= fetch(`${base}/squares.json`)
		.then((r) => (r.ok ? (r.json() as Promise<SquareMeta>) : null))
		.catch(() => null));
}

/** Pre-computed square of a curated site, or null when it is not there (yet). */
export async function loadSiteSquare(id: string): Promise<Square | null> {
	const meta = await loadSquaresMeta();
	const s = meta?.sites[id];
	if (!meta || !s) return null;
	const r = await fetch(`${base}/${id}.bin`).catch(() => null);
	if (!r?.ok) return null;
	const buf = new Uint8Array(await r.arrayBuffer());
	if (buf.length !== SQ_PLANES * meta.n * meta.n) return null;
	return makeSquare(id, 'exact', s.lat, s.lon, meta, buf);
}

export type SquarePoll =
	| { kind: 'ready'; square: Square }
	| { kind: 'pending'; state: 'queued' | 'running'; position: number; etaS: number }
	| { kind: 'busy'; retryS: number }
	| { kind: 'error'; message: string };

/** One request to /api/square (the caller re-polls on 'pending'). */
export async function pollSquareApi(key: string, lat: number, lon: number, signal?: AbortSignal): Promise<SquarePoll> {
	const meta = await loadSquaresMeta();
	const q = `lat=${lat.toFixed(4)}&lon=${(((lon % 360) + 360) % 360).toFixed(4)}`;
	let r: Response;
	try {
		r = await fetch(`/api/square?${q}`, { signal, cache: 'no-store' });
	} catch (e) {
		if ((e as Error).name === 'AbortError') throw e;
		return { kind: 'busy', retryS: 15 };
	}
	if (r.status === 200) {
		const buf = new Uint8Array(await r.arrayBuffer());
		const m = meta ?? DEFAULT_META;
		if (buf.length !== SQ_PLANES * m.n * m.n) return { kind: 'error', message: 'Unexpected detail map size' };
		return { kind: 'ready', square: makeSquare(key, 'exact', lat, lon, m, buf) };
	}
	const body = await r.json().catch(() => ({}) as Record<string, unknown>);
	if (r.status === 202)
		return {
			kind: 'pending',
			state: body.state === 'running' ? 'running' : 'queued',
			position: Number(body.position) || 0,
			etaS: Number(body.eta_s) || 0
		};
	if (r.status === 503 || r.status === 429) return { kind: 'busy', retryS: Number(body.retry_s) || 30 };
	if (r.status === 502 || r.status === 504) return { kind: 'busy', retryS: 30 };
	if (r.status === 404) return { kind: 'error', message: 'the detail map service is not available' };
	return { kind: 'error', message: String(body.error ?? `HTTP ${r.status}`) };
}

/** Same layout as squares.json, used if that file is missing when an API square arrives. */
const DEFAULT_META: Omit<SquareMeta, 'sites'> = {
	cell_m: 100,
	n: 101,
	heights_m: [2, 10],
	earth_margin_deg: 1,
	period_utc: ['2026-11-01T00:00:00Z', '+8766 h'],
	method: 'same as the site card: LOLA LDEM_80S_40M, 1440 azimuth bins, rays up to 200 km'
};

// ---- provisional square from the fast 100 m map tiles

interface FineMeta {
	cell_m: number;
	tile_cells: number;
	tiles: number;
	half_km: number;
	observer_height_m?: number;
	earth_margin_deg?: number;
	period_utc?: [string, string];
	method?: string;
}
let fineP: Promise<FineMeta | null> | null = null;
const fineMeta = () =>
	(fineP ??= fetch('/data/fine/fine.json')
		.then((r) => (r.ok ? (r.json() as Promise<FineMeta>) : null))
		.catch(() => null));
const fineTiles = new Map<string, Promise<Uint8Array | null>>();
function fineTile(tr: number, tc: number): Promise<Uint8Array | null> {
	const k = `${tr}_${tc}`;
	let p = fineTiles.get(k);
	if (!p) {
		p = fetch(`/data/fine/${k}.bin`)
			.then(async (r) => (r.ok ? new Uint8Array(await r.arrayBuffer()) : null))
			.catch(() => null);
		fineTiles.set(k, p);
	}
	return p;
}

/**
 * A 101 x 101 square (2 m only) resampled (nearest cell) from the fast map tiles, or null when
 * the tiles around the point are not computed. Labelled "fast map method" in the UI.
 */
export async function loadFineSquare(key: string, lat: number, lon: number): Promise<Square | null> {
	const fm = await fineMeta();
	if (!fm) return null;
	const n = 101;
	const cell = 100;
	const [cx, cy] = latLonToXY(lat, lon);
	const half = fm.half_km * 1000;
	const tc = fm.tile_cells;
	const n2 = n * n;
	const out = new Uint8Array(4 * n2).fill(NODATA);
	const need = new Map<string, [number, number]>();
	const idx: { i: number; tr: number; tcol: number; fr: number; fc: number }[] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			const x = cx + (c - 50) * cell;
			const y = cy - (r - 50) * cell;
			const gx = Math.floor((x + half) / fm.cell_m);
			const gy = Math.floor((half - y) / fm.cell_m);
			if (gx < 0 || gy < 0 || gx >= fm.tiles * tc || gy >= fm.tiles * tc) continue;
			const tr = Math.floor(gy / tc);
			const tcol = Math.floor(gx / tc);
			need.set(`${tr}_${tcol}`, [tr, tcol]);
			idx.push({ i: r * n + c, tr, tcol, fr: gy - tr * tc, fc: gx - tcol * tc });
		}
	const tiles = new Map<string, Uint8Array | null>();
	await Promise.all([...need].map(async ([k, [a, b]]) => tiles.set(k, await fineTile(a, b))));
	let got = 0;
	const tn2 = tc * tc;
	for (const q of idx) {
		const t = tiles.get(`${q.tr}_${q.tcol}`);
		if (!t || t.length !== 4 * tn2) continue;
		const j = q.fr * tc + q.fc;
		for (let p = 0; p < 4; p++) out[p * n2 + q.i] = t[p * tn2 + j];
		got++;
	}
	// mostly empty: not worth showing
	if (got < n2 * 0.5) return null;
	return makeSquare(
		key,
		'fast',
		lat,
		lon,
		{
			cell_m: cell,
			n,
			heights_m: [fm.observer_height_m ?? 2],
			earth_margin_deg: fm.earth_margin_deg ?? 1,
			period_utc: fm.period_utc ?? ['2026-11-01T00:00:00Z', '+8766 h'],
			method: fm.method ?? 'fast map method: LOLA 80 m, 720 azimuth bins, rays up to 150 km'
		},
		out
	);
}

/** Ephemeris index window [i0, i1) the square was computed for. */
export function squareWindow(sq: Square, eph: { start_unix: number; step_s: number }): { i0: number; i1: number } {
	const i0 = Math.round((sq.startUnix - eph.start_unix) / eph.step_s);
	return { i0, i1: i0 + Math.round((sq.hours * 3600) / eph.step_s) };
}

/** RGBA8 texture data [sun, earth, night, slope] for one height (for the 3D view). */
export function squareRgba(sq: Square, heightM: number): Uint8Array {
	const P = planesFor(sq, heightM);
	const n2 = sq.n * sq.n;
	const a = new Uint8Array(n2 * 4);
	for (let i = 0; i < n2; i++) {
		a[i * 4] = P.sun[i];
		a[i * 4 + 1] = P.earth[i];
		a[i * 4 + 2] = P.night[i];
		a[i * 4 + 3] = P.slope[i];
	}
	return a;
}
