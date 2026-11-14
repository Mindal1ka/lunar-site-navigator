// AI-assisted: written with Claude, reviewed by the team.
// Single app state (Svelte 5 runes). Components read and write it directly;
// everything derived (series, stats) recomputes automatically.

import { untrack } from 'svelte';
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
import { bestSpot, loadFineSquare, loadSiteSquare, pollSquareApi, spread, type Spot, type Spread, type Square } from './engine/squares';
import { bestWindows, computeSeries, indexOf, siteRadius, stats, type BestWindow, type Series, type Stats } from './engine/visibility';

export type Mode = 'simple' | 'teacher' | 'planner';
export type View = 'map' | 'panorama';
export type Preset = 'month' | 'year' | 'custom';
export type HeatLayer = 'off' | 'sun' | 'earth' | 'night' | 'slope';
export type HeatAggregate = 'centre' | 'max';

/** State of the detailed 10 km map of a custom point (/api/square). */
export type SquareJob =
	| { state: 'queued' | 'running'; position: number; etaS: number; hidden: boolean }
	| { state: 'busy'; retryS: number; hidden: boolean }
	| { state: 'error'; message: string; hidden: boolean }
	| { state: 'cancelled'; hidden: boolean };

export const SQUARE_POLL_MS = 2000;
export const DEFAULT_MAX_SLOPE = 10;

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
	/** best-in-cell overview (optional file); shown when heatAggregate is 'max' */
	heatmapMax = $state.raw<Heatmap | null>(null);
	/** detail squares by site id (exact = same method as the card, fast = provisional) */
	squares = $state.raw<Record<string, Square>>({});
	squareJobs = $state.raw<Record<string, SquareJob>>({});
	/** custom points loaded from the API, with their 40 m tiles */
	customTiles = $state.raw<Record<string, Grid>>({});
	loadError = $state<string | null>(null);
	ready = $derived(!!(this.eph && this.sites && this.overview));

	// ---- UI
	lang = $state<Lang>('en');
	mode = $state<Mode>('simple');
	view = $state<View>('map');
	heatLayer = $state<HeatLayer>('off');
	heatAggregate = $state<HeatAggregate>('centre');
	/** lander slope limit for the best spot (deg) */
	maxSlopeDeg = $state(DEFAULT_MAX_SLOPE);
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

	squareA = $derived(this.siteA ? this.squares[this.siteA.id] ?? null : null);
	squareB = $derived(this.siteB ? this.squares[this.siteB.id] ?? null : null);
	/** best landing cell within 5 km (slope <= maxSlopeDeg) and the spread within 500 m */
	bestA = $derived<Spot | null>(this.squareA ? bestSpot(this.squareA, this.heightM, this.maxSlopeDeg) : null);
	bestB = $derived<Spot | null>(this.squareB ? bestSpot(this.squareB, this.heightM, this.maxSlopeDeg) : null);
	spreadA = $derived<Spread | null>(this.squareA ? spread(this.squareA, this.heightM, 500) : null);
	/** overview heat map actually shown */
	heatShown = $derived(this.heatAggregate === 'max' && this.heatmapMax ? this.heatmapMax : this.heatmap);

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
			// heat maps are off by default: fetch them after the first view has settled, not during startup
			const heat = () => {
				loadHeatmap().then((h) => (this.heatmap = h)).catch(() => {});
				loadHeatmap('heatmap_max').then((h) => (this.heatmapMax = h)).catch(() => {});
			};
			if (/[?&]heat=/.test(location.search)) heat();
			else if ('requestIdleCallback' in window) requestIdleCallback(heat, { timeout: 4000 });
			else setTimeout(heat, 2500);
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
		this.t = Math.max(i0, Math.min(i1 - 1, this.t));
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

	// ---- detail squares

	#squareReq = new Set<string>();
	#polls = new Map<string, { ctl: AbortController; timer: ReturnType<typeof setTimeout> | null }>();

	#setSquare(sq: Square) {
		this.squares = { ...this.squares, [sq.key]: sq };
	}
	#setJob(id: string, job: SquareJob | null) {
		const next = { ...this.squareJobs };
		if (job) next[id] = job;
		else delete next[id];
		this.squareJobs = next;
	}

	/** Load (curated) or request (custom point) the detail square of a site. Idempotent. */
	ensureSquare(site: Site | null | undefined) {
		if (!site) return;
		const id = site.id;
		if (this.squares[id]?.kind === 'exact') return;
		if (site.category !== 'custom') {
			if (this.#squareReq.has(id)) return;
			this.#squareReq.add(id);
			loadSiteSquare(id).then((sq) => {
				if (sq) this.#setSquare(sq);
				else this.#squareReq.delete(id);
			});
			return;
		}
		if (this.#polls.has(id)) return;
		const job = this.squareJobs[id];
		if (job?.state === 'cancelled' || job?.state === 'error') return;
		if (!this.squares[id] && !this.#squareReq.has(id)) {
			this.#squareReq.add(id);
			// provisional detail from the fast map while the exact one is computed
			loadFineSquare(id, site.lat, site.lon).then((sq) => {
				if (sq && !this.squares[id]) this.#setSquare(sq);
			});
		}
		this.#poll(site);
	}

	#poll(site: Site) {
		const id = site.id;
		const ctl = new AbortController();
		const entry = { ctl, timer: null as ReturnType<typeof setTimeout> | null };
		this.#polls.set(id, entry);
		const again = (ms: number) => {
			if (ctl.signal.aborted) return;
			entry.timer = setTimeout(step, ms);
		};
		const hidden = () => this.squareJobs[id]?.hidden ?? false;
		const step = async () => {
			entry.timer = null;
			try {
				const r = await pollSquareApi(id, site.lat, site.lon, ctl.signal);
				if (ctl.signal.aborted) return;
				if (r.kind === 'ready') {
					this.#polls.delete(id);
					this.#setSquare(r.square);
					this.#setJob(id, null);
				} else if (r.kind === 'pending') {
					this.#setJob(id, { state: r.state, position: r.position, etaS: r.etaS, hidden: hidden() });
					again(SQUARE_POLL_MS);
				} else if (r.kind === 'busy') {
					this.#setJob(id, { state: 'busy', retryS: r.retryS, hidden: hidden() });
					again(Math.max(5, r.retryS) * 1000);
				} else {
					this.#polls.delete(id);
					this.#setJob(id, { state: 'error', message: r.message, hidden: false });
				}
			} catch (e) {
				if (ctl.signal.aborted || (e as Error)?.name === 'AbortError') return;
				// anything else (bad JSON, a decoding error...): show it and let the user retry
				this.#polls.delete(id);
				this.#setJob(id, { state: 'error', message: 'unavailable', hidden: false });
			}
		};
		step();
	}

	#stopPoll(id: string) {
		const p = this.#polls.get(id);
		if (!p) return;
		p.ctl.abort();
		if (p.timer) clearTimeout(p.timer);
		this.#polls.delete(id);
	}

	/** Stop asking for a custom point's detail map. */
	cancelSquare(id: string) {
		this.#stopPoll(id);
		this.#setJob(id, { state: 'cancelled', hidden: true });
	}
	/** Ask again after a cancel or an error. */
	retrySquare(site: Site) {
		this.#stopPoll(site.id);
		this.#setJob(site.id, null);
		this.ensureSquare(site);
	}
	hideSquareJob(id: string) {
		const j = this.squareJobs[id];
		if (j) this.#setJob(id, { ...j, hidden: true });
	}

	/** Keep the squares of the selected sites loaded; stop polling for points no longer shown. */
	startSquares(): () => void {
		return $effect.root(() => {
			$effect(() => {
				const sel = [this.siteA, this.siteB];
				if (!this.sites) return;
				untrack(() => {
					for (const s of sel) this.ensureSquare(s);
					const keep = new Set(sel.map((s) => s?.id));
					for (const id of [...this.#polls.keys()]) if (!keep.has(id)) {
						this.#stopPoll(id);
						if (this.squareJobs[id]) this.#setJob(id, null);
					}
				});
			});
			return () => {
				for (const id of [...this.#polls.keys()]) this.#stopPoll(id);
			};
		});
	}

	setBatteryPreset(p: BatteryPreset) {
		this.batteryPreset = p;
		if (p !== 'custom') this.loadW = BATTERY_PRESETS[p];
	}
}

export const app = new AppState();
