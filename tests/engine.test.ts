// AI-assisted: written with Claude, reviewed by the team.
// The TypeScript engine must reproduce the validated Python reference (tests/golden.json,
// written by pipeline/golden.py from the same browser data files).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitHorizons, type Ephem, type SitesData } from '../src/lib/engine/data';
import { computeSeries, stats, siteRadius, bestWindows, batteryWh, diskFraction, horizonAt } from '../src/lib/engine/visibility';
import { latLonToXY, xyToLatLon } from '../src/lib/engine/geo';

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root));
const ephMeta = JSON.parse(read('static/data/ephem.json').toString());
const ebuf = read('static/data/ephem.bin');
const eph: Ephem = { ...ephMeta, rec: new Float32Array(ebuf.buffer, ebuf.byteOffset, ebuf.byteLength / 4) };
const sites: SitesData = JSON.parse(read('static/data/sites.json').toString());
const hbuf = read('static/data/horizons.bin');
const raw = new Int16Array(hbuf.buffer, hbuf.byteOffset, hbuf.byteLength / 2);
const golden = JSON.parse(read('tests/golden.json').toString());

describe('engine vs Python reference', () => {
	for (const g of golden) {
		it(`${g.site} h=${g.height_m} m [${g.i0}, ${g.i1})`, () => {
			const si = sites.sites.findIndex((s) => s.id === g.site);
			const s = sites.sites[si];
			const hi = sites.heights_m.indexOf(g.height_m);
			const prof = splitHorizons(raw, sites.heights_m.length, sites.n_az, si)[hi];
			const ser = computeSeries(prof, s.lat, s.lon, siteRadius(s.elevation_m, g.height_m), eph, g.i0, g.i1, 1);
			const st = stats(ser);
			expect(st.sunPct).toBeCloseTo(g.sun_mean * 100, 2);
			expect(st.earthPct).toBeCloseTo(g.earth_frac * 100, 1);
			expect(st.longestNightH).toBe(g.longest_night_h);
			for (const p of g.sample) {
				expect(ser.sunEl[p.i]).toBeCloseTo(p.sun_el, 4);
				expect(ser.earthEl[p.i]).toBeCloseTo(p.earth_el, 4);
				expect(ser.sunFrac[p.i]).toBeCloseTo(p.sun_frac, 3);
				const daz = ((ser.sunAz[p.i] - p.sun_az + 540) % 360) - 180;
				expect(Math.abs(daz)).toBeLessThan(1e-3);
			}
		});
	}
});

describe('helpers', () => {
	it('projection round-trips', () => {
		for (const [lat, lon] of [[-89.5, 10], [-85, 222.7], [-80.5, 300]]) {
			const [x, y] = latLonToXY(lat, lon);
			const [la, lo] = xyToLatLon(x, y);
			expect(la).toBeCloseTo(lat, 9);
			expect(lo).toBeCloseTo(lon, 9);
		}
	});
	it('disk fraction limits and half disk', () => {
		expect(diskFraction(2)).toBe(1);
		expect(diskFraction(-2)).toBe(0);
		expect(diskFraction(0)).toBeCloseTo(0.5, 12);
	});
	it('horizon interpolation wraps around north', () => {
		const p = new Float32Array(4).fill(0);
		p[0] = 4;
		p[3] = 0;
		expect(horizonAt(p, 45)).toBeCloseTo(4, 6);
		expect(horizonAt(p, 0)).toBeCloseTo(2, 6);
		expect(horizonAt(p, 360)).toBeCloseTo(2, 6);
	});
	it('battery formula', () => {
		expect(batteryWh(100, 240, 0.8)).toBeCloseTo(30000, 6);
	});
	it('best windows do not overlap', () => {
		const s = sites.sites[0];
		const prof = splitHorizons(raw, sites.heights_m.length, sites.n_az, 0)[2];
		const ser = computeSeries(prof, s.lat, s.lon, siteRadius(s.elevation_m, 2), eph, 0, 8766, 1);
		const w = bestWindows(ser, 14 * 24, 3);
		expect(w.length).toBe(3);
		for (let i = 0; i < w.length; i++)
			for (let j = i + 1; j < w.length; j++) expect(w[i].i1 <= w[j].i0 || w[i].i0 >= w[j].i1).toBe(true);
		expect(w[0].score).toBeGreaterThanOrEqual(w[1].score);
	});
});
