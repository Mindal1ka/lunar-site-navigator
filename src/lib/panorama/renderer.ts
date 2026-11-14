// AI-assisted: written with Claude, reviewed by the team.
// Canvas 2D renderer of the 360° horizon panorama. Pure drawing: it receives the
// view (camera + vertical scale) and the scene (horizon profiles, Sun, Earth, paths)
// computed by the engine, and paints one frame. No physics is derived here.

import { horizonAt } from '#lib/engine/visibility.ts';
import {
	clamp,
	minMax,
	mix,
	parseColor,
	pickStep,
	prng,
	rgba,
	smoothCircular,
	wrapDelta,
	type RGB
} from './util.ts';

export interface Viewport {
	/** canvas size in CSS px */
	W: number;
	H: number;
	dpr: number;
	/** screen x of the camera azimuth */
	cx: number;
	camAz: number;
	/** px per degree of azimuth / of elevation (= ppd x vertical scale) */
	ppd: number;
	ppdV: number;
	/** y = yRef - (el - elRef) * ppdV */
	yRef: number;
	elRef: number;
	safe: { top: number; bottom: number; left: number; right: number };
	/** y of the azimuth ruler baseline */
	rulerY: number;
}

export interface SunState {
	az: number;
	el: number;
	rDeg: number;
	frac: number;
}
export interface EarthState {
	az: number;
	el: number;
	rDeg: number;
	phase: number;
	visible: boolean;
}
export interface PathData {
	az: Float32Array;
	el: Float32Array;
	frac: Float32Array;
	n: number;
	/** fractional index of "now" inside the arrays */
	now: number;
}
export interface LoopData {
	az: Float32Array;
	el: Float32Array;
	vis: Uint8Array;
	n: number;
}

export interface Labels {
	sun: string;
	sunHidden: string;
	sunPartial: (pct: string) => string;
	earth: string;
	earthHidden: string;
	azimuth: string;
	horizon: string;
	siteA: string;
	siteB: string;
	flat: string;
	cardinals: [string, string, string, string];
	fmt: (v: number, digits: number) => string;
}

export interface SceneInput {
	profA: Float32Array;
	profB: Float32Array | null;
	alphaB: number;
	marginDeg: number;
	sun: SunState | null;
	earth: EarthState | null;
	sunPath: PathData | null;
	/** 0..1: how much of the Sun path is drawn (intro animation) */
	pathReveal: number;
	earthLoop: LoopData | null;
	hover: { x: number; y: number } | null;
	/** intro progress per terrain layer (0 = below screen, 1 = in place) */
	rise: [number, number, number];
	starsAlpha: number;
	bodiesAlpha: number;
	/** sky rotation offset (deg) applied to the star field */
	starRot: number;
	teacher: boolean;
	labels: Labels;
}

interface Palette {
	sun: RGB;
	sunSoft: RGB;
	earth: RGB;
	earthSoft: RGB;
	night: RGB;
	siteA: RGB;
	siteB: RGB;
	text: RGB;
	text2: RGB;
	text3: RGB;
	bg: RGB;
	danger: RGB;
}

const FONT_MONO = "'JetBrains Mono Variable', ui-monospace, monospace";
const FONT_UI = "'Inter Variable', system-ui, sans-serif";
const FONT_DISPLAY = "'Space Grotesk Variable', 'Inter Variable', system-ui, sans-serif";

const N_STARS = 4200;

export class PanoramaRenderer {
	readonly ctx: CanvasRenderingContext2D;
	private pal: Palette;
	private stars: { az: Float32Array; fy: Float32Array; size: Float32Array; bucket: Uint8Array; rank: Float32Array };
	private sm1 = new Float32Array(0);
	private sm2 = new Float32Array(0);
	private xs = new Float32Array(0);
	private y0 = new Float32Array(0);
	private y1 = new Float32Array(0);
	private y2 = new Float32Array(0);
	private ud = new Float32Array(0);
	private grain: CanvasPattern | null = null;

	constructor(
		readonly canvas: HTMLCanvasElement,
		css: CSSStyleDeclaration
	) {
		const ctx = canvas.getContext('2d', { alpha: false });
		if (!ctx) throw new Error('Canvas 2D is not available');
		this.ctx = ctx;
		const v = (name: string, fb: RGB) => parseColor(css.getPropertyValue(name), fb);
		this.pal = {
			sun: v('--sun', [255, 181, 71]),
			sunSoft: v('--sun-soft', [255, 213, 138]),
			earth: v('--earth', [92, 200, 255]),
			earthSoft: v('--earth-soft', [166, 226, 255]),
			night: v('--night', [109, 106, 146]),
			siteA: v('--site-a', [255, 255, 255]),
			siteB: v('--site-b', [196, 155, 255]),
			text: v('--text', [238, 241, 246]),
			text2: v('--text-2', [167, 175, 189]),
			text3: v('--text-3', [107, 115, 131]),
			bg: v('--bg', [4, 6, 10]),
			danger: v('--danger', [255, 107, 107])
		};
		this.stars = makeStars();
		this.grain = makeGrain(ctx);
	}

	// ------------------------------------------------------------------ frame
	draw(v: Viewport, s: SceneInput) {
		const { ctx } = this;
		ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.setLineDash([]);

		this.sky(v, s);
		this.starField(v, s);
		if (s.sun) this.sunBehind(v, s.sun, s.bodiesAlpha);
		if (s.earth) this.earthDisk(v, s.earth, s.sun, s.bodiesAlpha);
		const skyline = this.terrain(v, s);
		this.zeroLine(v, s);
		this.marginBand(v, s);
		if (s.profB && s.alphaB > 0.01) this.outlineB(v, s.profB, s.alphaB * s.rise[0]);
		if (s.earthLoop) {
			// keep the loop from striking through the Earth disk
			this.ctx.save();
			if (s.earth) {
				const clip = new Path2D();
				clip.rect(0, 0, v.W, v.H);
				const r = this.earthRadiusPx(v, s.earth) + 3;
				for (const x of this.copies(v, s.earth.az, 80)) {
					clip.moveTo(x + r, this.y(v, s.earth.el));
					clip.arc(x, this.y(v, s.earth.el), r, 0, Math.PI * 2);
				}
				this.ctx.clip(clip, 'evenodd');
			}
			this.earthLoop(v, s.earthLoop, s.bodiesAlpha);
			this.ctx.restore();
		}
		if (s.sunPath) this.sunPath(v, s.sunPath, s.pathReveal, s.bodiesAlpha);
		this.markers(v, s);
		this.axes(v, s, skyline);
		if (s.hover) this.crosshair(v, s, s.hover);
	}

	// ------------------------------------------------------------------ helpers
	private y(v: Viewport, el: number) {
		return v.yRef - (el - v.elRef) * v.ppdV;
	}

	/** Screen x of every visible copy of an azimuth (the panorama wraps). */
	private copies(v: Viewport, az: number, pad = 120): number[] {
		const d = wrapDelta(az - v.camAz);
		const out: number[] = [];
		for (let k = -2; k <= 2; k++) {
			const x = v.cx + (d + 360 * k) * v.ppd;
			if (x > -pad && x < v.W + pad) out.push(x);
		}
		return out;
	}

	/** The copy closest to the camera centre. */
	nearestX(v: Viewport, az: number): number {
		return v.cx + wrapDelta(az - v.camAz) * v.ppd;
	}

	private ensure(n: number) {
		if (this.xs.length < n) {
			const m = Math.ceil(n * 1.25);
			this.xs = new Float32Array(m);
			this.y0 = new Float32Array(m);
			this.y1 = new Float32Array(m);
			this.y2 = new Float32Array(m);
		}
	}

	/** Visible bin range [k0, k1] (unbounded integers) for a profile of n bins. */
	private binRange(v: Viewport, n: number): [number, number] {
		const step = 360 / n;
		const azL = v.camAz - v.cx / v.ppd;
		const azR = v.camAz + (v.W - v.cx) / v.ppd;
		return [Math.floor(azL / step - 0.5) - 1, Math.ceil(azR / step - 0.5) + 1];
	}

	/** Horizontal gradient whose colour depends on azimuth. */
	private azGradient(v: Viewport, color: (az: number) => string, stops = 64): CanvasGradient {
		const g = this.ctx.createLinearGradient(0, 0, v.W, 0);
		for (let i = 0; i <= stops; i++) {
			const x = (i / stops) * v.W;
			g.addColorStop(i / stops, color(v.camAz + (x - v.cx) / v.ppd));
		}
		return g;
	}

	private pill(x: number, y: number, text: string, color: RGB, alpha = 1, align: 'left' | 'right' | 'center' = 'left') {
		const { ctx } = this;
		ctx.font = `600 11.5px ${FONT_UI}`;
		const w = ctx.measureText(text).width + 16;
		const h = 22;
		let x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
		const y0 = y - h / 2;
		ctx.globalAlpha = alpha;
		ctx.fillStyle = 'rgba(8,11,18,0.78)';
		ctx.strokeStyle = rgba(color, 0.45);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(x0, y0, w, h, 11);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = rgba(color, 1);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, x0 + 8, y + 0.5);
		ctx.globalAlpha = 1;
		return w;
	}

	// ------------------------------------------------------------------ sky
	private sky(v: Viewport, s: SceneInput) {
		const { ctx, pal } = this;
		// No air on the Moon: the sky is black. A barely visible vignette gives depth only.
		ctx.fillStyle = rgba(pal.bg, 1);
		ctx.fillRect(0, 0, v.W, v.H);
		const g = ctx.createRadialGradient(v.cx, v.H * 0.15, 0, v.cx, v.H * 0.15, Math.max(v.W, v.H) * 0.9);
		g.addColorStop(0, 'rgba(14,20,34,0.55)');
		g.addColorStop(1, 'rgba(0,0,0,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, v.W, v.H);
		// glare from the Sun (inside the eye / camera, not the sky) when it is up
		if (s.sun && s.sun.frac > 0) {
			for (const x of this.copies(v, s.sun.az, 600)) {
				const y = this.y(v, s.sun.el);
				const r = Math.max(v.W, v.H) * 0.55;
				const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
				gg.addColorStop(0, rgba(pal.sun, 0.1 * s.sun.frac * s.bodiesAlpha));
				gg.addColorStop(1, rgba(pal.sun, 0));
				ctx.fillStyle = gg;
				ctx.fillRect(0, 0, v.W, v.H);
			}
		}
	}

	private starField(v: Viewport, s: SceneInput) {
		const { ctx } = this;
		const st = this.stars;
		const span = v.W / v.ppd;
		// keep roughly the same number of stars on screen at any zoom
		const target = clamp((v.W * v.H) / 2600, 160, 700);
		const share = clamp(target / (N_STARS * Math.min(1, span / 360)), 0, 1);
		const glare = s.sun ? 1 - 0.55 * s.sun.frac : 1;
		const bottom = Math.max(v.safe.top + 40, v.H * 0.9);
		const a = s.starsAlpha * glare;
		if (a <= 0.01) return;
		const copiesNeeded = span > 300;
		const BUCKET_ALPHA = [0.28, 0.45, 0.7, 0.95];
		for (let b = 0; b < 4; b++) {
			ctx.globalAlpha = a * BUCKET_ALPHA[b];
			ctx.fillStyle = b === 3 ? '#fff6e8' : b === 2 ? '#e8f0ff' : '#cdd6e6';
			for (let i = 0; i < N_STARS; i++) {
				if (st.bucket[i] !== b || st.rank[i] > share) continue;
				const y = st.fy[i] * bottom;
				const sz = st.size[i];
				const d = wrapDelta(st.az[i] + s.starRot - v.camAz);
				const x = v.cx + d * v.ppd;
				if (x > -4 && x < v.W + 4) ctx.fillRect(x, y, sz, sz);
				if (copiesNeeded) {
					const x2 = x + (d < 0 ? 360 : -360) * v.ppd;
					if (x2 > -4 && x2 < v.W + 4) ctx.fillRect(x2, y, sz, sz);
				}
			}
		}
		ctx.globalAlpha = 1;
	}

	// ------------------------------------------------------------------ Sun & Earth (behind terrain)
	private sunBehind(v: Viewport, sun: SunState, alpha: number) {
		const { ctx, pal } = this;
		const y = this.y(v, sun.el);
		const rx = Math.max(0.7, sun.rDeg * v.ppd);
		const ry = Math.max(0.7, sun.rDeg * v.ppdV);
		for (const x of this.copies(v, sun.az, 300)) {
			ctx.globalCompositeOperation = 'lighter';
			if (sun.frac > 0) {
				const f = sun.frac;
				const gR = 26 + 120 * f + ry * 1.2;
				const g = ctx.createRadialGradient(x, y, 0, x, y, gR);
				g.addColorStop(0, rgba(pal.sunSoft, 0.85 * alpha));
				g.addColorStop(0.12, rgba(pal.sun, 0.45 * alpha * (0.4 + 0.6 * f)));
				g.addColorStop(0.45, rgba(pal.sun, 0.1 * alpha * f));
				g.addColorStop(1, rgba(pal.sun, 0));
				ctx.fillStyle = g;
				ctx.fillRect(x - gR, y - gR, gR * 2, gR * 2);
				// thin horizontal streak: reads as "very bright, very low"
				ctx.save();
				ctx.translate(x, y);
				ctx.scale(7, 0.22);
				const sr = gR * 0.7;
				const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, sr);
				g2.addColorStop(0, rgba(pal.sunSoft, 0.3 * alpha * f));
				g2.addColorStop(1, rgba(pal.sun, 0));
				ctx.fillStyle = g2;
				ctx.fillRect(-sr, -sr, sr * 2, sr * 2);
				ctx.restore();
			}
			ctx.globalCompositeOperation = 'source-over';
			// the disk itself at its true angular size (x vertical scale)
			const gd = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
			gd.addColorStop(0, `rgba(255,255,250,${alpha})`);
			gd.addColorStop(0.7, rgba(pal.sunSoft, alpha));
			gd.addColorStop(1, rgba(pal.sun, alpha));
			ctx.fillStyle = gd;
			ctx.beginPath();
			ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	/** Earth: shown round (not to scale) with its phase; the lit side faces the Sun. */
	earthRadiusPx(v: Viewport, e: EarthState) {
		return clamp(e.rDeg * v.ppd, 11, 36);
	}

	private earthDisk(v: Viewport, e: EarthState, sun: SunState | null, alpha: number) {
		const { ctx, pal } = this;
		const y = this.y(v, e.el);
		const r = this.earthRadiusPx(v, e);
		const ang = sun ? Math.atan2(-(sun.el - e.el), wrapDelta(sun.az - e.az)) : 0;
		const f = clamp(e.phase, 0, 1);
		for (const x of this.copies(v, e.az, 80)) {
			ctx.save();
			ctx.globalAlpha = alpha;
			// halo
			ctx.globalCompositeOperation = 'lighter';
			const hg = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2.6);
			hg.addColorStop(0, rgba(pal.earth, 0.18 * (0.3 + 0.7 * f)));
			hg.addColorStop(1, rgba(pal.earth, 0));
			ctx.fillStyle = hg;
			ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
			ctx.globalCompositeOperation = 'source-over';
			ctx.translate(x, y);
			ctx.rotate(ang);
			// night side (faint, lit by the Moon itself)
			ctx.fillStyle = 'rgb(16,28,44)';
			ctx.beginPath();
			ctx.arc(0, 0, r, 0, Math.PI * 2);
			ctx.fill();
			// lit side
			if (f > 0.005) {
				const k = 1 - 2 * f;
				ctx.beginPath();
				ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
				ctx.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, k > 0 ? -Math.PI / 2 : (3 * Math.PI) / 2, k > 0);
				ctx.closePath();
				const lg = ctx.createRadialGradient(r * 0.35, -r * 0.25, r * 0.1, 0, 0, r * 1.05);
				lg.addColorStop(0, '#f2fbff');
				lg.addColorStop(0.35, rgba(pal.earthSoft, 1));
				lg.addColorStop(1, rgba(mix(pal.earth, [20, 70, 140], 0.45), 1));
				ctx.fillStyle = lg;
				ctx.fill();
			}
			// rim
			ctx.strokeStyle = rgba(pal.earthSoft, 0.35);
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(0, 0, r, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
		}
	}

	// ------------------------------------------------------------------ terrain
	/** Returns the skyline y range (for axes). */
	private terrain(v: Viewport, s: SceneInput): [number, number] {
		const { ctx, pal } = this;
		const prof = s.profA;
		const n = prof.length;
		if (this.sm1.length !== n) {
			this.sm1 = new Float32Array(n);
			this.sm2 = new Float32Array(n);
		}
		smoothCircular(prof, this.sm1, Math.round(n / 120)); // ±3°
		smoothCircular(prof, this.sm2, Math.round(n / 36)); // ±10°
		const [k0, k1] = this.binRange(v, n);
		const m = k1 - k0 + 1;
		this.ensure(m);
		const step = 360 / n;
		const Yb = v.H + 8;
		const lift = s.rise.map((r) => (1 - r) * (v.H * 0.55)) as [number, number, number];
		let yMin = Infinity, yMax = -Infinity;
		for (let i = 0; i < m; i++) {
			const k = k0 + i;
			const idx = ((k % n) + n) % n;
			this.xs[i] = v.cx + ((k + 0.5) * step - v.camAz) * v.ppd;
			const ya = this.y(v, prof[idx]);
			if (ya < yMin) yMin = ya;
			if (ya > yMax) yMax = ya;
			let yb = Math.max(this.y(v, this.sm1[idx]), ya + 2);
			yb = yb + (Yb - yb) * 0.34;
			let yc = Math.max(this.y(v, this.sm2[idx]), yb + 2);
			yc = yc + (Yb - yc) * 0.6;
			this.y0[i] = ya + lift[0];
			this.y1[i] = yb + lift[1];
			this.y2[i] = yc + lift[2];
		}
		const x0 = this.xs[0], x1 = this.xs[m - 1];
		const path = (ys: Float32Array) => {
			const p = new Path2D();
			p.moveTo(x0, Yb + 40);
			for (let i = 0; i < m; i++) p.lineTo(this.xs[i], ys[i]);
			p.lineTo(x1, Yb + 40);
			p.closePath();
			return p;
		};
		const line = (ys: Float32Array) => {
			const p = new Path2D();
			p.moveTo(x0, ys[0]);
			for (let i = 1; i < m; i++) p.lineTo(this.xs[i], ys[i]);
			return p;
		};

		// Light: terrain faces turned to the Sun look bright when you look away from it,
		// and you see their shadowed sides when you look towards it (backlit).
		const sun = s.sun;
		const sunUp = sun ? clamp((sun.el + 1.5) / 2, 0, 1) : 0;
		const lit = (az: number) => {
			if (!sun) return 0;
			const c = Math.cos(((az - sun.az) * Math.PI) / 180);
			return sunUp * Math.pow(Math.max(0, -c), 1.2);
		};
		const back = (az: number) => {
			if (!sun) return 0;
			const c = Math.cos(((az - sun.az) * Math.PI) / 180);
			return sunUp * Math.pow(Math.max(0, c), 8);
		};
		const dark: RGB = [17, 19, 25];
		const regolith: RGB = [128, 124, 116];
		const warm = mix(regolith, pal.sun, 0.18);

		const p0 = path(this.y0);
		ctx.fillStyle = this.azGradient(v, (az) => rgba(mix(dark, warm, 0.08 + 0.62 * lit(az)), 1));
		ctx.fill(p0);
		const p1 = path(this.y1);
		ctx.fillStyle = this.azGradient(v, (az) => rgba(mix([11, 12, 17], regolith, 0.05 + 0.4 * lit(az)), 1));
		ctx.fill(p1);
		const p2 = path(this.y2);
		ctx.fillStyle = this.azGradient(v, (az) => rgba(mix([7, 8, 12], regolith, 0.03 + 0.22 * lit(az)), 1));
		ctx.fill(p2);

		// depth: darken towards the viewer, add regolith grain
		ctx.save();
		ctx.clip(p0);
		const vg = ctx.createLinearGradient(0, Math.min(yMin, v.H - 1), 0, v.H);
		vg.addColorStop(0, 'rgba(255,255,255,0.05)');
		vg.addColorStop(0.08, 'rgba(0,0,0,0)');
		vg.addColorStop(1, 'rgba(2,3,6,0.55)');
		ctx.fillStyle = vg;
		ctx.fillRect(0, 0, v.W, v.H);
		if (this.grain) {
			ctx.globalAlpha = 0.07;
			ctx.fillStyle = this.grain;
			ctx.fillRect(0, 0, v.W, v.H);
			ctx.globalAlpha = 1;
		}
		ctx.restore();

		// rim light on the crests (warm where the Sun grazes them)
		ctx.lineJoin = 'round';
		ctx.lineWidth = 2.4;
		ctx.strokeStyle = this.azGradient(v, (az) => rgba(pal.sun, 0.55 * back(az)));
		ctx.stroke(line(this.y0));
		ctx.lineWidth = 1.1;
		ctx.strokeStyle = this.azGradient(v, (az) =>
			rgba(mix([190, 196, 210], pal.sunSoft, back(az)), 0.28 + 0.6 * Math.max(back(az), lit(az) * 0.5))
		);
		ctx.stroke(line(this.y0));
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(255,255,255,0.05)';
		ctx.stroke(line(this.y1));
		ctx.stroke(line(this.y2));
		return [yMin, yMax];
	}

	private zeroLine(v: Viewport, s: SceneInput) {
		const { ctx, pal } = this;
		const y = this.y(v, 0);
		if (y < v.safe.top || y > v.H) return;
		ctx.save();
		ctx.setLineDash([2, 6]);
		ctx.strokeStyle = rgba(pal.text2, 0.22 * s.rise[0]);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, Math.round(y) + 0.5);
		ctx.lineTo(v.W, Math.round(y) + 0.5);
		ctx.stroke();
		ctx.restore();
	}

	private marginBand(v: Viewport, s: SceneInput) {
		const { ctx, pal } = this;
		if (s.marginDeg <= 0) return;
		const prof = s.profA;
		const n = prof.length;
		const [k0, k1] = this.binRange(v, n);
		const m = k1 - k0 + 1;
		const step = 360 / n;
		const band = new Path2D();
		const top = new Path2D();
		const lift = (1 - s.rise[0]) * v.H * 0.55;
		for (let i = 0; i < m; i++) {
			const k = k0 + i;
			const idx = ((k % n) + n) % n;
			const x = v.cx + ((k + 0.5) * step - v.camAz) * v.ppd;
			const y = this.y(v, prof[idx] + s.marginDeg) + lift;
			if (i === 0) top.moveTo(x, y);
			else top.lineTo(x, y);
			if (i === 0) band.moveTo(x, y);
			else band.lineTo(x, y);
		}
		for (let i = m - 1; i >= 0; i--) {
			const k = k0 + i;
			const idx = ((k % n) + n) % n;
			const x = v.cx + ((k + 0.5) * step - v.camAz) * v.ppd;
			band.lineTo(x, this.y(v, prof[idx]) + lift);
		}
		band.closePath();
		ctx.fillStyle = rgba(pal.earth, 0.07 * s.rise[0]);
		ctx.fill(band);
		ctx.save();
		ctx.setLineDash([5, 5]);
		ctx.lineWidth = 1;
		ctx.strokeStyle = rgba(pal.earth, 0.5 * s.rise[0]);
		ctx.stroke(top);
		ctx.restore();
	}

	private outlineB(v: Viewport, prof: Float32Array, alpha: number) {
		const { ctx, pal } = this;
		const n = prof.length;
		const [k0, k1] = this.binRange(v, n);
		const step = 360 / n;
		const p = new Path2D();
		for (let k = k0; k <= k1; k++) {
			const idx = ((k % n) + n) % n;
			const x = v.cx + ((k + 0.5) * step - v.camAz) * v.ppd;
			const y = this.y(v, prof[idx]);
			if (k === k0) p.moveTo(x, y);
			else p.lineTo(x, y);
		}
		ctx.lineJoin = 'round';
		ctx.strokeStyle = rgba(pal.siteB, 0.16 * alpha);
		ctx.lineWidth = 6;
		ctx.stroke(p);
		ctx.strokeStyle = rgba(pal.siteB, 0.95 * alpha);
		ctx.lineWidth = 1.6;
		ctx.stroke(p);
	}

	// ------------------------------------------------------------------ paths
	private unwrap(az: Float32Array, n: number, stride: number): Float32Array {
		if (this.ud.length < n) this.ud = new Float32Array(Math.ceil(n * 1.25));
		const ud = this.ud;
		let prev = az[0];
		ud[0] = az[0];
		for (let i = stride; i < n; i += stride) {
			ud[i] = ud[i - stride] + wrapDelta(az[i] - prev);
			prev = az[i];
		}
		return ud;
	}

	private sunPath(v: Viewport, p: PathData, reveal: number, alpha: number) {
		const { ctx, pal } = this;
		if (p.n < 2 || reveal <= 0) return;
		const ud = this.unwrap(p.az, p.n, 1);
		const half = Math.max(p.now, p.n - 1 - p.now, 1);
		const base = wrapDelta(ud[0] - v.camAz) - (ud[0] - v.camAz);
		const COLORS: [RGB, number[]][] = [
			[pal.sun, []],
			[mix(pal.sun, pal.night, 0.45), [6, 3]],
			[pal.night, [2, 5]]
		];
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		for (let kk = -2; kk <= 2; kk++) {
			const off = base + kk * 360;
			const xA = v.cx + (ud[0] - v.camAz + off) * v.ppd;
			const xB = v.cx + (ud[p.n - 1] - v.camAz + off) * v.ppd;
			if (Math.max(xA, xB) < -40 || Math.min(xA, xB) > v.W + 40) continue;
			let curKey = -1;
			let started = false;
			const flush = () => {
				if (started) ctx.stroke();
				started = false;
			};
			for (let i = 1; i < p.n; i++) {
				const dist = Math.abs(i - p.now) / half;
				if (dist > reveal) {
					if (curKey !== -1) flush();
					curKey = -1;
					continue;
				}
				const fr = p.frac[i];
				const cls = fr >= 0.999 ? 0 : fr > 0.001 ? 1 : 2;
				const bucket = Math.min(5, Math.floor(Math.pow(1 - dist, 1.3) * 6));
				const key = cls * 10 + bucket;
				const xa = v.cx + (ud[i - 1] - v.camAz + off) * v.ppd;
				const xb = v.cx + (ud[i] - v.camAz + off) * v.ppd;
				if ((xa < -20 && xb < -20) || (xa > v.W + 20 && xb > v.W + 20)) {
					if (curKey !== -1) flush();
					curKey = -1;
					continue;
				}
				if (key !== curKey) {
					flush();
					curKey = key;
					const [c, dash] = COLORS[cls];
					ctx.strokeStyle = rgba(c, alpha * (0.12 + 0.88 * (bucket / 5)));
					ctx.lineWidth = cls === 0 ? 2.2 : 1.6;
					ctx.setLineDash(dash);
					ctx.beginPath();
					ctx.moveTo(xa, this.y(v, p.el[i - 1]));
					started = true;
				}
				ctx.lineTo(xb, this.y(v, p.el[i]));
			}
			flush();
			ctx.setLineDash([]);
			// one dot per Earth day along the path
			const now = Math.round(p.now);
			for (let i = now % 24; i < p.n; i += 24) {
				const dist = Math.abs(i - p.now) / half;
				if (dist > reveal || Math.abs(i - p.now) < 6) continue;
				const x = v.cx + (ud[i] - v.camAz + off) * v.ppd;
				if (x < -5 || x > v.W + 5) continue;
				const fr = p.frac[i];
				const c = fr >= 0.999 ? pal.sunSoft : fr > 0.001 ? mix(pal.sun, pal.night, 0.45) : pal.night;
				ctx.fillStyle = rgba(c, alpha * (0.25 + 0.75 * (1 - dist)));
				ctx.beginPath();
				ctx.arc(x, this.y(v, p.el[i]), 1.7, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}

	private earthLoop(v: Viewport, l: LoopData, alpha: number) {
		const { ctx, pal } = this;
		if (l.n < 2) return;
		const stride = Math.max(1, Math.floor(l.n / 1600));
		const ud = this.unwrap(l.az, l.n, stride);
		const base = wrapDelta(ud[0] - v.camAz) - (ud[0] - v.camAz);
		ctx.lineJoin = 'round';
		ctx.lineWidth = 1;
		for (let kk = -2; kk <= 2; kk++) {
			const off = base + kk * 360;
			const xA = v.cx + (ud[0] - v.camAz + off) * v.ppd;
			if (xA < -v.W || xA > 2 * v.W) continue;
			for (const visPass of [1, 0]) {
				ctx.strokeStyle = visPass ? rgba(pal.earth, 0.2 * alpha) : rgba(pal.night, 0.34 * alpha);
				ctx.setLineDash(visPass ? [] : [2, 4]);
				ctx.beginPath();
				let pen = false;
				for (let i = stride; i < l.n; i += stride) {
					if (l.vis[i] !== visPass) {
						pen = false;
						continue;
					}
					const x = v.cx + (ud[i] - v.camAz + off) * v.ppd;
					const y = this.y(v, l.el[i]);
					if (!pen) {
						const xp = v.cx + (ud[i - stride] - v.camAz + off) * v.ppd;
						ctx.moveTo(xp, this.y(v, l.el[i - stride]));
						pen = true;
					}
					ctx.lineTo(x, y);
				}
				ctx.stroke();
			}
		}
		ctx.setLineDash([]);
	}

	// ------------------------------------------------------------------ markers & labels
	private markers(v: Viewport, s: SceneInput) {
		const { ctx, pal } = this;
		const L = s.labels;
		const a = s.bodiesAlpha;
		if (a < 0.02) return;
		if (s.sun) {
			const sun = s.sun;
			const y = this.y(v, sun.el);
			const rx = Math.max(0.7, sun.rDeg * v.ppd);
			const ry = Math.max(0.7, sun.rDeg * v.ppdV);
			for (const x of this.copies(v, sun.az)) {
				if (sun.frac < 0.999) {
					ctx.save();
					ctx.setLineDash([3, 3]);
					ctx.strokeStyle = rgba(sun.frac > 0 ? pal.sun : pal.night, 0.9 * a);
					ctx.lineWidth = 1.2;
					ctx.beginPath();
					ctx.ellipse(x, y, Math.max(7, rx + 5), Math.max(7, ry + 5), 0, 0, Math.PI * 2);
					ctx.stroke();
					ctx.restore();
				}
				const pct = L.fmt(sun.frac * 100, 0);
				const text =
					sun.frac >= 0.999 ? `${L.sun} ${signed(L, sun.el)}` : sun.frac > 0 ? L.sunPartial(pct) : L.sunHidden;
				const color = sun.frac > 0 ? pal.sunSoft : pal.night;
				const ly = clamp(y - Math.max(ry, 7) - 22, v.safe.top + 14, v.rulerY - 48);
				ctx.strokeStyle = rgba(color, 0.35 * a);
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(x, y - Math.max(ry, 7) - 4);
				ctx.lineTo(x, ly + 11);
				ctx.stroke();
				this.pill(x, ly, text, color, a, 'center');
			}
		}
		if (s.earth) {
			const e = s.earth;
			const y = this.y(v, e.el);
			const r = this.earthRadiusPx(v, e);
			for (const x of this.copies(v, e.az)) {
				if (!e.visible) {
					ctx.save();
					ctx.setLineDash([3, 3]);
					ctx.strokeStyle = rgba(pal.night, 0.95 * a);
					ctx.lineWidth = 1.2;
					ctx.beginPath();
					ctx.arc(x, y, r + 4, 0, Math.PI * 2);
					ctx.stroke();
					ctx.restore();
				}
				const text = e.visible ? `${L.earth} ${signed(L, e.el)}` : L.earthHidden;
				const ly = clamp(y - r - 24, v.safe.top + 14, v.rulerY - 48);
				this.pill(x, ly, text, e.visible ? pal.earthSoft : pal.night, a, 'center');
			}
		}
	}

	private axes(v: Viewport, s: SceneInput, _sky: [number, number]) {
		const { ctx, pal } = this;
		const L = s.labels;
		const a = s.rise[0];
		// --- elevation axis (right edge of the free area)
		const ax = v.safe.right - 8;
		const top = v.safe.top + 8;
		const bottom = v.rulerY - 26;
		const stepEl = pickStep([0.1, 0.25, 0.5, 1, 2, 5, 10, 20], v.ppdV, 30);
		const elTop = v.elRef + (v.yRef - top) / v.ppdV;
		const elBot = v.elRef + (v.yRef - bottom) / v.ppdV;
		ctx.font = `500 10.5px ${FONT_MONO}`;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		ctx.lineWidth = 1;
		ctx.strokeStyle = rgba(pal.text2, 0.35 * a);
		ctx.beginPath();
		ctx.moveTo(ax + 0.5, top);
		ctx.lineTo(ax + 0.5, bottom);
		ctx.stroke();
		const digits = stepEl < 0.25 ? 1 : stepEl < 1 ? 2 : 0;
		for (let el = Math.ceil(elBot / stepEl) * stepEl; el <= elTop + 1e-9; el += stepEl) {
			const y = Math.round(this.y(v, el)) + 0.5;
			const zero = Math.abs(el) < 1e-6;
			ctx.strokeStyle = rgba(pal.text2, (zero ? 0.7 : 0.4) * a);
			ctx.beginPath();
			ctx.moveTo(ax - (zero ? 8 : 5), y);
			ctx.lineTo(ax, y);
			ctx.stroke();
			ctx.fillStyle = rgba(zero ? pal.text : pal.text2, 0.85 * a);
			const label = zero ? `0°` : `${el > 0 ? '+' : '−'}${L.fmt(Math.abs(el), digits)}°`;
			ctx.fillText(label, ax - 11, y);
		}
		if (s.teacher) {
			const y0 = this.y(v, 0);
			if (y0 > top && y0 < bottom) {
				ctx.font = `500 10.5px ${FONT_UI}`;
				ctx.fillStyle = rgba(pal.text3, 0.95 * a);
				ctx.fillText(L.flat, ax - 46, y0 - 9);
			}
		}

		// --- azimuth ruler
		const ry = v.rulerY;
		const fade = ctx.createLinearGradient(0, ry - 46, 0, ry + 14);
		fade.addColorStop(0, 'rgba(3,4,8,0)');
		fade.addColorStop(1, 'rgba(3,4,8,0.72)');
		ctx.fillStyle = fade;
		ctx.fillRect(0, ry - 46, v.W, 60);
		const major = pickStep([1, 2, 5, 10, 15, 30, 45, 90], v.ppd, 70);
		const minor = major / (major * v.ppd >= 140 ? 5 : major === 45 || major === 15 ? 3 : 2);
		const azL = v.camAz - v.cx / v.ppd;
		const azR = v.camAz + (v.W - v.cx) / v.ppd;
		ctx.strokeStyle = rgba(pal.text2, 0.3 * a);
		ctx.beginPath();
		for (let az = Math.ceil(azL / minor) * minor; az <= azR; az += minor) {
			const x = Math.round(v.cx + (az - v.camAz) * v.ppd) + 0.5;
			ctx.moveTo(x, ry);
			ctx.lineTo(x, ry + 4);
		}
		ctx.stroke();
		for (let az = Math.ceil(azL / major) * major; az <= azR; az += major) {
			const x = Math.round(v.cx + (az - v.camAz) * v.ppd) + 0.5;
			const a360 = ((Math.round(az) % 360) + 360) % 360;
			const card = a360 % 90 === 0 ? L.cardinals[a360 / 90] : null;
			ctx.strokeStyle = rgba(pal.text2, (card ? 0.85 : 0.55) * a);
			ctx.beginPath();
			ctx.moveTo(x, ry - (card ? 6 : 3));
			ctx.lineTo(x, ry + 6);
			ctx.stroke();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'alphabetic';
			if (card) {
				ctx.font = `600 15px ${FONT_DISPLAY}`;
				ctx.fillStyle = rgba(pal.text, 0.95 * a);
				ctx.fillText(card, x, ry - 11);
			} else {
				ctx.font = `500 10.5px ${FONT_MONO}`;
				ctx.fillStyle = rgba(pal.text2, 0.85 * a);
				const dg = major < 1 ? 1 : 0;
				ctx.fillText(`${L.fmt(norm(az), dg)}°`, x, ry - 9);
			}
		}
	}

	private crosshair(v: Viewport, s: SceneInput, h: { x: number; y: number }) {
		const { ctx, pal } = this;
		const L = s.labels;
		const az = norm(v.camAz + (h.x - v.cx) / v.ppd);
		const hA = horizonAt(s.profA, az);
		const yA = this.y(v, hA);
		const x = Math.round(h.x) + 0.5;
		ctx.save();
		ctx.strokeStyle = 'rgba(255,255,255,0.28)';
		ctx.lineWidth = 1;
		ctx.setLineDash([1, 3]);
		ctx.beginPath();
		ctx.moveTo(x, v.safe.top);
		ctx.lineTo(x, v.rulerY);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.fillStyle = rgba(pal.siteA, 1);
		ctx.strokeStyle = 'rgba(0,0,0,0.6)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(x, yA, 3.5, 0, Math.PI * 2);
		ctx.stroke();
		ctx.fill();
		let hB: number | null = null;
		if (s.profB && s.alphaB > 0.5) {
			hB = horizonAt(s.profB, az);
			ctx.fillStyle = rgba(pal.siteB, 1);
			ctx.beginPath();
			ctx.arc(x, this.y(v, hB), 3.5, 0, Math.PI * 2);
			ctx.stroke();
			ctx.fill();
		}
		const rows: [string, string, RGB][] = [
			[L.azimuth, `${L.fmt(az, 1)}°`, pal.text],
			[`${L.horizon} · ${L.siteA}`, `${signed(L, hA, 2)}`, pal.siteA]
		];
		if (hB !== null) rows.push([`${L.horizon} · ${L.siteB}`, `${signed(L, hB, 2)}`, pal.siteB]);
		ctx.font = `500 11px ${FONT_UI}`;
		const wL = Math.max(...rows.map((r) => ctx.measureText(r[0]).width));
		ctx.font = `600 11.5px ${FONT_MONO}`;
		const wR = Math.max(...rows.map((r) => ctx.measureText(r[1]).width));
		const w = wL + wR + 30;
		const hh = rows.length * 18 + 12;
		let bx = h.x + 14;
		if (bx + w > v.safe.right - 50) bx = h.x - 14 - w;
		// keep clear of the HTML labels that sit along the top edge of the free area
		let by = clamp(h.y - hh - 12, v.safe.top + 30, v.rulerY - hh - 30);
		ctx.fillStyle = 'rgba(8,11,18,0.86)';
		ctx.strokeStyle = 'rgba(255,255,255,0.12)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(bx, by, w, hh, 10);
		ctx.fill();
		ctx.stroke();
		rows.forEach(([k, val, c], i) => {
			const ty = by + 15 + i * 18;
			ctx.textBaseline = 'middle';
			ctx.textAlign = 'left';
			ctx.font = `500 11px ${FONT_UI}`;
			ctx.fillStyle = rgba(pal.text2, 1);
			ctx.fillText(k, bx + 10, ty);
			ctx.textAlign = 'right';
			ctx.font = `600 11.5px ${FONT_MONO}`;
			ctx.fillStyle = rgba(c, 1);
			ctx.fillText(val, bx + w - 10, ty);
		});
		ctx.restore();
	}
}

const norm = (a: number) => ((a % 360) + 360) % 360;

function signed(L: Labels, v: number, digits = 1) {
	const s = L.fmt(Math.abs(v), digits);
	return `${v >= 0 ? '+' : '−'}${s}°`;
}

function makeStars() {
	const r = prng(20261115);
	const az = new Float32Array(N_STARS);
	const fy = new Float32Array(N_STARS);
	const size = new Float32Array(N_STARS);
	const bucket = new Uint8Array(N_STARS);
	const rank = new Float32Array(N_STARS);
	for (let i = 0; i < N_STARS; i++) {
		az[i] = r() * 360;
		// denser towards a faint band, sparser near the horizon glare
		fy[i] = Math.pow(r(), 1.15);
		const m = Math.pow(r(), 3.2); // few bright, many faint
		size[i] = m > 0.6 ? 2 : m > 0.25 ? 1.5 : 1;
		bucket[i] = m > 0.6 ? 3 : m > 0.25 ? 2 : m > 0.08 ? 1 : 0;
		// bright stars stay visible at every zoom
		rank[i] = m > 0.6 ? 0 : r();
	}
	return { az, fy, size, bucket, rank };
}

function makeGrain(ctx: CanvasRenderingContext2D): CanvasPattern | null {
	if (typeof document === 'undefined') return null;
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d');
	if (!g) return null;
	const img = g.createImageData(128, 128);
	const r = prng(7);
	for (let i = 0; i < img.data.length; i += 4) {
		const v = (r() * 255) | 0;
		img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
		img.data[i + 3] = 255;
	}
	g.putImageData(img, 0, 0);
	return ctx.createPattern(c, 'repeat');
}

export { minMax };
