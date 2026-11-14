// AI-assisted: written with Claude, reviewed by the team.
// Calendar ticks (UTC) for any visible span: years -> months -> weeks -> days,
// picked so labels never collide.

import type { Lang } from '#lib/engine/data.ts';

export interface Tick {
	/** ephemeris index (fractional) */
	i: number;
	label: string;
	strong: boolean;
}

export interface Ticks {
	major: Tick[];
	minor: number[];
}

type Unit = { kind: 'day' | 'month' | 'year'; n: number; approxH: number; minPx: number };

const UNITS: Unit[] = [
	{ kind: 'day', n: 1, approxH: 24, minPx: 50 },
	{ kind: 'day', n: 2, approxH: 48, minPx: 50 },
	{ kind: 'day', n: 7, approxH: 168, minPx: 50 },
	{ kind: 'day', n: 14, approxH: 336, minPx: 50 },
	{ kind: 'month', n: 1, approxH: 730, minPx: 34 },
	{ kind: 'month', n: 3, approxH: 2191, minPx: 34 },
	{ kind: 'month', n: 6, approxH: 4383, minPx: 34 },
	{ kind: 'year', n: 1, approxH: 8766, minPx: 36 }
];

const LOCALE: Record<Lang, string> = { en: 'en-GB', uk: 'uk-UA' };
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(lang: Lang, o: Intl.DateTimeFormatOptions) {
	const key = lang + JSON.stringify(o);
	let f = fmtCache.get(key);
	if (!f) fmtCache.set(key, (f = new Intl.DateTimeFormat(LOCALE[lang], { timeZone: 'UTC', ...o })));
	return f;
}

function* steps(u: Unit, t0: number, t1: number): Generator<Date> {
	const d = new Date(t0);
	if (u.kind === 'day') {
		// align to UTC midnight and, for multi-day steps, to a fixed day grid
		const day = 86400000;
		let t = Math.floor(t0 / day / u.n) * u.n * day;
		for (; t <= t1; t += u.n * day) yield new Date(t);
		return;
	}
	if (u.kind === 'month') {
		let y = d.getUTCFullYear(), m = Math.floor(d.getUTCMonth() / u.n) * u.n;
		for (;;) {
			const t = Date.UTC(y, m, 1);
			if (t > t1) return;
			yield new Date(t);
			m += u.n;
			if (m >= 12) {
				m -= 12;
				y++;
			}
		}
	}
	for (let y = d.getUTCFullYear(); Date.UTC(y, 0, 1) <= t1; y++) yield new Date(Date.UTC(y, 0, 1));
}

export function makeTicks(d0: number, d1: number, widthPx: number, startUnix: number, stepS: number, lang: Lang): Ticks {
	const span = Math.max(1, d1 - d0);
	const pxPerH = (widthPx / span) * (3600 / stepS);
	const found = UNITS.findIndex((u) => u.approxH * pxPerH >= u.minPx);
	const unit = UNITS[found === -1 ? UNITS.length - 1 : found];
	// minor ticks only where they nest inside the major unit
	const nested = UNITS.filter((u) =>
		unit.kind === 'year' ? u.kind === 'month' : unit.kind === 'month' ? u.kind === 'month' && u.n < unit.n : u.kind === 'day' && u.n < unit.n && unit.n % u.n === 0
	);
	const minorUnit = nested.reverse().find((u) => u.approxH * pxPerH >= 7);
	const toI = (t: number) => (t / 1000 - startUnix) / stepS;
	const t0 = (startUnix + d0 * stepS) * 1000;
	const t1 = (startUnix + d1 * stepS) * 1000;

	const major: Tick[] = [];
	for (const d of steps(unit, t0, t1)) {
		const i = toI(d.getTime());
		if (i < d0 - span * 0.02) continue;
		let label: string;
		let strong = false;
		if (unit.kind === 'year') {
			label = String(d.getUTCFullYear());
			strong = true;
		} else if (unit.kind === 'month') {
			if (d.getUTCMonth() === 0) {
				label = String(d.getUTCFullYear());
				strong = true;
			} else label = fmt(lang, { month: 'short' }).format(d).replace('.', '');
		} else {
			if (d.getUTCDate() === 1 || (unit.n > 1 && d.getUTCDate() <= unit.n)) {
				strong = d.getUTCDate() === 1;
			}
			label = fmt(lang, { day: 'numeric', month: 'short' }).format(d).replace('.', '');
			if (d.getUTCMonth() === 0 && d.getUTCDate() <= unit.n) {
				label = `${label} ${d.getUTCFullYear()}`;
				strong = true;
			}
		}
		major.push({ i, label, strong });
	}
	const minor: number[] = [];
	if (minorUnit) for (const d of steps(minorUnit, t0, t1)) minor.push(toI(d.getTime()));
	return { major, minor };
}
