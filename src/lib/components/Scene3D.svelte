<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!--
	Hero 3D view of the lunar south pole: NASA LOLA terrain lit by the real Sun
	(JPL/NAIF ephemeris) with ray-marched shadows, the Earth at its true direction
	and phase, site markers, heat map overlay and a damped orbit camera.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { fade, fly, scale, slide } from 'svelte/transition';
	import { cubicOut, backOut } from 'svelte/easing';
	import { app, type HeatLayer } from '#lib/state.svelte.ts';
	import { loadSiteTile, type Grid, type Site, type SiteCategory } from '#lib/engine/data.ts';
	import { ephemAt } from '#lib/engine/visibility.ts';
	import { AU_KM, MOON_R_M, SUN_R_KM, unitFromLatLon, xyToLatLon, type Vec3 } from '#lib/engine/geo.ts';
	import { COMMON, fmtMonthYear, fmtNum } from '#lib/i18n.ts';
	import { SceneEngine, type HeatIndex, type Insets } from '#lib/scene/engine.ts';
	import { dirToScene, siteToScene } from '#lib/scene/coords.ts';
	import { nightT, rampCss, slopeT, type RampLayer } from '#lib/scene/ramps.ts';
	import { cellAt, nearestHeight, planesFor, squareRgba, type Square } from '#lib/engine/squares.ts';
	import { latLonToXY } from '#lib/engine/geo.ts';
	import { surfaceAt } from '#lib/scene/coords.ts';

	const T = {
		en: {
			region: '3D map of the lunar south pole',
			regionHelp:
				'Drag to rotate, scroll or pinch to zoom, right-drag or two fingers to pan. Arrow keys pan, plus and minus zoom, 0 recentres. Click the terrain to analyse a point.',
			heat: 'Heat map',
			off: 'Off',
			sun: 'Sunlight',
			earth: 'Earth',
			night: 'Night',
			slope: 'Slope',
			aggLabel: 'Overview cells (1 km)',
			aggCentre: 'Cell centre',
			aggMax: 'Best in cell',
			aggLine: { centre: 'value at the cell centre', max: 'best of 10 × 10 cells of 100 m' } as Record<string, string>,
			slopeSrc: 'Detail squares: LOLA 40 m, over 80 m. Elsewhere: approximate, from the 3D terrain.',
			slopeLimit: (d: number) => `Lander slope limit ${d}°: steeper cells hatched`,
			sqLine: (p: string) => `Detail squares: 100 m cells, same method as the card, ${p}`,
			sqFast: (h: number) => `Provisional detail: fast map method, 100 m cells, ${h} m`,
			sqHeight: (shown: number, card: number) => `Detail computed for ${shown} m; card uses ${card} m`,
			detail: '100 m detail',
			slopeApprox: 'approximate, from the 3D terrain',
			best: 'Best spot',
			bestAria: (sun: string, slope: string) => `Best landing spot: ${sun} Sun, slope ${slope}. Analyse this spot`,
			vscale: (n: number) => `Vertical scale ×${n}`,
			vscaleNote: '(shading uses true heights)',
			recentre: 'Recentre on the selected sites',
			zoomIn: 'Zoom in',
			zoomOut: 'Zoom out',
			layers: 'Map layers',
			close: 'Close',
			pickHint: (s: string) => `Click the terrain to place point ${s}`,
			pickHintTouch: (s: string) => `Tap the terrain to place point ${s}`,
			noHeat: 'Heat map data is not available yet',
			legend: {
				sun: { title: 'Sunlight', what: 'mean visible share of the solar disk' },
				earth: { title: 'Earth in view', what: (m: number) => `share of hours with Earth's centre above the horizon + ${m}° antenna margin` },
				night: { title: 'Longest night', what: 'longest stretch with the Sun fully hidden' },
				slope: { title: 'Slope', what: 'steepness of the ground, degrees from level' }
			},
			heightLine: (h: number) => `Panel/antenna height: ${h} m`,
			cellLine: (km: number) => `${km} km cells: an overview, site values come from the 40 m horizon`,
			mismatch: (h: number) => `Map precomputed at ${h} m; site numbers follow your height setting.`,
			why: {
				shadows: 'Why the long shadows? At the pole the Sun never climbs more than about 1.5° above the horizon, so every hill casts a shadow kilometres long. Shadows here are traced on real LOLA heights.',
				sun: 'Why so patchy? With the Sun skimming the horizon, a ridge a few hundred metres high decides whether a spot gets light. Crater floors can stay dark for years.',
				earth: 'Why does the Earth come and go? From the south pole the Earth hangs low on the horizon and rocks up and down as the Moon wobbles (libration), so hills block it part of the time.',
				night: 'Why are some nights so long? Deep craters hide the Sun for months or forever, while high ridges between them have nights of only a few days.',
				slope: 'Why does slope matter? A lander needs fairly level ground. The sunniest spots are usually ridge crests, which are often too steep or too narrow to land on, so the best landing spot is a compromise.'
			},
			elev: 'Elevation (LOLA)',
			clickA: (s: string) => `Click to analyse this point as ${s}`,
			busy: 'Computing the horizon from LOLA 40 m terrain',
			errTitle: 'Could not analyse this point',
			dismiss: 'Dismiss',
			lost: 'Graphics paused. Restoring the 3D view…',
			noGl: 'The 3D view needs WebGL 2, which this browser does not provide.',
			openPano: 'Open the 360° panorama',
			lat: (v: string) => `${v}° S`,
			lon: (v: string) => `${v}° E`,
			site: 'Site',
			days: 'd',
			allDark: 'no sunlight in the whole period',
			atLeast: '≥'
		},
		uk: {
			region: '3D-мапа південного полюса Місяця',
			regionHelp:
				'Тягніть, щоб обертати, коліщатко або щипок — масштаб, права кнопка чи два пальці — зсув. Стрілки зсувають, плюс і мінус змінюють масштаб, 0 повертає вид. Клацніть по рельєфу, щоб проаналізувати точку.',
			heat: 'Теплова карта',
			off: 'Вимк.',
			sun: 'Сонце',
			earth: 'Земля',
			night: 'Ніч',
			slope: 'Нахил',
			aggLabel: 'Комірки огляду (1 км)',
			aggCentre: 'Центр комірки',
			aggMax: 'Найкраще в комірці',
			aggLine: { centre: 'значення в центрі комірки', max: 'найкраще з 10 × 10 комірок по 100 м' } as Record<string, string>,
			slopeSrc: 'Детальні квадрати: LOLA 40 м, на відрізку 80 м. Деінде — приблизно, з 3D-рельєфу.',
			slopeLimit: (d: number) => `Межа нахилу для посадки ${d}°: крутіші комірки заштриховано`,
			sqLine: (p: string) => `Детальні квадрати: комірки 100 м, той самий метод, що й у картці, ${p}`,
			sqFast: (h: number) => `Попередня деталізація: швидкий метод карти, комірки 100 м, ${h} м`,
			sqHeight: (shown: number, card: number) => `Деталізацію пораховано для ${shown} м; картка — для ${card} м`,
			detail: 'Деталізація 100 м',
			slopeApprox: 'приблизно, з 3D-рельєфу',
			best: 'Найкраще місце',
			bestAria: (sun: string, slope: string) => `Найкраще місце посадки: Сонце ${sun}, нахил ${slope}. Проаналізувати це місце`,
			vscale: (n: number) => `Вертикальний масштаб ×${n}`,
			vscaleNote: '(освітлення — за справжніми висотами)',
			recentre: 'Повернутися до вибраних місць',
			zoomIn: 'Наблизити',
			zoomOut: 'Віддалити',
			layers: 'Шари мапи',
			close: 'Закрити',
			pickHint: (s: string) => `Клацніть по рельєфу, щоб поставити точку ${s}`,
			pickHintTouch: (s: string) => `Торкніться рельєфу, щоб поставити точку ${s}`,
			noHeat: 'Дані теплової карти ще недоступні',
			legend: {
				sun: { title: 'Сонце', what: 'середня видима частка сонячного диска' },
				earth: { title: 'Земля видна', what: (m: number) => `частка годин, коли центр Землі вище горизонту + ${m}° запасу антени` },
				night: { title: 'Найдовша ніч', what: 'найдовший відрізок, коли Сонце повністю сховане' },
				slope: { title: 'Нахил', what: 'крутизна ґрунту, градуси від горизонталі' }
			},
			heightLine: (h: number) => `Висота панелі/антени: ${h} м`,
			cellLine: (km: number) => `Комірки ${km} км: огляд, значення для місць — з горизонту 40 м`,
			mismatch: (h: number) => `Карту пораховано для ${h} м; цифри місць ідуть за вашою висотою.`,
			why: {
				shadows: 'Чому такі довгі тіні? На полюсі Сонце не підіймається вище приблизно 1,5° над горизонтом, тож кожен пагорб кидає тінь на кілометри. Тіні тут пораховано за справжніми висотами LOLA.',
				sun: 'Чому так плямисто? Коли Сонце ковзає над горизонтом, гребінь заввишки кілька сотень метрів вирішує, чи буде світло. Дно кратерів може лишатися темним роками.',
				earth: 'Чому Земля то видна, то ні? З південного полюса Земля висить низько над горизонтом і гойдається вгору-вниз через лібрацію Місяця, тож пагорби часом її закривають.',
				night: 'Чому деякі ночі такі довгі? Глибокі кратери ховають Сонце на місяці або назавжди, а на високих гребенях між ними ніч триває лише кілька днів.',
				slope: 'Чому важливий нахил? Апаратові потрібен досить рівний ґрунт. Найосвітленіші місця — зазвичай гребені хребтів, які часто надто круті або вузькі для посадки, тож найкраще місце посадки — це компроміс.'
			},
			elev: 'Висота (LOLA)',
			clickA: (s: string) => `Клацніть, щоб проаналізувати точку як ${s}`,
			busy: 'Рахуємо горизонт за рельєфом LOLA 40 м',
			errTitle: 'Не вдалося проаналізувати точку',
			dismiss: 'Закрити',
			lost: 'Графіку призупинено. Відновлюємо 3D-вид…',
			noGl: '3D-виду потрібен WebGL 2, а цей браузер його не підтримує.',
			openPano: 'Відкрити панораму 360°',
			lat: (v: string) => `${v}° пд. ш.`,
			lon: (v: string) => `${v}° сх. д.`,
			site: 'Місце',
			days: 'д',
			allDark: 'без Сонця за весь період',
			atLeast: '≥'
		}
	};
	const t = $derived(T[app.lang]);
	const cm = $derived(COMMON[app.lang]);

	const HEAT_ORDER: HeatLayer[] = ['off', 'sun', 'earth', 'night', 'slope'];
	const EXAGS = [1, 2, 4];
	const CAT_COLOR: Record<SiteCategory, string> = {
		artemis: '#8fb8ff',
		mission: '#9be7a8',
		sunny: '#ffb547',
		shadow: '#8f8bc4',
		custom: '#e9edf5'
	};

	let host = $state<HTMLDivElement>() as HTMLDivElement;
	let engine = $state.raw<SceneEngine | null>(null);
	let lost = $state(false);
	let noGl = $state(false);
	let introDone = $state(false);
	/** markers stagger in once after the intro; later reappearances are immediate */
	let settled = $state(false);
	$effect(() => {
		if (!introDone) return;
		const id = setTimeout(() => (settled = true), 1600);
		return () => clearTimeout(id);
	});
	let mobile = $state(false);
	let coarse = $state(false);
	let reduced = false;
	let panelOpen = $state(true);
	let dragging = $state(false);

	const markerEls: Record<string, HTMLElement> = {};
	function track(node: HTMLElement, id: string) {
		markerEls[id] = node;
		engine?.invalidate();
		return {
			destroy() {
				if (markerEls[id] === node) delete markerEls[id];
			}
		};
	}
	let pendingEl = $state<HTMLElement | null>(null);
	const bestEls: (HTMLElement | null)[] = $state([null, null]);
	let pending: Vec3 | null = null;

	interface Hover {
		x: number;
		y: number;
		lat: number;
		lon: number;
		elev: number;
		heat: number | null;
		/** the value comes from a 100 m detail square (with its shown height) */
		sq: { h: number; fast: boolean } | null;
	}
	let hover = $state<Hover | null>(null);
	let ripples = $state<{ id: number; x: number; y: number }[]>([]);
	let rippleId = 0;

	// ---------------------------------------------------------------- derived UI

	const heatIndex = $derived(HEAT_ORDER.indexOf(app.heatLayer));
	const exagIndex = $derived(Math.max(0, EXAGS.indexOf(app.exaggeration)));
	const heatReady = $derived(!!app.heatmap || !!app.squareA || !!app.squareB);
	const anySquare = $derived(app.squareA ?? app.squareB);
	const slotLabel = $derived(app.pickSlot);

	function periodText(p: [string, string] | undefined): string {
		if (!p) return '';
		const start = new Date(p[0]);
		const m = /([+-]?\d+(?:\.\d+)?)\s*h/.exec(p[1] ?? '');
		const end = m ? new Date(start.getTime() + parseFloat(m[1]) * 3600e3) : new Date(p[1]);
		if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
		return `${fmtMonthYear(start)} – ${fmtMonthYear(end)}`;
	}
	const heatPeriod = $derived(periodText(app.heatShown?.period_utc));
	function sqPeriod(sq: Square): string {
		const a = new Date(sq.startUnix * 1000);
		const b = new Date((sq.startUnix + sq.hours * 3600) * 1000);
		return `${fmtMonthYear(a)} – ${fmtMonthYear(b)}`;
	}

	const legendTicks = $derived.by(() => {
		const L = app.heatLayer;
		if (L === 'night') return [1, 4, 15, 60, 250].map((d) => ({ pos: nightT(d) * 100, label: `${d} ${t.days}` }));
		if (L === 'slope') return [0, 5, 10, 15, 20, 30].map((d) => ({ pos: slopeT(d) * 100, label: `${d}°` }));
		return [0, 25, 50, 75, 100].map((v) => ({ pos: v, label: `${v} %` }));
	});

	// ---------------------------------------------------------------- helpers

	function readPx(name: string, fallback: number): number {
		const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
		return Number.isFinite(v) ? v : fallback;
	}

	function computeInsets(): Insets {
		const r = host.getBoundingClientRect();
		const g = readPx('--gutter', 16);
		const top = readPx('--topbar-h', 60);
		const tl = readPx('--timeline-h', 132);
		// phone: top bar + timeline + the layers button row above, bottom sheet below
		if (r.width < 768) return { top: top + tl + g * 4 + 44, right: 0, bottom: Math.round(r.height * 0.34), left: 0 };
		let bottom = tl + g * 2;
		if (app.mode === 'planner') bottom += Math.min(300, r.height * 0.34) + g;
		return { top: top + g * 2, right: readPx('--panel-w', 392) + g * 2, bottom, left: 0 };
	}

	function sitePoint(s: Site, liftKm = 0): Vec3 {
		return siteToScene(s.lat, s.lon, s.elevation_m, engine?.exag ?? 1, liftKm);
	}

	function sunTheta(): number {
		const eph = app.eph;
		if (!eph) return 0;
		const d = dirToScene(ephemAt(eph, app.t).sunDir);
		return Math.atan2(d[0], d[2]);
	}

	function framePose() {
		const pts = [sitePoint(app.siteA!)];
		if (app.siteB) pts.push(sitePoint(app.siteB));
		return pts;
	}

	function recentre() {
		const eng = engine;
		if (!eng || !app.siteA) return;
		const cur = eng.framing(framePose());
		eng.fly(eng.framing(framePose(), { phi: app.siteB ? 0.88 : 1.12, minRadius: 34, theta: cur.theta }), 1400);
	}

	// ---------------------------------------------------------------- engine lifecycle

	onMount(() => {
		const mqMobile = matchMedia('(max-width: 767px)');
		const mqCoarse = matchMedia('(pointer: coarse)');
		const mqReduced = matchMedia('(prefers-reduced-motion: reduce)');
		mobile = mqMobile.matches;
		coarse = mqCoarse.matches;
		reduced = mqReduced.matches;
		panelOpen = !mobile;

		let eng: SceneEngine;
		try {
			const probe = document.createElement('canvas').getContext('webgl2');
			if (!probe) throw new Error('no webgl2');
			eng = new SceneEngine(host, {
				mobile: mobile || coarse,
				reducedMotion: reduced,
				onFrame: updateOverlay,
				onContextLost: () => (lost = true),
				onContextRestored: () => (lost = false),
				onUserMove: () => (hover = null)
			});
		} catch {
			noGl = true;
			return;
		}
		engine = eng;
		eng.setInsets(computeInsets());

		const ro = new ResizeObserver(() => {
			eng.setInsets(computeInsets());
		});
		ro.observe(host);
		const onMq = () => {
			mobile = mqMobile.matches;
			eng.setInsets(computeInsets());
		};
		mqMobile.addEventListener('change', onMq);

		return () => {
			ro.disconnect();
			mqMobile.removeEventListener('change', onMq);
			eng.dispose();
			engine = null;
		};
	});

	// terrain
	$effect(() => {
		const eng = engine;
		const ov = app.overview;
		if (eng && ov) untrack(() => eng.setOverview(ov));
	});

	// Sun and Earth for the time cursor (Earth topocentric from site A)
	$effect(() => {
		const eng = engine;
		const eph = app.eph;
		const s = app.siteA;
		const tt = app.t;
		const hM = app.heightM;
		if (!eng || !eph || !s) return;
		const { sunDir, sunAu, earthKm } = ephemAt(eph, tt);
		const rSun = Math.asin(SUN_R_KM / (sunAu * AU_KM));
		const u = unitFromLatLon(s.lat, s.lon);
		const rk = (MOON_R_M + s.elevation_m + hM) / 1000;
		const e: Vec3 = [earthKm[0] - u[0] * rk, earthKm[1] - u[1] * rk, earthKm[2] - u[2] * rk];
		const dist = Math.hypot(e[0], e[1], e[2]);
		const eu: Vec3 = [e[0] / dist, e[1] / dist, e[2] / dist];
		const phase = (1 - (sunDir[0] * eu[0] + sunDir[1] * eu[1] + sunDir[2] * eu[2])) / 2;
		eng.setSun(dirToScene(sunDir), rSun);
		eng.setEarth(dirToScene(eu), dist, phase);
	});

	$effect(() => {
		const x = app.exaggeration;
		engine?.setExaggeration(x);
	});
	$effect(() => {
		const h = app.heightM;
		engine?.setObserverHeight(h);
	});
	$effect(() => {
		const hm = app.heatShown;
		const eng = engine;
		if (eng) untrack(() => eng.setHeatmap(hm));
	});
	$effect(() => {
		const i = HEAT_ORDER.indexOf(app.heatLayer) as HeatIndex;
		engine?.setHeatLayer(i);
	});

	// 100 m detail squares around A and B, for the plane nearest to the panel height
	const sqShown: (string | null)[] = [null, null];
	$effect(() => {
		const eng = engine;
		const list = [app.squareA, app.squareB];
		const h = app.heightM;
		if (!eng) return;
		untrack(() =>
			list.forEach((sq, i) => {
				const slot = i as 0 | 1;
				const k = sq ? `${sq.key}|${sq.kind}|${nearestHeight(sq, h)}` : null;
				if (k === sqShown[slot]) return;
				sqShown[slot] = k;
				if (!sq) return eng.setSquare(slot, null);
				const half = (sq.n / 2) * sq.cellM;
				eng.setSquare(slot, {
					key: sq.key,
					n: sq.n,
					rgba: squareRgba(sq, h),
					x0Km: (sq.cx - half) / 1000,
					y0Km: (sq.cy + half) / 1000,
					extKm: (sq.n * sq.cellM) / 1000
				});
			})
		);
	});
	$effect(() => {
		const eng = engine;
		const spots = [app.bestA, app.bestB];
		const sqs = [app.squareA, app.squareB];
		if (!eng) return;
		untrack(() =>
			spots.forEach((b, i) => {
				const sq = sqs[i];
				eng.setBestSpot(i as 0 | 1, b && sq ? { key: `${sq.key}|${b.r},${b.c}`, mx: b.x / 1000, my: b.y / 1000, cellKm: sq.cellM / 1000 } : null);
			})
		);
	});
	$effect(() => {
		const d = app.maxSlopeDeg;
		engine?.setSlopeLimit(d);
	});
	$effect(() => {
		const v = app.view === 'map';
		const eng = engine;
		if (!eng) return;
		eng.visible = v;
		if (v) eng.invalidate();
		else hover = null;
	});
	$effect(() => {
		// layout changes with the mode (planner panel takes the bottom-left)
		app.mode;
		const eng = engine;
		if (eng) untrack(() => eng.setInsets(computeInsets()));
	});
	$effect(() => {
		// new markers need a frame to be placed
		app.allSites.length;
		app.lang;
		engine?.invalidate();
	});

	// 40 m detail tiles for A and B
	const tileCache = new Map<string, Promise<Grid | null>>();
	const wanted: (string | null)[] = [null, null];
	function tileFor(s: Site): Promise<Grid | null> {
		const custom = app.customTiles[s.id];
		if (custom) return Promise.resolve(custom);
		if (s.category === 'custom') return Promise.resolve(null);
		let p = tileCache.get(s.id);
		if (!p) {
			p = loadSiteTile(s.id).catch(() => null);
			tileCache.set(s.id, p);
		}
		return p;
	}
	$effect(() => {
		const eng = engine;
		const ready = !!app.overview;
		const sites = [app.siteA ?? null, app.siteB];
		app.customTiles;
		if (!eng || !ready) return;
		untrack(() => {
			sites.forEach((s, i) => {
				const slot = i as 0 | 1;
				wanted[slot] = s?.id ?? null;
				if (!s) {
					eng.setDetail(slot, null, null);
					return;
				}
				tileFor(s).then((g) => {
					if (wanted[slot] !== s.id || engine !== eng) return;
					eng.setDetail(slot, s.id, g);
				});
			});
		});
	});

	// cinematic intro, then fly to every new selection
	let introStarted = false;
	let lastSel = '';
	$effect(() => {
		const eng = engine;
		const a = app.siteA;
		const b = app.siteB;
		if (!eng || !a || !app.overview || !app.eph) return;
		const key = `${a.id}|${b?.id ?? ''}`;
		untrack(() => {
			if (!introStarted) {
				introStarted = true;
				lastSel = key;
				const pose = eng.framing(framePose(), { theta: sunTheta() + Math.PI + 0.5, phi: 1.22, minRadius: 36 });
				eng.intro(pose).then(() => (introDone = true));
				return;
			}
			if (key === lastSel) return;
			lastSel = key;
			const cur = eng.framing(framePose());
			const phi = b ? 0.88 : Math.min(1.2, Math.max(0.8, eng.controls.getPolarAngle()));
			eng.fly(eng.framing(framePose(), { phi, theta: cur.theta, minRadius: 34 }), 1600);
		});
	});

	// ---------------------------------------------------------------- per-frame overlay

	function updateOverlay() {
		const eng = engine;
		if (!eng) return;
		const w = host.clientWidth;
		const h = host.clientHeight;
		for (const s of app.allSites) {
			const el = markerEls[s.id];
			if (!el) continue;
			const p = sitePoint(s, 0.004);
			const sp = eng.project(p);
			if (!sp || sp.x < -80 || sp.y < -80 || sp.x > w + 80 || sp.y > h + 80) {
				el.dataset.state = 'hidden';
				continue;
			}
			const occ = eng.occluded(sitePoint(s, 0.03));
			el.style.transform = `translate3d(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px, 0)`;
			el.style.setProperty('--k', Math.max(0.62, Math.min(1.1, 48 / sp.depth + 0.55)).toFixed(3));
			el.style.zIndex = String(Math.round(10000 - sp.depth));
			el.dataset.state = occ ? 'occluded' : 'visible';
			el.classList.toggle('flip', sp.x > w - 190);
		}
		const spots = [app.bestA, app.bestB];
		for (let k = 0; k < 2; k++) {
			const el = bestEls[k];
			const b = spots[k];
			if (!el || !b) continue;
			const mx = b.x / 1000;
			const my = b.y / 1000;
			const elev = eng.hf.inside(mx, my) ? eng.hf.heightM(mx, my) : 0;
			const p = surfaceAt(mx, my, (elev / 1000) * eng.exag + 0.004);
			const sp = eng.project(p);
			if (!sp || sp.x < -60 || sp.y < -60 || sp.x > w + 60 || sp.y > h + 60) {
				el.dataset.state = 'hidden';
				continue;
			}
			el.style.transform = `translate3d(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px, 0)`;
			el.style.setProperty('--k', Math.max(0.7, Math.min(1.1, 48 / sp.depth + 0.6)).toFixed(3));
			el.dataset.state = eng.occluded(surfaceAt(mx, my, (elev / 1000) * eng.exag + 0.03)) ? 'occluded' : 'visible';
		}
		if (pendingEl && pending) {
			const sp = eng.project(pending);
			if (sp) pendingEl.style.transform = `translate3d(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px, 0)`;
		}
	}

	// ---------------------------------------------------------------- pointer: hover readout + click to analyse

	let down: { x: number; y: number; t: number; id: number } | null = null;
	/** pointers currently pressed; a gesture that ever had two is a pinch/pan, never a tap */
	const activePointers = new Set<number>();
	let multiTouch = false;
	let hoverRaf = 0;
	let hoverAt: { x: number; y: number } | null = null;

	function readout(clientX: number, clientY: number): Hover | null {
		const eng = engine;
		if (!eng) return null;
		const hit = eng.pick(clientX, clientY);
		if (!hit) return null;
		const [lat, lon] = xyToLatLon(hit.mx * 1000, hit.my * 1000);
		const elev = eng.hf.heightM(hit.mx, hit.my);
		let heat: number | null = null;
		let sqInfo: Hover['sq'] = null;
		const L = app.heatLayer;
		if (L !== 'off') {
			// inside a detail square: its 100 m cell (same method as the card)
			for (const sq of [app.squareA, app.squareB]) {
				if (!sq) continue;
				const cell = cellAt(sq, hit.mx * 1000, hit.my * 1000);
				if (!cell) continue;
				const P = planesFor(sq, app.heightM);
				const v = P[L][cell.r * sq.n + cell.c];
				heat = v === 255 ? null : L === 'night' ? v : L === 'slope' ? v / 4 : v / 2;
				sqInfo = { h: P.heightM, fast: sq.kind === 'fast' };
				break;
			}
			if (!sqInfo) {
				const hm = app.heatShown;
				if (L === 'slope') {
					const e = 0.04;
					const gx = (eng.hf.heightM(hit.mx + e, hit.my) - eng.hf.heightM(hit.mx - e, hit.my)) / (2 * e * 1000);
					const gy = (eng.hf.heightM(hit.mx, hit.my + e) - eng.hf.heightM(hit.mx, hit.my - e)) / (2 * e * 1000);
					heat = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
				} else if (hm) {
					const col = Math.floor((hit.mx + hm.half_km) / hm.cell_km);
					const row = Math.floor((hm.half_km - hit.my) / hm.cell_km);
					if (col >= 0 && row >= 0 && col < hm.n && row < hm.n) {
						const v = hm[L][row * hm.n + col];
						heat = v === 255 ? null : L === 'night' ? v : v / 2;
					}
				}
			}
		}
		const r = host.getBoundingClientRect();
		return { x: clientX - r.left, y: clientY - r.top, lat, lon, elev, heat, sq: sqInfo };
	}

	function onPointerDown(e: PointerEvent) {
		// a primary pointer starts a new gesture: drop any pointer whose "up" we missed
		if (e.isPrimary) activePointers.clear();
		activePointers.add(e.pointerId);
		if (activePointers.size > 1) {
			multiTouch = true;
			down = null;
			hover = null;
			return;
		}
		if (e.button !== 0) return;
		multiTouch = false;
		down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
		hover = null;
	}

	function onPointerMove(e: PointerEvent) {
		if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) dragging = true;
		if (e.pointerType !== 'mouse' || dragging || e.buttons) {
			hover = null;
			return;
		}
		hoverAt = { x: e.clientX, y: e.clientY };
		if (!hoverRaf)
			hoverRaf = requestAnimationFrame(() => {
				hoverRaf = 0;
				if (hoverAt && !dragging && engine && !engine.flying) hover = readout(hoverAt.x, hoverAt.y);
			});
	}

	function onPointerUp(e: PointerEvent) {
		activePointers.delete(e.pointerId);
		if (multiTouch) {
			if (activePointers.size === 0) multiTouch = false;
			down = null;
			dragging = false;
			return;
		}
		const d = down;
		down = null;
		const wasDrag = dragging;
		dragging = false;
		if (!d || wasDrag || e.pointerId !== d.id) return;
		if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 700) return;
		analyseAt(e.clientX, e.clientY);
	}

	function analyseAt(clientX: number, clientY: number) {
		const eng = engine;
		if (!eng || app.pointBusy) return;
		const hit = eng.pick(clientX, clientY);
		if (!hit) return;
		const r = host.getBoundingClientRect();
		const id = ++rippleId;
		ripples = [...ripples, { id, x: clientX - r.left, y: clientY - r.top }];
		setTimeout(() => (ripples = ripples.filter((q) => q.id !== id)), 1100);
		const [lat, lon] = xyToLatLon(hit.mx * 1000, hit.my * 1000);
		pending = hit.p;
		hover = null;
		app.addCustomPoint(lat, lon, app.pickSlot);
		eng.invalidate();
	}

	function onLeave() {
		hover = null;
		hoverAt = null;
	}

	function onWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && mobile && panelOpen) {
			panelOpen = false;
			e.preventDefault();
		}
	}

	function onKey(e: KeyboardEvent) {
		if (!engine || e.target !== host) return;
		if (e.key === '+' || e.key === '=') engine.zoomBy(0.7);
		else if (e.key === '-' || e.key === '_') engine.zoomBy(1.4);
		else if (e.key === '0' || e.key === 'Home') recentre();
		else return;
		e.preventDefault();
	}

	// error toast auto-dismiss
	$effect(() => {
		if (!app.pointError) return;
		const id = setTimeout(() => (app.pointError = null), 8000);
		return () => clearTimeout(id);
	});
	$effect(() => {
		if (!app.pointBusy) pending = null;
	});

	function setHeat(l: HeatLayer) {
		if (l !== 'off' && l !== 'slope' && !heatReady) return;
		app.heatLayer = l;
	}

	function fmtLat(v: number) {
		return t.lat(fmtNum(Math.abs(v), 3));
	}
	function fmtLon(v: number) {
		return t.lon(fmtNum(v, 2));
	}
	function heatFmt(v: number) {
		if (app.heatLayer === 'slope') return `${fmtNum(v, 1)}°`;
		if (app.heatLayer !== 'night') return `${fmtNum(v, v < 10 ? 1 : 0)} %`;
		// night plane: 254 = no sunlight in the whole period, 253 = 253 days or more (see pipeline/heatmap.py)
		if (v === 254) return t.allDark;
		return `${v === 253 ? t.atLeast : ''}${fmtNum(v)} ${t.days}`;
	}
	const legendKey = $derived((app.heatLayer === 'off' ? 'sun' : app.heatLayer) as RampLayer);
	const heatTint: Record<HeatLayer, string> = {
		off: 'rgba(255,255,255,0.14)',
		sun: 'var(--sun)',
		earth: 'var(--earth)',
		night: '#8f7fd6',
		slope: '#7fe0b0'
	};
	function analyseBest(slot: 0 | 1) {
		const b = slot === 0 ? app.bestA : app.bestB;
		if (!b || app.pointBusy) return;
		app.addCustomPoint(b.lat, b.lon, slot === 0 ? 'A' : 'B');
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="scene" class:planner={app.mode === 'planner'} class:intro={!introDone}>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="gl"
		class:dragging
		bind:this={host}
		tabindex="0"
		role="application"
		aria-label={t.region}
		aria-describedby="scene3d-help"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={(e) => {
			activePointers.delete(e.pointerId);
			if (activePointers.size === 0) multiTouch = false;
			down = null;
			dragging = false;
		}}
		onpointerleave={onLeave}
		onkeydown={onKey}
	></div>
	<p id="scene3d-help" class="sr-only">{t.regionHelp}</p>

	<!-- site markers (projected every rendered frame) -->
	<div class="markers" aria-label={t.site}>
		{#each app.allSites as s, i (s.id)}
			{@const slot = s.id === app.siteA?.id ? 'A' : s.id === app.siteB?.id ? 'B' : null}
			<button
				class="marker"
				class:a={slot === 'A'}
				class:b={slot === 'B'}
				class:revealed={introDone}
				class:settled
				data-state="hidden"
				style="--cat: {CAT_COLOR[s.category]}; --delay: {Math.min(i, 16) * 45}ms"
				use:track={s.id}
				aria-label="{slot ? `${slot}: ` : ''}{s.name[app.lang]} — {cm.categories[s.category]}"
				aria-pressed={slot !== null}
				onclick={() => app.selectSite(s.id, app.pickSlot)}
			>
				<span class="ring" aria-hidden="true"></span>
				{#if slot}<span class="ring r2" aria-hidden="true"></span>{/if}
				<span class="dot" aria-hidden="true"></span>
				<span class="tag" aria-hidden="true">
					{#if slot}<b class="slot">{slot}</b>{/if}
					<span class="name">{s.name[app.lang]}</span>
					<span class="cat">{cm.categories[s.category]}</span>
				</span>
			</button>
		{/each}

		<!-- best landing spot inside each detail square (visible with a heat layer) -->
		{#each [app.bestA, app.bestB] as b, k (k)}
			{#if b && introDone && app.heatLayer !== 'off'}
				<button
					class="best"
					class:b={k === 1}
					data-state="hidden"
					bind:this={bestEls[k]}
					aria-label={t.bestAria(`${fmtNum(b.sunPct, 1)} %`, `${fmtNum(b.slopeDeg, 1)}°`)}
					title={t.bestAria(`${fmtNum(b.sunPct, 1)} %`, `${fmtNum(b.slopeDeg, 1)}°`)}
					onclick={() => analyseBest(k as 0 | 1)}
				>
					<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 17l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z" /></svg>
					<span class="btag" aria-hidden="true">{t.best} · <b class="num">{fmtNum(b.sunPct, 1)} %</b></span>
				</button>
			{/if}
		{/each}

		{#if app.pointBusy}
			<div class="pending" bind:this={pendingEl} transition:scale={{ duration: 260, start: 0.6 }} role="status">
				<span class="spin" aria-hidden="true"></span>
				<span class="ptag">{t.busy}…</span>
			</div>
		{/if}
		{#each ripples as r (r.id)}
			<span class="ripple" style="left: {r.x}px; top: {r.y}px" aria-hidden="true"></span>
		{/each}
	</div>

	<!-- hover readout -->
	{#if hover && !app.pointBusy}
		<div
			class="readout glass"
			style="--x: {hover.x}px; --y: {hover.y}px"
			class:flip={hover.x > (host?.clientWidth ?? 0) - 260}
			aria-hidden="true"
			transition:fade={{ duration: 120 }}
		>
			<div class="coord mono">{fmtLat(hover.lat)} · {fmtLon(hover.lon)}</div>
			<div class="row"><span>{t.elev}</span><b class="num">{fmtNum(hover.elev)} m</b></div>
			{#if app.heatLayer !== 'off' && (app.heatShown || hover.sq || app.heatLayer === 'slope')}
				<div class="row" style="--tint: {heatTint[app.heatLayer]}">
					<span><i class="sw"></i>{t.legend[legendKey].title}</span>
					<b class="num">{hover.heat === null ? '—' : heatFmt(hover.heat)}</b>
				</div>
				{#if hover.sq}
					<div class="meta">
						{hover.sq.fast ? t.sqFast(hover.sq.h) : t.detail}{#if app.heatLayer !== 'slope'} · {t.heightLine(hover.sq.h)} · {anySquare ? sqPeriod(anySquare) : ''}{/if}
					</div>
				{:else if app.heatLayer === 'slope'}
					<div class="meta">{t.slopeApprox}</div>
				{:else if app.heatShown}
					<div class="meta">{t.heightLine(app.heatShown.observer_height_m)} · {heatPeriod}</div>
				{/if}
			{/if}
			<div class="hint">{t.clickA(slotLabel)}</div>
		</div>
	{/if}

	<!-- controls -->
	{#if introDone || noGl}
		<div class="controls-wrap" in:fly={{ x: -18, duration: 600, easing: cubicOut }}>
			{#if mobile}
				<button
					class="fab glass"
					class:on={panelOpen}
					aria-expanded={panelOpen}
					aria-controls="scene3d-controls"
					aria-label={panelOpen ? t.close : t.layers}
					onclick={() => (panelOpen = !panelOpen)}
				>
					<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
						{#if panelOpen}
							<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none" />
						{:else}
							<path d="M12 3l9 5-9 5-9-5 9-5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
							<path d="M3 13l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
						{/if}
					</svg>
				</button>
			{/if}
			{#if panelOpen || !mobile}
				<div
					id="scene3d-controls"
					class="controls glass"
					transition:scale={{ duration: mobile ? 280 : 0, start: 0.92, easing: backOut, opacity: 0 }}
				>
					<div class="group">
						<div class="glabel label" id="heat-label">{t.heat}</div>
						<div
							class="seg five"
							role="group"
							aria-labelledby="heat-label"
							style="--i: {heatIndex}; --tint: {heatTint[app.heatLayer]}"
						>
							<span class="thumb" aria-hidden="true"></span>
							{#each HEAT_ORDER as l (l)}
								<button
									aria-pressed={app.heatLayer === l}
									class:active={app.heatLayer === l}
									disabled={l !== 'off' && l !== 'slope' && !heatReady}
									title={l !== 'off' && l !== 'slope' && !heatReady ? t.noHeat : undefined}
									onclick={() => setHeat(l)}
								>
									{#if l !== 'off'}<i class="chip {l}" aria-hidden="true"></i>{/if}
									{t[l]}
								</button>
							{/each}
						</div>
						{#if !heatReady}<div class="note">{t.noHeat}</div>{/if}
						{#if app.heatmapMax && app.heatLayer !== 'off' && app.heatLayer !== 'slope'}
							<div class="agg" transition:slide={{ duration: 260, easing: cubicOut }}>
								<span class="sub" id="agg-label">{t.aggLabel}</span>
								<div class="seg two" role="group" aria-labelledby="agg-label" style="--i: {app.heatAggregate === 'max' ? 1 : 0}">
									<span class="thumb" aria-hidden="true"></span>
									{#each ['centre', 'max'] as const as g (g)}
										<button aria-pressed={app.heatAggregate === g} class:active={app.heatAggregate === g} onclick={() => (app.heatAggregate = g)}>
											{g === 'centre' ? t.aggCentre : t.aggMax}
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<div class="group">
						<div class="glabel" id="vscale-label">
							<span class="label">{t.vscale(app.exaggeration)}</span>
							<span class="sub">{t.vscaleNote}</span>
						</div>
						<div class="row2">
							<div class="seg three" role="group" aria-labelledby="vscale-label" style="--i: {exagIndex}">
								<span class="thumb" aria-hidden="true"></span>
								{#each EXAGS as x (x)}
									<button
										aria-pressed={app.exaggeration === x}
										aria-label={t.vscale(x)}
										class:active={app.exaggeration === x}
										onclick={() => (app.exaggeration = x)}
									>
										<span class="num">×{x}</span>
									</button>
								{/each}
							</div>
							<div class="cam">
								<button class="icon" aria-label={t.zoomIn} title={t.zoomIn} onclick={() => engine?.zoomBy(0.65)}>
									<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
								</button>
								<button class="icon" aria-label={t.zoomOut} title={t.zoomOut} onclick={() => engine?.zoomBy(1.5)}>
									<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
								</button>
								<button class="icon" aria-label={t.recentre} title={t.recentre} onclick={recentre}>
									<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
										<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6" />
										<path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
									</svg>
								</button>
							</div>
						</div>
					</div>

					<div class="pick" class:b={app.pickSlot === 'B'}>
						<span class="pslot">{slotLabel}</span>
						{coarse ? t.pickHintTouch(slotLabel) : t.pickHint(slotLabel)}
					</div>

					{#if app.mode === 'teacher' && app.heatLayer === 'off'}
						<p class="why" transition:fade={{ duration: 200 }}>{t.why.shadows}</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- heat map legend -->
	{#if introDone && app.heatLayer !== 'off' && (app.heatShown || anySquare || app.heatLayer === 'slope') && (!mobile || !panelOpen)}
		{@const hm = app.heatShown}
		{@const sq = anySquare}
		<div class="legend glass" transition:fly={{ y: 14, duration: 420, easing: cubicOut }} role="note">
			<div class="lhead" style="--tint: {heatTint[app.heatLayer]}">
				<i class="sw"></i>
				<span class="ltitle">{t.legend[legendKey].title}</span>
			</div>
			<div class="lwhat">
				{legendKey === 'earth'
					? t.legend.earth.what(sq?.marginDeg ?? hm?.earth_margin_deg ?? app.earthMarginDeg)
					: t.legend[legendKey === 'sun' ? 'sun' : legendKey === 'slope' ? 'slope' : 'night'].what}
			</div>
			<div class="bar" style="background: {rampCss(legendKey)}">
				{#if legendKey === 'slope'}
					<span class="limit" style="left: {slopeT(app.maxSlopeDeg) * 100}%" aria-hidden="true"></span>
				{/if}
			</div>
			<div class="ticks mono">
				{#each legendTicks as tk (tk.label)}
					<span style="left: {tk.pos}%">{tk.label}</span>
				{/each}
			</div>
			{#if legendKey === 'slope'}
				<div class="lmeta">{t.slopeSrc}</div>
				<div class="lmeta">{t.slopeLimit(app.maxSlopeDeg)}</div>
			{:else}
				{#if sq}
					{@const shown = nearestHeight(sq, app.heightM)}
					<div class="lsq">
						<i class="sqi" aria-hidden="true"></i>
						<div>
							<div class="lmeta">{sq.kind === 'fast' ? t.sqFast(shown) : t.sqLine(sqPeriod(sq))}</div>
							<div class={shown === app.heightM ? 'lmeta' : 'lnote keep'}>
								{shown === app.heightM ? t.heightLine(shown) : t.sqHeight(shown, app.heightM)}
							</div>
						</div>
					</div>
				{/if}
				{#if hm}
					<div class="lmeta">{t.heightLine(hm.observer_height_m)} · {heatPeriod}</div>
					<div class="lmeta ovcells">{t.cellLine(hm.cell_km)}{app.heatmapMax ? ` · ${t.aggLine[app.heatShown === app.heatmapMax ? 'max' : 'centre']}` : ''}</div>
					{#if app.heightM !== hm.observer_height_m}
						<div class="lnote">{t.mismatch(hm.observer_height_m)}</div>
					{/if}
				{/if}
			{/if}
			{#if app.mode === 'teacher'}
				<p class="why">{t.why[legendKey]}</p>
			{/if}
		</div>
	{/if}

	<!-- point error -->
	{#if app.pointError}
		<div class="toast glass" role="alert" transition:fly={{ y: -12, duration: 360, easing: cubicOut }}>
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
				<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" />
				<path d="M12 7.5v5.5M12 16.2v.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
			</svg>
			<div>
				<b>{t.errTitle}</b>
				<span>{app.pointError}</span>
			</div>
			<button class="x" aria-label={t.dismiss} onclick={() => (app.pointError = null)}>
				<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
			</button>
		</div>
	{/if}

	{#if lost}
		<div class="center glass" role="status" transition:fade={{ duration: 200 }}>
			<span class="spin" aria-hidden="true"></span>{t.lost}
		</div>
	{/if}
	{#if noGl}
		<div class="center glass" role="alert">
			<p>{t.noGl}</p>
			<button class="cta" onclick={() => (app.view = 'panorama')}>{t.openPano}</button>
		</div>
	{/if}
</div>

<style>
	.scene {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #020306;
		user-select: none;
		-webkit-user-select: none;
	}
	.gl {
		position: absolute;
		inset: 0;
		cursor: crosshair;
		touch-action: none;
		outline: none;
	}
	.gl.dragging {
		cursor: grabbing;
	}
	.gl:focus-visible {
		box-shadow: inset 0 0 0 2px var(--earth);
		border-radius: 0;
	}
	.gl :global(canvas.scene-canvas) {
		position: absolute;
		inset: 0;
		display: block;
	}

	/* ---------- markers */
	.markers {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
	}
	.marker {
		--k: 1;
		--c: var(--cat);
		position: absolute;
		left: 0;
		top: 0;
		width: 0;
		height: 0;
		pointer-events: auto;
		opacity: 0;
		transition: opacity var(--dur) var(--ease-out);
		will-change: transform;
	}
	.marker.revealed:global([data-state='visible']) {
		opacity: 1;
		transition-delay: var(--delay);
	}
	.marker.revealed.settled:global([data-state='visible']) {
		transition-delay: 0ms;
	}
	.marker.revealed:global([data-state='occluded']) {
		opacity: 0.32;
	}
	.marker:global([data-state='hidden']) {
		opacity: 0 !important;
		pointer-events: none;
		transition-delay: 0ms;
	}
	/* generous invisible hit area */
	.marker::before {
		content: '';
		position: absolute;
		left: -18px;
		top: -18px;
		width: 36px;
		height: 36px;
		border-radius: 50%;
	}
	.dot {
		position: absolute;
		left: 0;
		top: 0;
		width: 10px;
		height: 10px;
		margin: -5px 0 0 -5px;
		border-radius: 50%;
		background: var(--c);
		box-shadow:
			0 0 0 2px rgba(4, 6, 10, 0.85),
			0 0 12px 2px color-mix(in srgb, var(--c) 55%, transparent);
		transform: scale(var(--k));
		transition: transform var(--dur) var(--ease-spring), background var(--dur) var(--ease-out);
	}
	.marker:hover .dot,
	.marker:focus-visible .dot {
		transform: scale(calc(var(--k) * 1.35));
	}
	.marker:focus-visible {
		outline: none;
	}
	.marker:focus-visible .ring {
		opacity: 1;
		border-color: var(--earth);
	}
	.ring {
		position: absolute;
		left: 0;
		top: 0;
		width: 26px;
		height: 26px;
		margin: -13px 0 0 -13px;
		border-radius: 50%;
		border: 1.5px solid var(--c);
		opacity: 0;
		transform: scale(calc(var(--k) * 0.6));
		transition: opacity var(--dur) var(--ease-out), transform var(--dur) var(--ease-spring);
	}
	.marker:hover .ring {
		opacity: 0.6;
		transform: scale(var(--k));
	}
	.marker.a {
		--c: var(--site-a);
	}
	.marker.b {
		--c: var(--site-b);
	}
	.marker.a .dot,
	.marker.b .dot {
		width: 12px;
		height: 12px;
		margin: -6px 0 0 -6px;
	}
	.marker.a .ring,
	.marker.b .ring {
		opacity: 0;
		animation: pulse 2.6s var(--ease-out) infinite;
	}
	.marker.a .ring.r2,
	.marker.b .ring.r2 {
		animation-delay: 1.3s;
	}
	@keyframes pulse {
		0% {
			opacity: 0.85;
			transform: scale(calc(var(--k) * 0.45));
		}
		100% {
			opacity: 0;
			transform: scale(calc(var(--k) * 2.1));
		}
	}

	.tag {
		position: absolute;
		left: 14px;
		top: 0;
		transform: translate(0, -50%) translateX(-4px);
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 5px 10px 5px 6px;
		white-space: nowrap;
		border-radius: var(--radius-pill);
		background: rgba(8, 11, 18, 0.78);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid var(--glass-border);
		font-size: 12px;
		line-height: 1.2;
		color: var(--text);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur) var(--ease-out);
	}
	.tag .cat {
		color: var(--text-3);
		font-size: 11px;
		display: none;
	}
	.marker:hover .tag,
	.marker:focus-visible .tag {
		opacity: 1;
		transform: translate(0, -50%);
	}
	.marker:hover .tag .cat,
	.marker:focus-visible .tag .cat {
		display: inline;
	}
	.marker.a .tag,
	.marker.b .tag {
		opacity: 1;
		transform: translate(0, -50%);
		border-color: color-mix(in srgb, var(--c) 35%, transparent);
	}
	.marker.a:global([data-state='occluded']) .tag,
	.marker.b:global([data-state='occluded']) .tag {
		opacity: 0.9;
	}
	.slot {
		display: inline-grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--c);
		color: #05070c;
		font: 700 11px/1 var(--font-display);
	}
	.marker:not(.a):not(.b) .tag {
		padding-left: 10px;
	}
	.marker:global(.flip) .tag {
		left: auto;
		right: 14px;
		flex-direction: row-reverse;
		padding: 5px 6px 5px 10px;
		transform: translate(0, -50%) translateX(4px);
	}
	.marker:global(.flip):hover .tag,
	.marker:global(.flip):focus-visible .tag,
	.marker.a:global(.flip) .tag,
	.marker.b:global(.flip) .tag {
		transform: translate(0, -50%);
	}

	.pending {
		position: absolute;
		left: 0;
		top: 0;
		width: 0;
		height: 0;
	}
	.pending .spin {
		position: absolute;
		left: -14px;
		top: -14px;
		width: 28px;
		height: 28px;
	}
	.ptag {
		position: absolute;
		left: 22px;
		top: 0;
		transform: translateY(-50%);
		white-space: nowrap;
		font-size: 12px;
		color: var(--text-2);
		padding: 5px 10px;
		border-radius: var(--radius-pill);
		background: rgba(8, 11, 18, 0.78);
		border: 1px solid var(--glass-border);
	}
	.spin {
		display: inline-block;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.14);
		border-top-color: var(--earth);
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.ripple {
		position: absolute;
		width: 0;
		height: 0;
	}
	.ripple::before,
	.ripple::after {
		content: '';
		position: absolute;
		left: -30px;
		top: -30px;
		width: 60px;
		height: 60px;
		border-radius: 50%;
		border: 1.5px solid var(--earth-soft);
		animation: ripple 1s var(--ease-out) forwards;
	}
	.ripple::after {
		animation-delay: 0.14s;
		border-color: rgba(255, 255, 255, 0.5);
	}
	@keyframes ripple {
		from {
			opacity: 0.9;
			transform: scale(0.1);
		}
		to {
			opacity: 0;
			transform: scale(1.4);
		}
	}

	/* ---------- hover readout */
	.readout {
		position: absolute;
		left: 0;
		top: 0;
		transform: translate(calc(var(--x) + 18px), calc(var(--y) + 18px));
		z-index: 4;
		min-width: 210px;
		padding: 10px 12px;
		font-size: 12px;
		pointer-events: none;
		border-radius: var(--radius-sm);
	}
	.readout.flip {
		transform: translate(calc(var(--x) - 100% - 18px), calc(var(--y) + 18px));
	}
	.readout .coord {
		font-size: 11.5px;
		color: var(--text);
		margin-bottom: 6px;
	}
	.readout .row {
		display: flex;
		justify-content: space-between;
		gap: 14px;
		color: var(--text-2);
		line-height: 1.7;
	}
	.readout .row b {
		color: var(--text);
		font-weight: 600;
		font-size: 13px;
	}
	.readout .meta {
		font-size: 11px;
		color: var(--text-3);
	}
	.readout .hint {
		margin-top: 6px;
		padding-top: 6px;
		border-top: 1px solid var(--hairline);
		color: var(--text-3);
		font-size: 11px;
	}
	.sw {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 6px;
		background: var(--tint);
		box-shadow: 0 0 8px var(--tint);
		vertical-align: 1px;
	}

	/* ---------- controls */
	.controls-wrap {
		position: absolute;
		z-index: 5;
		left: var(--gutter);
		top: calc(var(--topbar-h) + var(--gutter) * 2);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		max-width: calc(100% - var(--gutter) * 2);
	}
	.controls {
		width: 318px;
		max-width: 100%;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		transform-origin: top left;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.glabel {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 8px;
	}
	.glabel .sub {
		font-size: 11px;
		color: var(--text-3);
	}
	.note {
		font-size: 11px;
		color: var(--text-3);
	}
	.seg {
		--n: 4;
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--n), 1fr);
		padding: 3px;
		border-radius: var(--radius-pill);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--hairline);
		isolation: isolate;
	}
	.seg.three {
		--n: 3;
		flex: 1;
	}
	.seg .thumb {
		position: absolute;
		z-index: -1;
		top: 3px;
		bottom: 3px;
		left: 3px;
		width: calc((100% - 6px) / var(--n));
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--tint, #fff) 22%, rgba(255, 255, 255, 0.06));
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, var(--tint, #fff) 45%, transparent),
			0 4px 18px color-mix(in srgb, var(--tint, #fff) 18%, transparent);
		transform: translateX(calc(var(--i) * 100%));
		transition:
			transform 520ms var(--ease-spring),
			background var(--dur) var(--ease-out),
			box-shadow var(--dur) var(--ease-out);
	}
	.seg.three .thumb {
		--tint: rgba(255, 255, 255, 0.5);
	}
	.seg button {
		position: relative;
		height: 32px;
		padding: 0 6px;
		border-radius: var(--radius-pill);
		font-size: 12.5px;
		color: var(--text-2);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		white-space: nowrap;
		transition: color var(--dur-fast) var(--ease-out);
	}
	.seg button:hover:not(:disabled) {
		color: var(--text);
	}
	.seg button.active {
		color: var(--text);
		font-weight: 600;
	}
	.seg button:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}
	.chip {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex: none;
	}
	.chip.sun {
		background: var(--sun);
	}
	.chip.earth {
		background: var(--earth);
	}
	.chip.night {
		background: #8f7fd6;
	}
	.row2 {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.cam {
		display: flex;
		gap: 4px;
	}
	.icon {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: var(--text-2);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--hairline);
		transition:
			color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out),
			transform var(--dur) var(--ease-spring);
	}
	.icon:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.09);
	}
	.icon:active {
		transform: scale(0.9);
	}
	.pick {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--text-2);
		padding-top: 12px;
		border-top: 1px solid var(--hairline);
	}
	.pslot {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--site-a);
		color: #05070c;
		font: 700 11px/1 var(--font-display);
		transition: background var(--dur) var(--ease-out);
	}
	.pick.b .pslot {
		background: var(--site-b);
	}
	.why {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-2);
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: rgba(92, 200, 255, 0.06);
		border: 1px solid rgba(92, 200, 255, 0.14);
	}
	.fab {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: var(--text);
		transition: transform var(--dur) var(--ease-spring);
	}
	.fab:active {
		transform: scale(0.92);
	}

	/* ---------- legend */
	.legend {
		position: absolute;
		z-index: 5;
		left: var(--gutter);
		bottom: calc(var(--timeline-h) + var(--gutter) * 2);
		width: 318px;
		padding: 12px 14px 12px;
		transition: bottom var(--dur-slow) var(--ease-out);
	}
	.scene.planner .legend {
		bottom: calc(var(--timeline-h) + min(300px, 34vh) + var(--gutter) * 3);
	}
	.lhead {
		display: flex;
		align-items: center;
	}
	.ltitle {
		font: 600 13px/1.2 var(--font-display);
		letter-spacing: 0.01em;
	}
	.lwhat {
		font-size: 11.5px;
		color: var(--text-2);
		margin: 3px 0 10px;
	}
	.bar {
		position: relative;
		height: 10px;
		border-radius: var(--radius-pill);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
	}
	.ticks {
		position: relative;
		height: 18px;
		margin: 3px 6px 0;
		font-size: 10px;
		color: var(--text-3);
	}
	.ticks span {
		position: absolute;
		top: 2px;
		transform: translateX(-50%);
		white-space: nowrap;
	}
	.lmeta {
		font-size: 11px;
		color: var(--text-2);
		margin-top: 4px;
	}
	.lnote {
		font-size: 11px;
		color: var(--warning);
		margin-top: 4px;
	}
	.legend .why {
		margin-top: 10px;
	}

	.seg.five {
		--n: 5;
	}
	.seg.five button {
		padding: 0 2px;
		gap: 4px;
		font-size: 12px;
	}
	.seg.two {
		--n: 2;
		flex: 1;
	}
	.seg.two .thumb {
		--tint: rgba(255, 255, 255, 0.45);
	}
	.seg.two button {
		height: 28px;
		font-size: 11.5px;
	}
	.agg {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.agg .sub {
		font-size: 11px;
		color: var(--text-3);
		flex: none;
		max-width: 92px;
		line-height: 1.25;
	}
	.chip.slope {
		background: #7fe0b0;
	}
	.bar .limit {
		position: absolute;
		top: -4px;
		bottom: -4px;
		width: 2px;
		margin-left: -1px;
		border-radius: 1px;
		background: #fff;
		box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
		transition: left var(--dur) var(--ease-out);
	}
	.lsq {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		margin-top: 6px;
		margin-bottom: 2px;
		padding: 7px 9px;
		border-radius: var(--radius-sm);
		background: rgba(255, 240, 220, 0.04);
		border: 1px solid rgba(255, 240, 220, 0.12);
		animation: lsq-in 600ms var(--ease-out) both;
	}
	.lsq .lmeta,
	.lsq .lnote {
		margin-top: 0;
	}
	.sqi {
		flex: none;
		width: 12px;
		height: 12px;
		margin-top: 2px;
		border-radius: 2px;
		border: 1.5px solid #ffeed8;
		box-shadow: 0 0 8px rgba(255, 238, 216, 0.6);
		background:
			linear-gradient(rgba(255, 238, 216, 0.35) 1px, transparent 1px) 0 0 / 4px 4px,
			linear-gradient(90deg, rgba(255, 238, 216, 0.35) 1px, transparent 1px) 0 0 / 4px 4px;
	}
	@keyframes lsq-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	/* ---------- best landing spot marker */
	.best {
		position: absolute;
		left: 0;
		top: 0;
		width: 0;
		height: 0;
		padding: 0;
		border: 0;
		background: none;
		z-index: 9000;
		color: #9fffc8;
		transition: opacity var(--dur) var(--ease-out);
	}
	.best:global([data-state='hidden']) {
		opacity: 0;
		pointer-events: none;
	}
	.best:global([data-state='occluded']) {
		opacity: 0.35;
	}
	.best .star {
		position: absolute;
		left: -11px;
		top: -11px;
		width: 22px;
		height: 22px;
		fill: currentColor;
		stroke: #05261a;
		stroke-width: 1.2;
		transform: scale(var(--k, 1));
		filter: drop-shadow(0 0 6px rgba(120, 255, 180, 0.75));
		animation:
			best-in 700ms var(--ease-spring) both,
			best-pulse 2.4s var(--ease-in-out) 700ms infinite;
		transition: transform var(--dur) var(--ease-spring);
		cursor: pointer;
		pointer-events: auto;
	}
	.best:hover .star,
	.best:focus-visible .star {
		transform: scale(calc(var(--k, 1) * 1.25));
	}
	.best.b {
		color: #e2c8ff;
	}
	.btag {
		position: absolute;
		left: 16px;
		top: 0;
		transform: translateY(-50%);
		white-space: nowrap;
		font-size: 11.5px;
		color: var(--text-2);
		padding: 4px 9px;
		border-radius: var(--radius-pill);
		background: rgba(8, 11, 18, 0.8);
		border: 1px solid rgba(159, 255, 200, 0.28);
		opacity: 0;
		translate: -4px 0;
		transition:
			opacity var(--dur-fast) var(--ease-out),
			translate var(--dur) var(--ease-out);
		pointer-events: none;
	}
	.btag b {
		color: var(--text);
	}
	.best:hover .btag,
	.best:focus-visible .btag {
		opacity: 1;
		translate: 0 0;
	}
	@keyframes best-in {
		from {
			scale: 0.2;
			rotate: -90deg;
			opacity: 0;
		}
	}
	@keyframes best-pulse {
		50% {
			filter: drop-shadow(0 0 12px rgba(120, 255, 180, 0.95));
		}
	}

	/* ---------- toast / centre messages */
	.toast {
		position: absolute;
		z-index: 6;
		left: 50%;
		top: calc(var(--topbar-h) + var(--gutter) * 2);
		translate: -50% 0;
		display: flex;
		align-items: flex-start;
		gap: 10px;
		max-width: min(440px, calc(100% - var(--gutter) * 2));
		padding: 12px 12px 12px 14px;
		color: var(--danger);
		border-color: rgba(255, 107, 107, 0.3);
	}
	.toast div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12.5px;
	}
	.toast b {
		color: var(--text);
		font-weight: 600;
	}
	.toast span {
		color: var(--text-2);
	}
	.toast .x {
		color: var(--text-3);
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		flex: none;
	}
	.toast .x:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.06);
	}
	.center {
		position: absolute;
		z-index: 7;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 18px 22px;
		max-width: min(380px, calc(100% - 32px));
		text-align: center;
		font-size: 13px;
		color: var(--text-2);
	}
	.center p {
		margin: 0;
	}
	.cta {
		padding: 9px 16px;
		border-radius: var(--radius-pill);
		background: var(--earth-dim);
		color: var(--text);
		border: 1px solid rgba(92, 200, 255, 0.35);
	}

	@media (max-width: 767px) {
		.controls-wrap {
			top: calc(var(--topbar-h) + var(--timeline-h) + var(--gutter) * 3);
		}
		.controls {
			width: min(318px, calc(100vw - var(--gutter) * 2));
		}
		.legend {
			left: calc(var(--gutter) * 2 + 44px);
			bottom: auto;
			top: calc(var(--topbar-h) + var(--timeline-h) + var(--gutter) * 3);
			width: min(280px, calc(100vw - 44px - var(--gutter) * 3));
			padding: 10px 12px;
		}
		.scene.planner .legend {
			bottom: auto;
		}
		.legend .why,
		.lnote:not(.keep) {
			display: none;
		}
		.legend .ovcells {
			display: none;
		}
		.lsq {
			padding: 5px 8px;
		}
		.toast {
			top: calc(var(--topbar-h) + var(--timeline-h) + var(--gutter) * 3);
		}
		.tag {
			font-size: 11px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.best .star {
			animation: none;
		}
		.marker.a .ring,
		.marker.b .ring {
			animation: none;
			opacity: 0.6;
			transform: scale(var(--k));
		}
	}
</style>
