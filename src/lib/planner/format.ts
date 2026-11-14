// AI-assisted: written with Claude, reviewed by the team.
// Small formatting helpers shared by the planner sections.

import type { Ephem } from '#lib/engine/data.ts';
import { timeOf } from '#lib/engine/visibility.ts';
import { fmtDate, fmtMonthYear } from '#lib/i18n.ts';
import type { Lang } from '#lib/engine/data.ts';

export const LOCALE: Record<Lang, string> = { en: 'en-GB', uk: 'uk-UA' };

/** "Nov 2026 – Nov 2027" for long windows, "3 Dec 2026 – 17 Dec 2026" for short ones. */
export function periodLabel(eph: Ephem, i0: number, i1: number): string {
	const a = timeOf(eph, i0);
	const b = timeOf(eph, i1);
	const long = (i1 - i0) * eph.step_s > 62 * 86400;
	return long ? `${fmtMonthYear(a)} – ${fmtMonthYear(b)}` : `${fmtDate(a)} – ${fmtDate(b)}`;
}

export const UNITS = {
	en: { m: 'm', W: 'W', kW: 'kW', kWh: 'kWh', h: 'h' },
	uk: { m: 'м', W: 'Вт', kW: 'кВт', kWh: 'кВт·год', h: 'год' }
} as const;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
