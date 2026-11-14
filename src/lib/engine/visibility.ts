// AI-assisted: written with Claude, reviewed by the team.
// Sun / Earth visibility over the terrain horizon. TypeScript port of
// pipeline/horizon.py::visibility_series, checked against tests/golden.json.

import { AU_KM, MOON_R_M, SUN_R_KM, elAz, localFrame } from './geo';
import type { Ephem } from './data';

const R2D = 180 / Math.PI;

/** Horizon elevation (deg) at azimuth (deg); bins centred at (k + 0.5) * 360 / n. */
export function horizonAt(prof: ArrayLike<number>, azDeg: number): number {
	const n = prof.length;
	const f = ((((azDeg % 360) + 360) % 360) / 360) * n - 0.5;
	const i0 = Math.floor(f);
	const t = f - i0;
	const a = prof[((i0 % n) + n) % n];
	const b = prof[(((i0 + 1) % n) + n) % n];
	return a + (b - a) * t;
}

/** Visible fraction of a disk whose centre is u radii above a straight horizon. */
export function diskFraction(u: number): number {
	if (u >= 1) return 1;
	if (u <= -1) return 0;
	return 1 - (Math.acos(u) - u * Math.sqrt(1 - u * u)) / Math.PI;
}

export interface Series {
	i0: number;
	n: number;
	sunFrac: Float32Array;
	sunEl: Float32Array;
	sunAz: Float32Array;
	earthEl: Float32Array;
	earthAz: Float32Array;
	earthVis: Uint8Array;
	/** horizon elevation under the Sun / Earth at each step (for charts) */
	sunHorizon: Float32Array;
}

export function computeSeries(
	prof: ArrayLike<number>,
	lat: number,
	lon: number,
	siteRadiusM: number,
	eph: Ephem,
	i0: number,
	i1: number,
	earthMarginDeg: number
): Series {
	const f = localFrame(lat, lon);
	const n = Math.max(0, Math.min(i1, eph.count) - i0);
	const s: Series = {
		i0,
		n,
		sunFrac: new Float32Array(n),
		sunEl: new Float32Array(n),
		sunAz: new Float32Array(n),
		earthEl: new Float32Array(n),
		earthAz: new Float32Array(n),
		earthVis: new Uint8Array(n),
		sunHorizon: new Float32Array(n)
	};
	const pKm = [f.up[0] * siteRadiusM / 1000, f.up[1] * siteRadiusM / 1000, f.up[2] * siteRadiusM / 1000];
	const rec = eph.rec;
	const e = [0, 0, 0];
	for (let k = 0; k < n; k++) {
		const o = (i0 + k) * 7;
		const [el, az] = elAz([rec[o], rec[o + 1], rec[o + 2]], f);
		const rSun = Math.asin(SUN_R_KM / (rec[o + 3] * AU_KM)) * R2D;
		const hor = horizonAt(prof, az);
		s.sunFrac[k] = diskFraction((el - hor) / rSun);
		s.sunEl[k] = el;
		s.sunAz[k] = az;
		s.sunHorizon[k] = hor;
		e[0] = rec[o + 4] - pKm[0];
		e[1] = rec[o + 5] - pKm[1];
		e[2] = rec[o + 6] - pKm[2];
		const len = Math.hypot(e[0], e[1], e[2]);
		e[0] /= len;
		e[1] /= len;
		e[2] /= len;
		const [eel, eaz] = elAz(e, f);
		s.earthEl[k] = eel;
		s.earthAz[k] = eaz;
		s.earthVis[k] = eel - horizonAt(prof, eaz) > earthMarginDeg ? 1 : 0;
	}
	return s;
}

export interface Stats {
	sunPct: number;
	/** share of time with the Sun partially (0 < f < 1) visible */
	partialPct: number;
	earthPct: number;
	/** share of time with both Sun (any part) and Earth visible */
	bothPct: number;
	longestNightH: number;
	longestNightStart: number;
	maxSunEl: number;
}

export function stats(s: Series, stepH = 1): Stats {
	let sum = 0, partial = 0, earth = 0, both = 0, run = 0, best = 0, bestStart = 0, maxEl = -90;
	for (let k = 0; k < s.n; k++) {
		const fr = s.sunFrac[k];
		sum += fr;
		if (fr > 0 && fr < 1) partial++;
		earth += s.earthVis[k];
		if (fr > 0 && s.earthVis[k]) both++;
		if (fr === 0) {
			run++;
			if (run > best) {
				best = run;
				bestStart = k - run + 1;
			}
		} else run = 0;
		if (s.sunEl[k] > maxEl) maxEl = s.sunEl[k];
	}
	const n = Math.max(1, s.n);
	return {
		sunPct: (100 * sum) / n,
		partialPct: (100 * partial) / n,
		earthPct: (100 * earth) / n,
		bothPct: (100 * both) / n,
		longestNightH: best * stepH,
		longestNightStart: s.i0 + bestStart,
		maxSunEl: maxEl
	};
}

export interface BestWindow {
	i0: number;
	i1: number;
	score: number;
	sunPct: number;
	earthPct: number;
}

/**
 * Windows of `lenSteps` with the highest share of hours where the Sun (weighted by
 * visible disk fraction) AND the Earth are visible at the same time. Non-overlapping, top `k`.
 */
export function bestWindows(s: Series, lenSteps: number, k = 3): BestWindow[] {
	const n = s.n;
	if (lenSteps <= 0 || lenSteps > n) return [];
	const both = new Float64Array(n + 1), sun = new Float64Array(n + 1), earth = new Float64Array(n + 1);
	for (let i = 0; i < n; i++) {
		both[i + 1] = both[i] + s.sunFrac[i] * s.earthVis[i];
		sun[i + 1] = sun[i] + s.sunFrac[i];
		earth[i + 1] = earth[i] + s.earthVis[i];
	}
	const cand: BestWindow[] = [];
	const stride = Math.max(1, Math.floor(lenSteps / 24));
	for (let a = 0; a + lenSteps <= n; a += stride) {
		const b = a + lenSteps;
		cand.push({
			i0: s.i0 + a,
			i1: s.i0 + b,
			score: (both[b] - both[a]) / lenSteps,
			sunPct: (100 * (sun[b] - sun[a])) / lenSteps,
			earthPct: (100 * (earth[b] - earth[a])) / lenSteps
		});
	}
	cand.sort((x, y) => y.score - x.score);
	const out: BestWindow[] = [];
	for (const c of cand) {
		if (out.every((o) => c.i1 <= o.i0 || c.i0 >= o.i1)) out.push(c);
		if (out.length === k) break;
	}
	return out;
}

/** Battery capacity (Wh) to survive the longest night: load x hours / allowed depth of discharge. */
export function batteryWh(loadW: number, longestNightH: number, depthOfDischarge: number): number {
	return (loadW * longestNightH) / Math.max(0.05, depthOfDischarge);
}

export function siteRadius(elevationM: number, heightM: number): number {
	return MOON_R_M + elevationM + heightM;
}

export const timeOf = (eph: Ephem, i: number) => new Date((eph.start_unix + i * eph.step_s) * 1000);
export const indexOf = (eph: Ephem, d: Date) => Math.round((d.getTime() / 1000 - eph.start_unix) / eph.step_s);

/** Linear interpolation of the ephemeris at a fractional index (Sun dir renormalised). */
export function ephemAt(eph: Ephem, t: number): { sunDir: [number, number, number]; sunAu: number; earthKm: [number, number, number] } {
	const i = Math.max(0, Math.min(eph.count - 2, Math.floor(t)));
	const a = Math.max(0, Math.min(1, t - i));
	const r = eph.rec;
	const o = i * 7, p = o + 7;
	const L = (k: number) => r[o + k] + (r[p + k] - r[o + k]) * a;
	const sx = L(0), sy = L(1), sz = L(2);
	const n = Math.hypot(sx, sy, sz);
	return { sunDir: [sx / n, sy / n, sz / n], sunAu: L(3), earthKm: [L(4), L(5), L(6)] };
}

export interface Instant {
	sunEl: number;
	sunAz: number;
	sunFrac: number;
	sunRadiusDeg: number;
	horizonUnderSun: number;
	earthEl: number;
	earthAz: number;
	earthVisible: boolean;
	horizonUnderEarth: number;
	/** Earth illuminated fraction as seen from the Moon (0 new .. 1 full) */
	earthPhase: number;
}

/** Sun / Earth state at a fractional ephemeris index for one site. */
export function instantAt(
	prof: ArrayLike<number>,
	lat: number,
	lon: number,
	siteRadiusM: number,
	eph: Ephem,
	t: number,
	earthMarginDeg: number
): Instant {
	const f = localFrame(lat, lon);
	const { sunDir, sunAu, earthKm } = ephemAt(eph, t);
	const [sunEl, sunAz] = elAz(sunDir, f);
	const rSun = Math.asin(SUN_R_KM / (sunAu * AU_KM)) * R2D;
	const hs = horizonAt(prof, sunAz);
	const pk = siteRadiusM / 1000;
	const e: [number, number, number] = [earthKm[0] - f.up[0] * pk, earthKm[1] - f.up[1] * pk, earthKm[2] - f.up[2] * pk];
	const el = Math.hypot(e[0], e[1], e[2]);
	const eu: [number, number, number] = [e[0] / el, e[1] / el, e[2] / el];
	const [earthEl, earthAz] = elAz(eu, f);
	const he = horizonAt(prof, earthAz);
	// phase angle at Earth between Sun and Moon directions ~ angle(sun, -earth) seen from the Moon
	const cosElong = sunDir[0] * eu[0] + sunDir[1] * eu[1] + sunDir[2] * eu[2];
	const earthPhase = (1 - cosElong) / 2;
	return {
		sunEl, sunAz, sunFrac: diskFraction((sunEl - hs) / rSun), sunRadiusDeg: rSun, horizonUnderSun: hs,
		earthEl, earthAz, earthVisible: earthEl - he > earthMarginDeg, horizonUnderEarth: he, earthPhase
	};
}
