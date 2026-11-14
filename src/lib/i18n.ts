// AI-assisted: written with Claude, reviewed by the team.
// Tiny i18n: shared strings here; each component keeps its own strings in a local
// `const T = { en: {...}, uk: {...} }` and reads `T[app.lang]`.
// English is the default (Space Apps requires English); Ukrainian is a full translation.

import { app } from './state.svelte';
import type { Lang } from './engine/data';

export const COMMON = {
	en: {
		sun: 'Sunlight',
		earth: 'Earth in view',
		night: 'Longest night',
		sunShort: 'Sun',
		earthShort: 'Earth',
		heightLabel: 'Panel/antenna height',
		marginLabel: 'Antenna margin',
		period: 'Period',
		days: 'd',
		hours: 'h',
		daysLong: 'days',
		hoursLong: 'hours',
		categories: {
			artemis: 'Artemis candidate regions',
			mission: 'Missions',
			sunny: 'High-illumination points',
			shadow: 'Permanent shadow',
			custom: 'Your points'
		},
		modes: { simple: 'Simple', teacher: 'Teacher', planner: 'Planner' }
	},
	uk: {
		sun: 'Сонце',
		earth: 'Земля видна',
		night: 'Найдовша ніч',
		sunShort: 'Сонце',
		earthShort: 'Земля',
		heightLabel: 'Висота панелі/антени',
		marginLabel: 'Запас антени',
		period: 'Період',
		days: 'д',
		hours: 'год',
		daysLong: 'днів',
		hoursLong: 'годин',
		categories: {
			artemis: 'Райони посадки Artemis',
			mission: 'Місії',
			sunny: 'Найосвітленіші точки',
			shadow: 'Вічна тінь',
			custom: 'Ваші точки'
		},
		modes: { simple: 'Простий', teacher: 'Учитель', planner: 'Планувальник' }
	}
} as const;

export const c = () => COMMON[app.lang];

const LOCALE: Record<Lang, string> = { en: 'en-GB', uk: 'uk-UA' };

export function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
	return new Intl.DateTimeFormat(LOCALE[app.lang], { timeZone: 'UTC', ...opts }).format(d);
}

export function fmtMonthYear(d: Date) {
	return fmtDate(d, { month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: Date) {
	return fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC';
}

/** "78 %" style percent with locale-aware decimal separator */
export function fmtPct(v: number, digits = 0) {
	return new Intl.NumberFormat(LOCALE[app.lang], { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

export function fmtNum(v: number, digits = 0) {
	return new Intl.NumberFormat(LOCALE[app.lang], { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

/** Human duration from hours: "9.3 d" or "17 h" */
export function fmtDuration(hours: number) {
	const t = c();
	return hours >= 48 ? `${fmtNum(hours / 24, 1)} ${t.days}` : `${fmtNum(hours, 0)} ${t.hours}`;
}
