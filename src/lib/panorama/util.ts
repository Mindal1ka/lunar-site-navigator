// AI-assisted: written with Claude, reviewed by the team.
// Small helpers for the 360° panorama: angle wrapping, smoothing, nice scales, colours.

/** Signed shortest difference a - b in degrees, in [-180, 180). */
export function wrapDelta(d: number): number {
	return ((((d + 180) % 360) + 360) % 360) - 180;
}

export const norm360 = (a: number) => ((a % 360) + 360) % 360;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Frame-rate independent exponential approach factor. */
export const approach = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

export const easeOutQuart = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 4);
export const easeOutBack = (x: number) => {
	const c1 = 1.2;
	const c3 = c1 + 1;
	const t = clamp(x, 0, 1) - 1;
	return 1 + c3 * t * t * t + c1 * t * t;
};

/** Circular box blur of a horizon profile (half = bins on each side). */
export function smoothCircular(src: ArrayLike<number>, out: Float32Array, half: number): Float32Array {
	const n = src.length;
	const w = 2 * half + 1;
	let s = 0;
	for (let j = -half; j <= half; j++) s += src[((j % n) + n) % n];
	for (let k = 0; k < n; k++) {
		out[k] = s / w;
		s += src[(k + half + 1) % n] - src[(((k - half) % n) + n) % n];
	}
	return out;
}

export function minMax(a: ArrayLike<number>, n = a.length): [number, number] {
	let lo = Infinity, hi = -Infinity;
	for (let i = 0; i < n; i++) {
		const v = a[i];
		if (v < lo) lo = v;
		if (v > hi) hi = v;
	}
	return [lo, hi];
}

const NICE_SCALE = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100];

/** Largest "nice" vertical exaggeration not above raw (at least 1). */
export function niceScale(raw: number): number {
	let best = 1;
	for (const s of NICE_SCALE) if (s <= raw) best = s;
	return best;
}

/** Smallest step from the list whose pixel spacing is at least minPx. */
export function pickStep(steps: number[], pxPerUnit: number, minPx: number): number {
	for (const s of steps) if (s * pxPerUnit >= minPx) return s;
	return steps[steps.length - 1];
}

export type RGB = [number, number, number];

export function parseColor(css: string, fallback: RGB): RGB {
	const s = css.trim();
	const hex = /^#([0-9a-f]{6})$/i.exec(s);
	if (hex) {
		const v = parseInt(hex[1], 16);
		return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
	}
	const m = /rgba?\(([^)]+)\)/i.exec(s);
	if (m) {
		const p = m[1].split(',').map((x) => parseFloat(x));
		if (p.length >= 3 && p.every((x) => Number.isFinite(x))) return [p[0], p[1], p[2]];
	}
	return fallback;
}

export const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1).toFixed(3)})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Deterministic PRNG (mulberry32) so the star field is the same on every load. */
export function prng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
