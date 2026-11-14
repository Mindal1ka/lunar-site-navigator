// AI-assisted: written with Claude, reviewed by the team.
// URL state: every shareable choice lives in the query string, so a link reproduces the view.
//
//   ?a=<site id | lat,lon>&b=<site id | lat,lon>&h=2&m=1
//    &from=<ISO>&to=<ISO>&t=<ISO>&mode=planner&view=panorama&lang=uk&heat=sun&agg=max&slope=10
//
// Defaults are left out to keep links short. Call initUrlState() once (client side);
// it applies UI params at once, waits for app.load() for the rest, then keeps the URL
// in sync (shallow replace via SvelteKit, debounced). Returns a cleanup function.

import { untrack } from 'svelte';
import { goto } from '$app/navigation';
import { app, DEFAULT_HEIGHT_M, DEFAULT_MAX_SLOPE, LUNAR_MONTH_H, YEAR_H, type HeatLayer, type Mode, type Preset, type View } from './state.svelte.ts';
import { indexOf, timeOf } from './engine/visibility';
import type { Lang, Site } from './engine/data';
import { parseLatLon } from './topbar/coords';

const MODES: Mode[] = ['simple', 'teacher', 'planner'];
const VIEWS: View[] = ['map', 'panorama'];
const LANGS: Lang[] = ['en', 'uk'];
const HEATS: HeatLayer[] = ['off', 'sun', 'earth', 'night', 'slope'];
const DEFAULT_MARGIN = 1;
const DEBOUNCE_MS = 300;
/** Default site A (the app's initial selection), captured before anything changes it. */
const DEFAULT_SITE = app.siteAId;

const pick = <T extends string>(v: string | null, allowed: readonly T[]): T | null =>
	v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null;

/** ISO for an ephemeris index: "2026-11-14" at midnight UTC, else "2026-11-14T15:00Z" */
function isoAt(i: number): string {
	if (!app.eph) return '';
	const d = timeOf(app.eph, Math.round(i));
	const iso = d.toISOString();
	return iso.slice(11, 16) === '00:00' ? iso.slice(0, 10) : iso.slice(0, 16) + 'Z';
}

function indexAt(v: string | null): number | null {
	if (!v || !app.eph) return null;
	const d = new Date(v);
	return Number.isFinite(d.getTime()) ? indexOf(app.eph, d) : null;
}

/** site → URL token: curated id, or "lat,lon" for a custom point */
function siteToken(s: Site | null | undefined): string | null {
	if (!s) return null;
	return s.category === 'custom' ? `${s.lat.toFixed(4)},${s.lon.toFixed(4)}` : s.id;
}

async function applySite(token: string | null, slot: 'A' | 'B') {
	if (!token) return;
	if (app.allSites.some((s) => s.id === token)) {
		app.selectSite(token, slot);
		return;
	}
	const p = parseLatLon(token);
	if (p) await app.addCustomPoint(p.lat, p.lon, slot);
}

function applyUi(q: URLSearchParams) {
	const lang = pick(q.get('lang'), LANGS);
	if (lang) app.lang = lang;
	const mode = pick(q.get('mode'), MODES);
	if (mode) app.mode = mode;
	const view = pick(q.get('view'), VIEWS);
	if (view) app.view = view;
	const heat = pick(q.get('heat'), HEATS);
	if (heat) app.heatLayer = heat;
	if (q.get('agg') === 'max') app.heatAggregate = 'max';
	const sl = Number(q.get('slope'));
	if (q.has('slope') && Number.isFinite(sl)) app.maxSlopeDeg = Math.max(5, Math.min(20, Math.round(sl)));
	const m = Number(q.get('m'));
	if (q.has('m') && Number.isFinite(m)) app.earthMarginDeg = Math.max(0, Math.min(5, m));
}

async function applyData(q: URLSearchParams) {
	const heights = app.sites?.heights_m ?? [];
	const h = Number(q.get('h'));
	if (q.has('h') && Number.isFinite(h) && heights.length)
		app.heightM = heights.reduce((best, x) => (Math.abs(x - h) < Math.abs(best - h) ? x : best), heights[0]);

	const i0 = indexAt(q.get('from'));
	const i1 = indexAt(q.get('to'));
	if (i0 !== null && i1 !== null && i1 > i0) {
		const len = i1 - i0;
		const p: Preset = len === LUNAR_MONTH_H ? 'month' : len === YEAR_H ? 'year' : 'custom';
		app.preset = p;
		app.setWindow(i0, i1);
	} else if (i0 !== null) {
		app.setPreset(app.preset === 'custom' ? 'year' : app.preset, i0);
	}
	const t = indexAt(q.get('t'));
	if (t !== null && t >= app.win.i0 && t < app.win.i1) app.t = t;

	// A first, then B (selecting B equal to A clears B, so the order matters)
	await applySite(q.get('a'), 'A');
	await applySite(q.get('b'), 'B');
}

/**
 * Query string for the current state.
 * `full` (used by Share) always includes the site, window and time cursor.
 */
export function buildQuery(full = false): string {
	const q = new URLSearchParams();
	const a = siteToken(app.siteA);
	if (a && (full || app.siteAId !== DEFAULT_SITE)) q.set('a', a);
	const b = siteToken(app.siteB);
	if (b) q.set('b', b);
	if (app.heightM !== DEFAULT_HEIGHT_M) q.set('h', String(app.heightM));
	if (app.earthMarginDeg !== DEFAULT_MARGIN) q.set('m', String(+app.earthMarginDeg.toFixed(2)));

	if (app.eph) {
		const { i0, i1 } = app.win;
		const isDefaultWin = app.preset === 'year' && i0 === app.nowIndex && i1 - i0 === YEAR_H;
		if (full || !isDefaultWin) {
			q.set('from', isoAt(i0));
			q.set('to', isoAt(i1));
		}
		// the cursor moves every frame while playing: only record it when paused
		if (!app.playing) {
			const t = Math.round(app.t);
			if (full || t !== i0) q.set('t', isoAt(t));
		}
	}
	if (app.mode !== 'simple') q.set('mode', app.mode);
	if (app.view !== 'map') q.set('view', app.view);
	if (app.lang !== 'en') q.set('lang', app.lang);
	if (app.heatLayer !== 'off') q.set('heat', app.heatLayer);
	if (app.heatAggregate !== 'centre') q.set('agg', app.heatAggregate);
	if (app.maxSlopeDeg !== DEFAULT_MAX_SLOPE) q.set('slope', String(app.maxSlopeDeg));
	// keep commas and colons readable in shared links
	return q.toString().replace(/%2C/gi, ',').replace(/%3A/gi, ':');
}

/** Absolute shareable link for the current state. */
export function shareUrl(): string {
	const s = buildQuery(true);
	return `${location.origin}${location.pathname}${s ? `?${s}` : ''}${location.hash}`;
}

let started = false;

function write() {
	const s = buildQuery(false);
	const next = `${location.pathname}${s ? `?${s}` : ''}${location.hash}`;
	if (next === `${location.pathname}${location.search}${location.hash}`) return;
	// shallow + replace: updates the address bar without navigating or adding history entries
	goto(next, { shallow: true, replace: true, state: {} }).catch(() => history.replaceState(history.state, '', next));
}

export function initUrlState(): () => void {
	if (typeof window === 'undefined' || started) return () => {};
	started = true;
	const q = new URLSearchParams(location.search);
	applyUi(q);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let phase = $state<'wait' | 'applying' | 'sync'>('wait');
	const stop = $effect.root(() => {
		$effect(() => {
			if (!app.ready || phase !== 'wait') return;
			// apply data params once, then start syncing
			phase = 'applying';
			untrack(() => applyData(q)).finally(() => (phase = 'sync'));
		});
		$effect(() => {
			if (phase !== 'sync') return;
			buildQuery(false); // track every field the query reads
			clearTimeout(timer);
			timer = setTimeout(() => {
				try {
					write();
				} catch {
					/* router not ready yet: the next change writes it */
				}
			}, DEBOUNCE_MS);
		});
	});
	return () => {
		clearTimeout(timer);
		stop();
		started = false;
	};
}
