// AI-assisted: written with Claude, reviewed by the team.
// Per-hour Sun / Earth bands baked into 1-px-tall textures. A texture is rebuilt only
// when its series changes; every frame just blits it, so scrubbing and zoom stay at 60 fps.

import type { Series } from '#lib/engine/visibility.ts';

type RGB = [number, number, number];

export interface Palette {
	sun: RGB;
	partial: RGB;
	night: RGB;
	earth: RGB;
	earthOff: RGB;
}

export interface BandTex {
	/** ephemeris index range covered by the texture, [i0, i1) */
	i0: number;
	i1: number;
	cols: number;
	sun: HTMLCanvasElement;
	earth: HTMLCanvasElement;
	series: Series;
}

function hex(v: string, fb: RGB): RGB {
	const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
	if (!m) return fb;
	const n = parseInt(m[1], 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Read the design tokens so the bands match the rest of the app. */
export function readPalette(el: Element = document.documentElement): Palette {
	const cs = getComputedStyle(el);
	return {
		sun: hex(cs.getPropertyValue('--sun'), [255, 181, 71]),
		// partial disk: a distinct, deeper coral so "grazing" hours read differently from full sun
		partial: [255, 110, 70],
		night: hex(cs.getPropertyValue('--night'), [109, 106, 146]).map((c) => Math.round(c * 0.62)) as RGB,
		earth: hex(cs.getPropertyValue('--earth'), [92, 200, 255]),
		earthOff: [40, 52, 74]
	};
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function canvas(w: number): [HTMLCanvasElement, CanvasRenderingContext2D, ImageData] {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = 1;
	const g = c.getContext('2d')!;
	return [c, g, g.createImageData(w, 1)];
}

/**
 * Bake a series into two textures (Sun, Earth). Long series are binned by averaging,
 * so a 4-year strip never aliases: a column's colour is the mean of its hours.
 */
export function bakeBands(s: Series, maxCols: number, pal: Palette): BandTex | null {
	const n = s.n;
	if (n <= 0 || typeof document === 'undefined') return null;
	const cols = Math.min(n, maxCols);
	const [sc, sg, sd] = canvas(cols);
	const [ec, eg, ed] = canvas(cols);
	const sp = sd.data, ep = ed.data;
	for (let c = 0; c < cols; c++) {
		const k0 = Math.floor((c * n) / cols);
		const k1 = Math.max(k0 + 1, Math.floor(((c + 1) * n) / cols));
		let sum = 0, partial = 0, lit = 0, earth = 0;
		for (let k = k0; k < k1; k++) {
			const f = s.sunFrac[k];
			sum += f;
			if (f > 0) {
				lit++;
				if (f < 1) partial++;
			}
			earth += s.earthVis[k];
		}
		const len = k1 - k0;
		const m = sum / len;
		const p = lit ? partial / lit : 0;
		const o = c * 4;
		// Sun: night violet -> amber; partial share pulls towards coral; brightness = visible fraction
		const tone = m > 0 ? Math.max(0.35, m) : 0;
		for (let j = 0; j < 3; j++) sp[o + j] = Math.round(lerp(pal.night[j], lerp(pal.sun[j], pal.partial[j], p), tone));
		sp[o + 3] = Math.round(255 * lerp(0.55, 1, m));
		const e = earth / len;
		for (let j = 0; j < 3; j++) ep[o + j] = Math.round(lerp(pal.earthOff[j], pal.earth[j], e));
		ep[o + 3] = Math.round(255 * lerp(0.55, 0.96, e));
	}
	sg.putImageData(sd, 0, 0);
	eg.putImageData(ed, 0, 0);
	return { i0: s.i0, i1: s.i0 + n, cols, sun: sc, earth: ec, series: s };
}

/** Value lookup for readouts: Sun fraction and Earth visibility at absolute index i (or null). */
export function sample(tex: BandTex | null, i: number): { sun: number; earth: boolean } | null {
	if (!tex) return null;
	const k = Math.floor(i) - tex.series.i0;
	if (k < 0 || k >= tex.series.n) return null;
	return { sun: tex.series.sunFrac[k], earth: tex.series.earthVis[k] === 1 };
}
