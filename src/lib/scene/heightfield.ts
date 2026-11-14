// AI-assisted: written with Claude, reviewed by the team.
// CPU copy of the terrain the GPU draws: bilinear heights from the LOLA overview
// and the 40 m site tiles, plus a heightfield ray cast for picking and occlusion.
// Grid convention (pipeline/terrain.py): sample (r, c) is the cell centre
// x = x0 + (c + 0.5) * step, y = y0 - (r + 0.5) * step.

import type { Grid } from '#lib/engine/data.ts';
import { sceneToMap } from './coords';

export interface DetailSlot {
	grid: Grid;
	/** 0..1 blend weight (animated fade-in) */
	weight: number;
}

/** Edge fade of a detail tile, as a fraction of its width (must match the shader). */
export const DETAIL_FADE = 0.14;

function sample(g: Grid, xKm: number, yKm: number): number {
	const fx = (xKm * 1000 - g.x0_m) / g.step_m - 0.5;
	const fy = (g.y0_m - yKm * 1000) / g.step_m - 0.5;
	const n = g.size;
	const c0 = Math.max(0, Math.min(n - 1, Math.floor(fx)));
	const r0 = Math.max(0, Math.min(n - 1, Math.floor(fy)));
	const c1 = Math.min(n - 1, c0 + 1);
	const r1 = Math.min(n - 1, r0 + 1);
	const tx = Math.max(0, Math.min(1, fx - c0));
	const ty = Math.max(0, Math.min(1, fy - r0));
	const h = g.heights;
	const a = h[r0 * n + c0] + (h[r0 * n + c1] - h[r0 * n + c0]) * tx;
	const b = h[r1 * n + c0] + (h[r1 * n + c1] - h[r1 * n + c0]) * tx;
	return a + (b - a) * ty;
}

const sstep = (e0: number, e1: number, x: number) => {
	const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
};

export function detailWeight(g: Grid, xKm: number, yKm: number): number {
	const ext = g.size * g.step_m;
	const u = (xKm * 1000 - g.x0_m) / ext;
	const v = (g.y0_m - yKm * 1000) / ext;
	if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
	return sstep(0, DETAIL_FADE, u) * sstep(0, DETAIL_FADE, 1 - u) * sstep(0, DETAIL_FADE, v) * sstep(0, DETAIL_FADE, 1 - v);
}

export class Heightfield {
	overview: Grid | null = null;
	details: (DetailSlot | null)[] = [null, null];
	halfKm = 210;

	setOverview(g: Grid) {
		this.overview = g;
		this.halfKm = (-g.x0_m / 1000) | 0;
	}

	inside(xKm: number, yKm: number) {
		return Math.abs(xKm) < this.halfKm && Math.abs(yKm) < this.halfKm;
	}

	/** True height (m) at map point (km), detail tiles blended in like the shader. */
	heightM(xKm: number, yKm: number): number {
		if (!this.overview) return 0;
		let h = sample(this.overview, xKm, yKm);
		for (const d of this.details) {
			if (!d || d.weight <= 0) continue;
			const w = detailWeight(d.grid, xKm, yKm) * d.weight;
			if (w > 0) h += (sample(d.grid, xKm, yKm) - h) * w;
		}
		return h;
	}

	/**
	 * Ray against the displayed (exaggerated) surface. Returns the distance along
	 * the ray (km) or null. Coarse march with a step tied to the clearance, then bisection.
	 */
	raycast(o: ArrayLike<number>, d: ArrayLike<number>, exag: number, maxT = 4000): number | null {
		if (!this.overview) return null;
		let t = 0;
		let prev = 0;
		let prevAbove = true;
		for (let i = 0; i < 1600 && t < maxT; i++) {
			const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
			const m = sceneToMap(x, y, z);
			if (!this.inside(m.mx, m.my)) {
				// outside the map: keep marching only while heading inwards
				if (t > 0 && i > 4 && Math.hypot(m.mx, m.my) > this.halfKm * 1.6) return null;
				prev = t;
				t += Math.max(0.5, Math.hypot(m.mx, m.my) - this.halfKm);
				continue;
			}
			const gap = m.alt - (this.heightM(m.mx, m.my) / 1000) * exag;
			if (gap <= 0 && prevAbove && i > 0) {
				let a = prev, b = t;
				for (let k = 0; k < 24; k++) {
					const c = (a + b) / 2;
					const mm = sceneToMap(o[0] + d[0] * c, o[1] + d[1] * c, o[2] + d[2] * c);
					const g = mm.alt - (this.heightM(mm.mx, mm.my) / 1000) * exag;
					if (g > 0) a = c;
					else b = c;
				}
				return (a + b) / 2;
			}
			prevAbove = gap > 0;
			prev = t;
			t += Math.max(0.02, Math.min(8, gap * 0.6));
		}
		return null;
	}

	/** Is the straight segment a -> b blocked by the displayed terrain? */
	occluded(a: ArrayLike<number>, b: ArrayLike<number>, exag: number, samples = 28): boolean {
		for (let i = 1; i < samples; i++) {
			const f = i / samples;
			const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
			const m = sceneToMap(x, y, z);
			if (!this.inside(m.mx, m.my)) continue;
			if (m.alt < (this.heightM(m.mx, m.my) / 1000) * exag - 0.02) return true;
		}
		return false;
	}
}
