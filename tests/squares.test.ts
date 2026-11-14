// AI-assisted: written with Claude, reviewed by the team.
// The centre cell of every detail square (pipeline/squares_gpu.py) must equal the site card,
// i.e. the TypeScript engine over the same period, heights and Earth margin, to within one
// quantisation step (0.5 pp for Sun/Earth, 1 day for the longest night). Sites whose square
// file is not there yet are skipped.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitHorizons, type Ephem, type SitesData } from '../src/lib/engine/data';
import { computeSeries, stats, siteRadius } from '../src/lib/engine/visibility';
import { bestSpot, makeSquare, nightDays, planesFor, spread, type SquareMeta } from '../src/lib/engine/squares';

const root = new URL('../', import.meta.url);
const path = (p: string) => new URL(p, root);
const read = (p: string) => readFileSync(path(p));

const ephMeta = JSON.parse(read('static/data/ephem.json').toString());
const ebuf = read('static/data/ephem.bin');
const eph: Ephem = { ...ephMeta, rec: new Float32Array(ebuf.buffer, ebuf.byteOffset, ebuf.byteLength / 4) };
const sites: SitesData = JSON.parse(read('static/data/sites.json').toString());
const hbuf = read('static/data/horizons.bin');
const raw = new Int16Array(hbuf.buffer, hbuf.byteOffset, hbuf.byteLength / 2);

const metaPath = 'static/data/squares/squares.json';
const meta: SquareMeta | null = existsSync(path(metaPath)) ? JSON.parse(read(metaPath).toString()) : null;

describe('detail square centre = site card', () => {
	if (!meta) {
		it.skip('no static/data/squares/squares.json', () => {});
		return;
	}
	const m = meta;
	const n = m.n;
	const c = (n - 1) / 2;
	const start = Date.parse(m.period_utc[0]) / 1000;
	const i0 = Math.round((start - eph.start_unix) / eph.step_s);
	const hours = parseFloat(/([\d.]+)\s*h/.exec(m.period_utc[1])![1]);
	const i1 = i0 + Math.round((hours * 3600) / eph.step_s);

	for (const s of sites.sites) {
		const file = `static/data/squares/${s.id}.bin`;
		const present = existsSync(path(file));
		(present ? it : it.skip)(`${s.id}`, () => {
			const buf = new Uint8Array(read(file));
			expect(buf.length).toBe(7 * n * n);
			const sq = makeSquare(s.id, 'exact', s.lat, s.lon, m, buf);
			const si = sites.sites.indexOf(s);
			const profs = splitHorizons(raw, sites.heights_m.length, sites.n_az, si);
			for (const h of m.heights_m) {
				const hi = sites.heights_m.indexOf(h);
				expect(hi).toBeGreaterThanOrEqual(0);
				const ser = computeSeries(profs[hi], s.lat, s.lon, siteRadius(s.elevation_m, h), eph, i0, i1, m.earth_margin_deg);
				const st = stats(ser, eph.step_s / 3600);
				const P = planesFor(sq, h);
				expect(P.heightM).toBe(h);
				const k = c * n + c;
				const sun = P.sun[k] / 2;
				const earth = P.earth[k] / 2;
				expect(Math.abs(sun - st.sunPct), `${s.id} ${h} m sun`).toBeLessThanOrEqual(0.5 + 1e-9);
				expect(Math.abs(earth - st.earthPct), `${s.id} ${h} m earth`).toBeLessThanOrEqual(0.5 + 1e-9);
				const night = P.night[k];
				const nightD = st.longestNightH / 24;
				if (night === 254) expect(st.sunPct).toBe(0);
				else if (night === 253) expect(nightD).toBeGreaterThanOrEqual(252);
				else expect(Math.abs(nightDays(night) - nightD), `${s.id} ${h} m night`).toBeLessThanOrEqual(1);
			}
		});
	}
});

describe('square helpers', () => {
	// synthetic 5 x 5 square: sun rises to the east, one steep bright cell
	const n = 5;
	const n2 = n * n;
	const data = new Uint8Array(7 * n2);
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			const i = r * n + c;
			data[i] = 100 + c * 10; // sun@2
			data[n2 + i] = 120; // earth@2
			data[2 * n2 + i] = 10 - c; // night@2
			data[3 * n2 + i] = 150; // sun@10
			data[4 * n2 + i] = 150;
			data[5 * n2 + i] = 5;
			data[6 * n2 + i] = 4 * 3; // slope 3 deg
		}
	data[6 * n2 + 2 * n + 4] = 4 * 25; // the brightest middle-east cell is steep
	const sq = makeSquare(
		'x',
		'exact',
		-89.5,
		45,
		{ cell_m: 100, n, heights_m: [2, 10], earth_margin_deg: 1, period_utc: ['2026-11-01T00:00:00Z', '+8766 h'], method: '' },
		data
	);

	it('picks the nearest computed height', () => {
		expect(planesFor(sq, 0).heightM).toBe(2);
		expect(planesFor(sq, 5).heightM).toBe(2);
		expect(planesFor(sq, 7).heightM).toBe(10);
		expect(planesFor(sq, 20).heightM).toBe(10);
	});
	it('spread within 100 m covers the centre and its 4 neighbours', () => {
		const sp = spread(sq, 2, 100)!;
		expect(sp.cells).toBe(5);
		expect(sp.sun.min).toBe(55);
		expect(sp.sun.max).toBe(65);
	});
	it('best spot skips cells steeper than the limit', () => {
		const b = bestSpot(sq, 2, 10)!;
		expect(b.slopeDeg).toBe(3);
		expect(b.c).toBe(4);
		expect(b.r).not.toBe(2);
		const steep = bestSpot(sq, 2, 30)!;
		expect([steep.r, steep.c]).toEqual([2, 4]);
		expect(bestSpot(sq, 2, 2)).toBeNull();
	});
});
