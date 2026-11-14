// AI-assisted: written with Claude, reviewed by the team.
// uPlot helpers for the planner charts: data packing from engine series, dark theme
// from the CSS tokens, "visible gap" fills between two curves, and a UTC time axis.

import uPlot from 'uplot';
import type { Ephem } from '#lib/engine/data.ts';
import { horizonAt } from '#lib/engine/visibility.ts';
import type { SiteView } from '#lib/state.svelte.ts';

export type Metric = 'sun' | 'disk' | 'earth';

export interface Theme {
	sun: string;
	earth: string;
	siteA: string;
	siteB: string;
	text2: string;
	text3: string;
	hairline: string;
	mono: string;
}

export function readTheme(el: Element): Theme {
	const cs = getComputedStyle(el);
	const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
	return {
		sun: v('--sun', '#ffb547'),
		earth: v('--earth', '#5cc8ff'),
		siteA: v('--site-a', '#ffffff'),
		siteB: v('--site-b', '#c49bff'),
		text2: v('--text-2', '#a7afbd'),
		text3: v('--text-3', '#6b7383'),
		hairline: 'rgba(255,255,255,0.055)',
		mono: v('--font-mono', 'monospace')
	};
}

/** "#rrggbb" + alpha -> rgba(); passes through anything that is not a 6-digit hex. */
export function alpha(color: string, a: number): string {
	const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
	if (!m) return color;
	const n = parseInt(m[1], 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** One packed chart: x in unix seconds, then y columns in the order of `series`. */
export interface Pack {
	metric: Metric;
	xs: Float64Array;
	cols: Float32Array[];
	/** pairs of column indices (1-based like uPlot) to fill where upper > lower */
	fills: { upper: number; lower: number; slot: 'A' | 'B' }[];
	compare: boolean;
	/** Earth only: horizon under the Earth + antenna margin, per site */
	i0: number;
}

function earthLimit(v: SiteView, heightIndex: number, margin: number): Float32Array {
	const prof = v.site.horizons?.[heightIndex];
	const out = new Float32Array(v.series.n);
	if (!prof) return out;
	for (let k = 0; k < v.series.n; k++) out[k] = horizonAt(prof, v.series.earthAz[k]) + margin;
	return out;
}

export function buildPack(
	metric: Metric,
	eph: Ephem,
	a: SiteView,
	b: SiteView | null,
	heightIndex: number,
	margin: number
): Pack {
	const s = a.series;
	const xs = new Float64Array(s.n);
	for (let k = 0; k < s.n; k++) xs[k] = eph.start_unix + (s.i0 + k) * eph.step_s;
	const views = b && b.series.n === s.n ? [a, b] : [a];
	const cols: Float32Array[] = [];
	const fills: Pack['fills'] = [];
	views.forEach((v, j) => {
		const slot = j === 0 ? 'A' : 'B';
		if (metric === 'sun') {
			cols.push(v.series.sunEl, v.series.sunHorizon);
			fills.push({ upper: cols.length - 1, lower: cols.length, slot });
		} else if (metric === 'disk') {
			const pct = new Float32Array(v.series.n);
			for (let k = 0; k < v.series.n; k++) pct[k] = v.series.sunFrac[k] * 100;
			cols.push(pct);
		} else {
			cols.push(v.series.earthEl, earthLimit(v, heightIndex, margin));
			fills.push({ upper: cols.length - 1, lower: cols.length, slot });
		}
	});
	return { metric, xs, cols, fills, compare: views.length === 2, i0: s.i0 };
}

/**
 * Fill the area between two curves only where `up` is above `lo`, interpolating the
 * crossings so the edge of the fill meets the lines exactly.
 */
export function fillBetween(u: uPlot, up: ArrayLike<number>, lo: ArrayLike<number>, fill: string | CanvasGradient) {
	const xs = u.data[0] as ArrayLike<number>;
	const n = xs.length;
	if (n < 2) return;
	const ctx = u.ctx;
	const { left, top, width, height } = u.bbox;
	const X = (v: number) => u.valToPos(v, 'x', true);
	const Y = (v: number) => u.valToPos(v, 'y', true);
	ctx.save();
	ctx.beginPath();
	ctx.rect(left, top, width, height);
	ctx.clip();
	ctx.fillStyle = fill;
	ctx.beginPath();
	const topPts: number[] = [];
	const botPts: number[] = [];
	const flush = () => {
		if (topPts.length >= 4) {
			ctx.moveTo(topPts[0], topPts[1]);
			for (let i = 2; i < topPts.length; i += 2) ctx.lineTo(topPts[i], topPts[i + 1]);
			for (let i = botPts.length - 2; i >= 0; i -= 2) ctx.lineTo(botPts[i], botPts[i + 1]);
			ctx.closePath();
		}
		topPts.length = 0;
		botPts.length = 0;
	};
	let prevD = up[0] - lo[0];
	if (prevD > 0) {
		topPts.push(X(xs[0]), Y(up[0]));
		botPts.push(X(xs[0]), Y(lo[0]));
	}
	for (let k = 1; k < n; k++) {
		const d = up[k] - lo[k];
		if (prevD > 0 !== d > 0) {
			// crossing between k-1 and k
			const t = prevD / (prevD - d);
			const cx = xs[k - 1] + (xs[k] - xs[k - 1]) * t;
			const cy = lo[k - 1] + (lo[k] - lo[k - 1]) * t;
			const px = X(cx), py = Y(cy);
			topPts.push(px, py);
			botPts.push(px, py);
			if (!(d > 0)) flush();
		}
		if (d > 0) {
			topPts.push(X(xs[k]), Y(up[k]));
			botPts.push(X(xs[k]), Y(lo[k]));
		}
		prevD = d;
	}
	flush();
	ctx.fill();
	ctx.restore();
}

export function vGradient(u: uPlot, color: string, a0: number, a1: number): CanvasGradient {
	const g = u.ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height);
	g.addColorStop(0, alpha(color, a0));
	g.addColorStop(1, alpha(color, a1));
	return g;
}

const DAY = 86400;

/** Locale-aware UTC tick labels (uPlot's built-in names are English only). */
export function timeValues(locale: string) {
	const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...o });
	const month = f({ month: 'short' });
	const monthYear = f({ month: 'short', year: 'numeric' });
	const dayMonth = f({ day: 'numeric', month: 'short' });
	const hm = f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
	return (_u: uPlot, splits: number[], _ax: number, _space: number, incr: number) => {
		let prevKey = '';
		return splits.map((s, i) => {
			const d = new Date(s * 1000);
			if (incr >= 28 * DAY) {
				const show = i === 0 || d.getUTCMonth() === 0;
				return show ? monthYear.format(d) : month.format(d);
			}
			if (incr >= DAY) return dayMonth.format(d);
			const key = d.toISOString().slice(0, 10);
			const out = key !== prevKey ? `${hm.format(d)}\n${dayMonth.format(d)}` : hm.format(d);
			prevKey = key;
			return out;
		});
	};
}

export interface MakeOpts {
	pack: Pack;
	theme: Theme;
	width: number;
	height: number;
	locale: string;
	labels: { a: string; b: string; line: string; limit: string };
	onCursor: (idx: number | null) => void;
	onLayout: (u: uPlot) => void;
}

export function makeOptions(o: MakeOpts): uPlot.Options {
	const { pack, theme } = o;
	const isDisk = pack.metric === 'disk';
	const main = pack.metric === 'earth' ? theme.earth : theme.sun;
	const series: uPlot.Series[] = [{}];
	const perSite = isDisk ? 1 : 2;
	const nSites = pack.compare ? 2 : 1;
	for (let j = 0; j < nSites; j++) {
		const color = j === 0 ? main : theme.siteB;
		series.push({
			label: `${j === 0 ? o.labels.a : o.labels.b} · ${o.labels.line}`,
			stroke: color,
			width: j === 0 ? 1.75 : 1.5,
			points: { show: false },
			fill: isDisk
				? (u: uPlot) => vGradient(u, color, j === 0 ? 0.42 : 0.2, j === 0 ? 0.02 : 0)
				: undefined
		});
		if (perSite === 2)
			series.push({
				label: `${j === 0 ? o.labels.a : o.labels.b} · ${o.labels.limit}`,
				stroke: j === 0 ? alpha(theme.siteA, 0.55) : alpha(theme.siteB, 0.5),
				width: 1,
				dash: [3, 4],
				points: { show: false }
			});
	}
	const axisCommon: Partial<uPlot.Axis> = {
		stroke: theme.text3,
		font: `10.5px ${theme.mono}`,
		grid: { stroke: theme.hairline, width: 1 },
		ticks: { stroke: theme.hairline, width: 1, size: 4 }
	};
	return {
		width: o.width,
		height: o.height,
		pxAlign: false,
		legend: { show: false },
		padding: [10, 6, 0, 0],
		tzDate: (ts) => uPlot.tzDate(new Date(ts * 1e3), 'Etc/UTC'),
		cursor: {
			y: false,
			drag: { x: false, y: false, setScale: false },
			points: {
				size: 7,
				width: 2,
				stroke: (u, si) => (u.series[si].stroke as () => string)?.() ?? theme.siteA,
				fill: '#05070b'
			}
		},
		scales: {
			x: { time: true },
			y: isDisk
				? { range: [0, 100] }
				: {
						range: (_u, min, max) => {
							const pad = Math.max(0.4, (max - min) * 0.12);
							return [Math.floor((min - pad) * 2) / 2, Math.ceil((max + pad) * 2) / 2];
						}
					}
		},
		axes: [
			{ ...axisCommon, values: timeValues(o.locale), space: 64, size: 34 },
			{
				...axisCommon,
				size: 44,
				space: 26,
				values: (_u, splits) => splits.map((v) => (isDisk ? `${v} %` : `${+v.toFixed(1)}°`))
			}
		],
		series,
		hooks: {
			drawAxes: [
				(u) => {
					for (const f of pack.fills) {
						const color = f.slot === 'A' ? main : theme.siteB;
						const g = vGradient(u, color, f.slot === 'A' ? 0.5 : 0.28, f.slot === 'A' ? 0.12 : 0.06);
						fillBetween(u, u.data[f.upper] as ArrayLike<number>, u.data[f.lower] as ArrayLike<number>, g);
					}
				}
			],
			setCursor: [(u) => o.onCursor(u.cursor.idx ?? null)],
			ready: [(u) => o.onLayout(u)],
			setSize: [(u) => o.onLayout(u)]
		}
	};
}
