// AI-assisted: written with Claude, reviewed by the team.
// Single app state (Svelte 5 runes). Components read and write it directly;
// everything derived (series, stats) recomputes automatically.

import {
	loadCustomPoint,
	loadEphem,
	loadHeatmap,
	loadOverview,
	loadSites,
	type Ephem,
	type Grid,
	type Heatmap,
	type Lang,
	type Site,
	type SitesData
} from './engine/data';
import { bestWindows, computeSeries, indexOf, siteRadius, stats, type BestWindow, type Series, type Stats } from './engine/visibility';

export type Mode = 'simple' | 'teacher' | 'planner';
export type View = 'map' | 'panorama';
export type Preset = 'month' | 'year' | 'custom';
export type HeatLayer = 'off' | 'sun' | 'earth' | 'night';

export const LUNAR_MONTH_H = 709; // 29.53 days
export const YEAR_H = 8766;
export const DEFAULT_HEIGHT_M = 2;
export const BATTERY_PRESETS = { rover: 100, lander: 400, base: 5000 } as const;
export type BatteryPreset = keyof typeof BATTERY_PRESETS | 'custom';

export interface SiteView {
	site: Site;
	series: Series;
	stats: Stats;
}

class AppState {
	// ---- data
	eph = $state.raw<Ephem | null>(null);
	sites = $state.raw<SitesData | null>(null);
	overview = $state.raw<(Grid & { min_m: number; max_m: number }) | null>(null);
	heatmap = $state.raw<Heatmap | null>(null);
	/** custom points loaded from the API, with their 40 m tiles */
	customTiles = $state.raw<Record<string, Grid>>({});
	loadError = $state<string | null>(null);
	ready = $derived(!!(this.eph && this.sites && this.overview));

	// ---- UI
	lang = $state<Lang>('en');
	mode = $state<Mode>('simple');
	view = $state<View>('map');
	heatLayer = $state<HeatLayer>('off');
	/** where the next click on the terrain goes: site A, or site B for comparison */
	pickSlot = $state<'A' | 'B'>('A');
	/** 3D vertical exaggeration (visual only; shading and all numbers use true heights) */
	exaggeration = $state(1);
	pointBusy = $state(false);
	pointError = $state<string | null>(null);

	// ---- selection
	siteAId = $state<string>('connecting-ridge-c1');
	siteBId = $state<string | null>(null);
	customSites = $state.raw<Site[]>([]);
	heightM = $state(DEFAULT_HEIGHT_M);
	earthMarginDeg = $state(1);

	// ---- time
	nowIndex = $state(0);
	preset = $state<Preset>('year');
	win = $state<{ i0: number; i1: number }>({ i0: 0, i1: YEAR_H });
	/** cursor (ephemeris index) that drives 3D lighting and the panorama */
	t = $state(0);
	playing = $state(false);
	/** simulated hours per real second while playing */
	speed = $state(24);

	// ---- planner
	missionDays = $state(14);
	batteryPreset = $state<BatteryPreset>('rover');
	loadW = $state<number>(BATTERY_PRESETS.rover);
	dod = $state(0.8);
	best = $state.raw<BestWindow[]>([]);

	// ---- derived
	allSites = $derived<Site[]>([...(this.sites?.sites ?? []), ...this.customSites]);
	siteA = $derived(this.allSites.find((s) => s.id === this.siteAId) ?? this.allSites[0]);
	siteB = $derived(this.siteBId ? this.allSites.find((s) => s.id === this.siteBId) ?? null : null);
	heightIndex = $derived(Math.max(0, this.sites?.heights_m.indexOf(this.heightM) ?? 0));

	viewA = $derived(this.#viewFor(this.siteA));
	viewB = $derived(this.siteB ? this.#viewFor(this.siteB) : null);

	#viewFor(site: Site | undefined): SiteView | null {
		const eph = this.eph;
		if (!eph || !site?.horizons) return null;
		const prof = site.horizons[this.heightIndex];
		const series = computeSeries(
			prof,
			site.lat,
			site.lon,
			siteRadius(site.elevation_m, this.heightM),
			eph,
			this.win.i0,
			this.win.i1,
			this.earthMarginDeg
		);
		return { site, series, stats: stats(series, eph.step_s / 3600) };
	}

	// ---- actions
	async load() {
		try {
			const [eph, sites, overview] = await Promise.all([loadEphem(), loadSites(), loadOverview()]);
			this.eph = eph;
			this.sites = sites;
			this.overview = overview;
			const now = Math.max(0, Math.min(eph.count - YEAR_H, indexOf(eph, new Date())));
			this.nowIndex = now;
			if (this.preset !== 'custom') this.setPreset(this.preset, now);
			if (this.t < this.win.i0 || this.t >= this.win.i1) this.t = this.win.i0;
			loadHeatmap().then((h) => (this.heatmap = h)).catch(() => {});
		} catch (e) {
			this.loadError = e instanceof Error ? e.message : String(e);
		}
	}

	setPreset(p: Preset, start = this.win.i0) {
		this.preset = p;
		const len = p === 'month' ? LUNAR_MONTH_H : p === 'year' ? YEAR_H : this.win.i1 - this.win.i0;
		this.setWindow(start, start + len);
	}

	setWindow(i0: number, i1: number) {
		const max = this.eph?.count ?? i1;
		i0 = Math.max(0, Math.min(Math.round(i0), max - 24));
		i1 = Math.max(i0 + 24, Math.min(Math.round(i1), max));
		this.win = { i0, i1 };
		if (this.t < i0 || this.t >= i1) this.t = i0;
		this.best = [];
	}

	selectSite(id: string, slot: 'A' | 'B' = 'A') {
		if (slot === 'A') {
			this.siteAId = id;
			if (this.siteBId === id) this.siteBId = null;
		} else this.siteBId = id === this.siteAId ? null : id;
		this.best = [];
	}

	async addCustomPoint(lat: number, lon: number, slot: 'A' | 'B' = 'A') {
		if (!this.sites) return;
		this.pointBusy = true;
		this.pointError = null;
		try {
			const { site, tile } = await loadCustomPoint(lat, lon, this.sites.heights_m.length);
			if (!this.customSites.some((s) => s.id === site.id)) this.customSites = [...this.customSites, site];
			this.customTiles = { ...this.customTiles, [site.id]: tile };
			this.selectSite(site.id, slot);
		} catch (e) {
			this.pointError = e instanceof Error ? e.message : String(e);
		} finally {
			this.pointBusy = false;
		}
	}

	findBest() {
		const eph = this.eph;
		if (!eph) return;
		const site = this.siteA;
		if (!site?.horizons) return;
		// search the whole ephemeris span, not only the current window
		const series = computeSeries(
			site.horizons[this.heightIndex],
			site.lat,
			site.lon,
			siteRadius(site.elevation_m, this.heightM),
			eph,
			this.nowIndex,
			eph.count,
			this.earthMarginDeg
		);
		this.best = bestWindows(series, Math.round((this.missionDays * 24 * 3600) / eph.step_s), 3);
	}

	setBatteryPreset(p: BatteryPreset) {
		this.batteryPreset = p;
		if (p !== 'custom') this.loadW = BATTERY_PRESETS[p];
	}
}

export const app = new AppState();
