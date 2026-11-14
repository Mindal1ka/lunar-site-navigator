// AI-assisted: written with Claude, reviewed by the team.
// Formatting helpers for the site card (labels always carry units and periods).

import { app } from '#lib/state.svelte.ts';
import { fmtDate, fmtMonthYear, fmtNum } from '#lib/i18n.ts';
import { timeOf } from '#lib/engine/visibility.ts';
import type { Site } from '#lib/engine/data.ts';

/** "Nov 2026 – Nov 2027"; short windows get full dates. */
export function periodLabel(): string {
	const eph = app.eph;
	if (!eph) return '';
	const a = timeOf(eph, app.win.i0);
	const b = timeOf(eph, app.win.i1 - 1);
	const days = (app.win.i1 - app.win.i0) * (eph.step_s / 86400);
	return days < 75 ? `${fmtDate(a)} – ${fmtDate(b)}` : `${fmtMonthYear(a)} – ${fmtMonthYear(b)}`;
}

/** Longest night as value + unit; days with one decimal from 48 h, hours below. */
export function nightParts(hours: number, long = true): { value: string; unit: string } {
	const uk = app.lang === 'uk';
	if (hours >= 48) {
		return { value: fmtNum(hours / 24, 1), unit: long ? (uk ? 'днів' : 'days') : uk ? 'д' : 'd' };
	}
	return { value: fmtNum(hours, 0), unit: long ? (uk ? 'годин' : 'hours') : uk ? 'год' : 'h' };
}

export function nightText(hours: number): string {
	const p = nightParts(hours, false);
	return `${p.value} ${p.unit}`;
}

export function coordText(site: Site): string {
	const lat = Math.abs(site.lat).toFixed(3);
	const lon = (((site.lon % 360) + 360) % 360).toFixed(3);
	return app.lang === 'uk' ? `${lat}° пд. ш., ${lon}° сх. д.` : `${lat}° S, ${lon}° E`;
}

export function metres(v: number, digits = 0): string {
	return `${fmtNum(v, digits)} ${app.lang === 'uk' ? 'м' : 'm'}`;
}

export function deg(v: number, digits = 1): string {
	return `${fmtNum(v, digits)}°`;
}

/** Signed number with a real minus sign. */
export function signed(v: number, digits = 0): string {
	const s = fmtNum(Math.abs(v), digits);
	const zero = Number(Math.abs(v).toFixed(digits)) === 0;
	return zero ? s : `${v > 0 ? '+' : '−'}${s}`;
}

export const pctDigits = () => (app.mode === 'planner' ? 1 : 0);

export type MetricKey = 'sun' | 'earth' | 'night';

/** "1°" or "1.5°" */
export function marginText(v: number): string {
	return `${fmtNum(v, v % 1 === 0 ? 0 : 1)}°`;
}
