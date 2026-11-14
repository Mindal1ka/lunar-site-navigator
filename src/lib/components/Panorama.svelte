<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!--
	Fullscreen 360° panorama from site A (site B as an outline): the real LOLA horizon,
	the Sun path over the current lunar day, Earth's libration loop over the selected
	period, the Sun / Earth disks occluded by the terrain. All numbers come from the
	engine (instantAt / computeSeries); this component only draws and interacts.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { app } from '#lib/state.svelte.ts';
	import { COMMON, fmtDate, fmtDateTime, fmtMonthYear, fmtNum } from '#lib/i18n.ts';
	import { computeSeries, ephemAt, instantAt, siteRadius, timeOf, type Instant } from '#lib/engine/visibility.ts';
	import { PanoramaRenderer, type Labels, type LoopData, type PathData, type Viewport } from '#lib/panorama/renderer.ts';
	import { Camera, MAX_FOV } from '#lib/panorama/camera.ts';
	import { approach, clamp, easeOutQuart, minMax, niceScale, wrapDelta } from '#lib/panorama/util.ts';

	const EARTH_R_KM = 6371;
	/** half-width of the Sun path: about half a synodic month (hours) */
	const PATH_HALF_H = 354;

	const T = {
		en: {
			roledesc: '360° panorama',
			toolbar: 'Panorama controls',
			aria: 'Interactive 360 degree view of the horizon from the selected site. Arrow keys look around, plus and minus zoom, S centres the Sun, E the Earth, 0 shows all 360 degrees. Hover or tap to read the horizon height.',
			title: '360° view from',
			time: 'Time (UTC)',
			sunEl: 'Sun elevation',
			sunAz: 'Sun azimuth',
			sunVis: 'Sun disk visible',
			earthEl: 'Earth elevation',
			earthLink: 'Direct-to-Earth link',
			inView: 'Earth in view',
			hidden: 'Earth hidden',
			hiddenWhy: (m: string) => `below horizon + ${m}° antenna margin`,
			siteB: 'Site B',
			sunShort: 'Sun',
			earthShort: 'Earth',
			scale: (n: string) => `Vertical scale ×${n}`,
			scaleWhy: (n: string) =>
				`Angles above the horizon are stretched ${n}× so the low Sun and the hills are visible. Azimuth is not stretched.`,
			toSun: 'Look at the Sun',
			toEarth: 'Look at the Earth',
			all: 'Show all 360°',
			zoomIn: 'Zoom in',
			zoomOut: 'Zoom out',
			legend: 'Legend',
			sunPath: 'Sun path',
			sunPathPeriod: (a: string, b: string) => `±15 days: ${a} – ${b}`,
			full: 'full disk',
			partial: 'partly hidden',
			hiddenL: 'hidden',
			earthPath: 'Earth path (libration)',
			horizonA: 'Real horizon, site A',
			horizonB: 'Real horizon, site B',
			margin: (m: string) => `Antenna margin +${m}°`,
			earthNote: 'Earth disk enlarged for clarity; position is exact.',
			hint: 'Drag to look around · scroll or pinch to zoom',
			hintTouch: 'Drag to look around · pinch to zoom · tap to read the horizon',
			sky: 'No air: the sky stays black even in daylight',
			sunNote: 'Sun stays within a few degrees of the horizon at the pole',
			earthCall: 'Earth hangs almost still and wobbles (libration)',
			why: 'Angles are measured from a flat horizon (0°). Mountains above 0° hide the Sun and Earth earlier.',
			canvas: {
				sun: 'Sun',
				sunHidden: 'Sun hidden',
				sunPartial: (p: string) => `Sun ${p}% visible`,
				earth: 'Earth',
				earthHidden: 'Earth hidden',
				azimuth: 'Azimuth',
				horizon: 'Horizon',
				siteA: 'A',
				siteB: 'B',
				flat: 'flat horizon',
				cardinals: ['N', 'E', 'S', 'W'] as [string, string, string, string]
			}
		},
		uk: {
			roledesc: 'панорама 360°',
			toolbar: 'Керування панорамою',
			aria: 'Інтерактивний огляд горизонту на 360 градусів із вибраного місця. Стрілки — огляд, плюс і мінус — масштаб, S — до Сонця, E — до Землі, 0 — усі 360 градусів. Наведіть або торкніться, щоб побачити висоту горизонту.',
			title: 'Огляд 360° з місця',
			time: 'Час (UTC)',
			sunEl: 'Висота Сонця',
			sunAz: 'Азимут Сонця',
			sunVis: 'Видно диска Сонця',
			earthEl: 'Висота Землі',
			earthLink: 'Прямий зв’язок із Землею',
			inView: 'Земля видна',
			hidden: 'Земля не видна',
			hiddenWhy: (m: string) => `нижче горизонту + ${m}° запасу антени`,
			siteB: 'Місце B',
			sunShort: 'Сонце',
			earthShort: 'Земля',
			scale: (n: string) => `Вертикальний масштаб ×${n}`,
			scaleWhy: (n: string) =>
				`Кути над горизонтом розтягнуто ×${n}, щоб було видно низьке Сонце й пагорби. Азимут не розтягнуто.`,
			toSun: 'Подивитися на Сонце',
			toEarth: 'Подивитися на Землю',
			all: 'Показати всі 360°',
			zoomIn: 'Наблизити',
			zoomOut: 'Віддалити',
			legend: 'Легенда',
			sunPath: 'Шлях Сонця',
			sunPathPeriod: (a: string, b: string) => `±15 днів: ${a} – ${b}`,
			full: 'увесь диск',
			partial: 'частково закрите',
			hiddenL: 'закрите',
			earthPath: 'Шлях Землі (лібрація)',
			horizonA: 'Справжній горизонт, місце A',
			horizonB: 'Справжній горизонт, місце B',
			margin: (m: string) => `Запас антени +${m}°`,
			earthNote: 'Диск Землі збільшено для наочності; положення точне.',
			hint: 'Тягніть, щоб роззирнутися · колесо або щипок — масштаб',
			hintTouch: 'Тягніть, щоб роззирнутися · щипок — масштаб · дотик — висота горизонту',
			sky: 'Повітря немає: небо чорне навіть удень',
			sunNote: 'Біля полюса Сонце тримається лише за кілька градусів від горизонту',
			earthCall: 'Земля майже нерухомо висить у небі й погойдується (лібрація)',
			why: 'Кути відраховано від рівного горизонту (0°). Гори вище 0° раніше закривають Сонце й Землю.',
			canvas: {
				sun: 'Сонце',
				sunHidden: 'Сонце закрите',
				sunPartial: (p: string) => `Сонце видно на ${p} %`,
				earth: 'Земля',
				earthHidden: 'Землю не видно',
				azimuth: 'Азимут',
				horizon: 'Горизонт',
				siteA: 'A',
				siteB: 'B',
				flat: 'рівний горизонт',
				cardinals: ['Пн', 'Сх', 'Пд', 'Зх'] as [string, string, string, string]
			}
		}
	};
	const t = $derived(T[app.lang]);
	const cm = $derived(COMMON[app.lang]);

	// ------------------------------------------------------------------ reactive readout
	const profA = $derived(app.siteA?.horizons?.[app.heightIndex] ?? null);
	const profB = $derived(app.siteB?.horizons?.[app.heightIndex] ?? null);

	function instFor(site: typeof app.siteA | null, prof: Float32Array | null): Instant | null {
		const eph = app.eph;
		if (!eph || !site || !prof) return null;
		return instantAt(prof, site.lat, site.lon, siteRadius(site.elevation_m, app.heightM), eph, app.t, app.earthMarginDeg);
	}
	const instA = $derived(instFor(app.siteA, profA));
	const instB = $derived(instFor(app.siteB, profB));
	const now = $derived(app.eph ? timeOf(app.eph, app.t) : null);

	const sign = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${fmtNum(Math.abs(v), d)}°`;
	const pct = (v: number) => (app.lang === 'uk' ? `${fmtNum(v, 0)} %` : `${fmtNum(v, 0)}%`);

	const periodWin = $derived.by(() => {
		const eph = app.eph;
		if (!eph) return '';
		return `${fmtMonthYear(timeOf(eph, app.win.i0))} – ${fmtMonthYear(timeOf(eph, app.win.i1))}`;
	});
	// the Sun path period only changes once per day of the cursor (keeps the legend calm while playing)
	const tDay = $derived(Math.floor(app.t / 24));
	const periodPath = $derived.by(() => {
		const eph = app.eph;
		if (!eph) return '';
		const c = tDay * 24;
		const o = { day: 'numeric', month: 'short' } as const;
		return t.sunPathPeriod(fmtDate(timeOf(eph, c - PATH_HALF_H), o), fmtDate(timeOf(eph, c + PATH_HALF_H), { ...o, year: 'numeric' }));
	});
	const ariaSummary = $derived.by(() => {
		if (!instA || !now) return t.aria;
		const s = `${app.siteA?.name[app.lang] ?? ''}, ${fmtDateTime(now)}. ${t.sunEl} ${sign(instA.sunEl)}, ${t.sunVis} ${pct(Math.round(instA.sunFrac * 100))}. ${instA.earthVisible ? t.inView : t.hidden}.`;
		return `${t.aria} ${s}`;
	});

	// ------------------------------------------------------------------ UI state
	let scaleN = $state(1);
	let legendOpen = $state(true);
	let showHint = $state(true);
	let mounted = $state(false);
	let reduced = $state(false);
	/** touch-first device: the hint mentions tapping instead of the wheel */
	let coarse = $state(false);

	// ------------------------------------------------------------------ DOM refs
	let root: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let edgeSun: HTMLButtonElement | undefined = $state();
	let edgeEarth: HTMLButtonElement | undefined = $state();
	let callSun: HTMLDivElement | undefined = $state();
	let callEarth: HTMLDivElement | undefined = $state();
	let readoutEl: HTMLElement | undefined = $state();

	// ------------------------------------------------------------------ non-reactive render state
	const cam = new Camera();
	let renderer: PanoramaRenderer | null = null;
	let dispA: Float32Array | null = null;
	let dispB: Float32Array | null = null;
	let alphaB = 0;
	let rangeLo = -3;
	let rangeHi = 8;
	let earthTopEl = 5;
	let fovRef = 180;
	let readoutBox = { right: 0, bottom: 0 };
	let dockTop = 1e9;
	let dockEl: HTMLElement | undefined = $state();
	let loop: LoopData | null = null;
	let path: (PathData & { key: string; i0: number }) | null = null;
	let pathStart = 0;
	let introStart = 0;
	let scaleShown = 1;
	let elCenter = 2;
	let hover: { x: number; y: number } | null = null;
	let safe = { top: 80, bottom: 600, left: 0, right: 800 };
	let safeTarget = { ...safe };
	let lastMeasure = -1e9;
	let initialised = false;
	let vp: Viewport | null = null;
	let W = 0;
	let H = 0;
	let dpr = 1;
	/** bumped whenever scene data or labels change; part of the redraw signature */
	let dataVer = 0;
	/** set to force the next frame to repaint (resize, fonts loaded) */
	let forceDraw = true;
	let lastSig: number[] = [];
	let morphing = false;

	// Earth loop over the selected window + vertical range to fit (recomputed only when data changes)
	$effect(() => {
		const v = app.viewA;
		const vb = app.viewB;
		const pa = profA;
		const pb = profB;
		if (!v || !pa) return;
		const s = v.series;
		loop = { az: s.earthAz, el: s.earthEl, vis: s.earthVis, n: s.n };
		dataVer++;
		let [lo, hi] = minMax(pa);
		if (pb) {
			const [l2, h2] = minMax(pb);
			lo = Math.min(lo, l2);
			hi = Math.max(hi, h2);
		}
		const [eLo, eHi] = minMax(s.earthEl, s.n);
		const [sLo, sHi] = minMax(s.sunEl, s.n);
		const profLo = lo;
		earthTopEl = eHi;
		// fit the horizon and the Sun; Earth only as far as it can matter (it is hidden below the terrain anyway)
		hi = Math.max(hi + 0.4, sHi + 0.5, 1);
		if (eHi > profLo) hi = Math.max(hi, eHi + 1.2);
		if (vb) hi = Math.max(hi, minMax(vb.series.sunEl, vb.series.n)[1] + 0.5);
		lo = Math.min(lo, Math.max(sLo, profLo - 1), Math.max(eLo - 1, profLo - 1.5), -0.3);
		const span = hi - lo;
		rangeLo = lo - span * 0.1;
		rangeHi = hi + span * 0.06;
	});

	// restart the Sun path reveal when the site changes
	let recenter = false;
	$effect(() => {
		void app.siteAId;
		pathStart = performance.now();
		recenter = true;
	});

	// ------------------------------------------------------------------ layout measurement
	function measure() {
		const appEl = root.closest('.app') ?? document.body;
		const rr = root.getBoundingClientRect();
		const w = rr.width, h = rr.height;
		let top = 0, bottom = h, right = w;
		for (const el of Array.from(appEl.children)) {
			if (el.contains(root)) continue;
			const r = el.getBoundingClientRect();
			if (r.width < 2 || r.height < 2) continue;
			const cs = getComputedStyle(el);
			if (cs.visibility === 'hidden' || cs.display === 'none') continue;
			const box = r;
			const tall = box.height > h * 0.4 && box.width < w * 0.5;
			if (tall && box.left > w * 0.4) right = Math.min(right, box.left - rr.left);
			else if ((box.top + box.bottom) / 2 - rr.top < h / 2) top = Math.max(top, box.bottom - rr.top);
			else bottom = Math.min(bottom, box.top - rr.top);
		}
		const g = 10;
		const uiTop = top + g;
		// on phones the readout sits on top of the sky: keep the scene below it
		if (readoutEl) {
			const q = readoutEl.getBoundingClientRect();
			readoutBox = { right: q.right - rr.left, bottom: q.bottom - rr.top };
			if (w < 768) top = Math.max(top, readoutBox.bottom);
		}
		if (dockEl) dockTop = dockEl.getBoundingClientRect().top - rr.top;
		top += g;
		bottom -= g;
		right -= g;
		if (bottom - top < 220) bottom = Math.min(h, top + 220);
		safeTarget = { top, bottom, left: 0, right: Math.max(right, w * 0.45) };
		// expose to the HTML overlays
		setVar('--pano-top', uiTop);
		setVar('--pano-scene-top', safeTarget.top);
		setVar('--pano-bottom', h - safeTarget.bottom);
		setVar('--pano-right', w - safeTarget.right);
	}
	const varCache: Record<string, number> = {};
	function setVar(name: string, px: number) {
		const v = Math.round(px);
		if (varCache[name] === v) return;
		varCache[name] = v;
		root.style.setProperty(name, `${v}px`);
	}

	function resize() {
		const r = root.getBoundingClientRect();
		dpr = Math.min(2, window.devicePixelRatio || 1);
		W = Math.max(1, r.width);
		H = Math.max(1, r.height);
		canvas.width = Math.round(W * dpr);
		canvas.height = Math.round(H * dpr);
		lastMeasure = -1e9;
		forceDraw = true;
	}

	// ------------------------------------------------------------------ per-frame scene
	function updateProfiles(dt: number) {
		const pa = profA;
		if (!pa) return;
		const k = reduced ? 1 : approach(dt, 9);
		morphing = false;
		if (!dispA || dispA.length !== pa.length) {
			dispA = Float32Array.from(pa);
			morphing = true;
		} else if (lerpInto(dispA, pa, k)) morphing = true;
		const pb = profB;
		if (pb) {
			if (!dispB || dispB.length !== pb.length) dispB = Float32Array.from(reduced ? pb : dispA);
			if (lerpInto(dispB, pb, k)) morphing = true;
			alphaB += (1 - alphaB) * (reduced ? 1 : approach(dt, 6));
		} else if (dispB) {
			alphaB += (0 - alphaB) * (reduced ? 1 : approach(dt, 8));
			if (alphaB < 0.01) {
				alphaB = 0;
				dispB = null;
			}
		}
	}
	/** Eases a towards b; returns false (and does nothing) once they already match. */
	function lerpInto(a: Float32Array, b: Float32Array, k: number): boolean {
		let d = 0;
		for (let i = 0; i < a.length; i++) {
			const e = Math.abs(b[i] - a[i]);
			if (e > d) d = e;
		}
		if (d < 1e-4) {
			if (d > 0) a.set(b);
			return d > 0;
		}
		for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * k;
		return true;
	}

	function updatePath() {
		const eph = app.eph;
		const site = app.siteA;
		const pa = profA;
		if (!eph || !site || !pa) return;
		// recompute once per simulated day (not every hour while playing); the path spans
		// ±PATH_HALF_H around the start of the cursor's day plus that day itself
		const c = Math.floor(app.t / 24) * 24;
		const key = `${site.id}|${app.heightIndex}|${c}|${app.earthMarginDeg}`;
		if (path?.key !== key) {
			const i0 = Math.max(0, c - PATH_HALF_H);
			const i1 = Math.min(eph.count, c + 24 + PATH_HALF_H + 1);
			const s = computeSeries(pa, site.lat, site.lon, siteRadius(site.elevation_m, app.heightM), eph, i0, i1, app.earthMarginDeg);
			path = { az: s.sunAz, el: s.sunEl, frac: s.sunFrac, n: s.n, now: 0, key, i0 };
		}
		path.now = app.t - path.i0;
	}

	const canvasLabels = $derived<Labels>({ ...t.canvas, fmt: (v: number, d: number) => fmtNum(v, d) });
	$effect(() => {
		void canvasLabels;
		void app.mode;
		dataVer++;
	});

	function frame(nowMs: number, dt: number) {
		if (!renderer || !dispA) return;
		const eph = app.eph;
		const a = instA;
		if (!eph || !a) return;

		// layout (measured a few times a second, eased so panels opening feel smooth)
		if (nowMs - lastMeasure > 250) {
			measure();
			lastMeasure = nowMs;
		}
		const kl = reduced || !initialised ? 1 : approach(dt, 10);
		// eased, then snapped once within a tenth of a pixel so an idle screen stops repainting
		const ease = (a: number, b: number) => (Math.abs(b - a) < 0.1 ? b : a + (b - a) * kl);
		safe = {
			top: ease(safe.top, safeTarget.top),
			bottom: ease(safe.bottom, safeTarget.bottom),
			left: 0,
			right: ease(safe.right, safeTarget.right)
		};
		const safeW = Math.max(200, safe.right - safe.left);

		const earthD = wrapDelta(a.earthAz - a.sunAz);
		if (!initialised) {
			cam.fov = cam.fovTarget = fovRef = safeW >= 900 ? 200 : safeW >= 560 ? 150 : 110;
			cam.az = Math.abs(earthD) < cam.fov * 0.7 ? a.sunAz + earthD / 2 : a.sunAz;
			if (!reduced) cam.az -= 24; // a short establishing pan on entry
			initialised = true;
			recenter = true;
		}
		if (recenter) {
			// frame the Sun (and the Earth when both fit) whenever the site changes
			cam.flyTo(Math.abs(earthD) < cam.fovTarget * 0.7 ? a.sunAz + earthD / 2 : a.sunAz);
			cam.elUser = null;
			recenter = false;
		}
		cam.update(dt, safeW);

		const ppd = safeW / cam.fov;
		const rulerY = safe.bottom - 14;
		const availTop = safe.top + 44;
		const availBot = rulerY - 30;
		const availH = Math.max(80, availBot - availTop);
		const span = rangeHi - rangeLo;
		// zooming out refits the whole range; zooming in past the default magnifies both axes
		const target = niceScale(availH / (span * (safeW / Math.max(cam.fov, fovRef))));
		if (target !== scaleN) scaleN = target;
		scaleShown += (target - scaleShown) * (reduced ? 1 : approach(dt, 7));
		if (Math.abs(target - scaleShown) < 0.005) scaleShown = target;
		const ppdV = ppd * scaleShown;
		const half = availH / 2 / ppdV;
		let elT: number;
		if (span <= 2 * half + 1e-6) {
			elT = (rangeLo + rangeHi) / 2;
			cam.elUser = null;
		} else {
			const want = cam.elUser ?? (a.sunEl + a.horizonUnderSun) / 2;
			elT = clamp(want, rangeLo + half, rangeHi - half);
			if (cam.elUser !== null) cam.elUser = elT;
		}
		elCenter += (elT - elCenter) * (reduced ? 1 : approach(dt, 10));
		if (Math.abs(elT - elCenter) * ppdV < 0.05) elCenter = elT;

		vp = {
			W,
			H,
			dpr,
			cx: (safe.left + safe.right) / 2,
			camAz: cam.az,
			ppd,
			ppdV,
			yRef: (availTop + availBot) / 2,
			elRef: elCenter,
			safe,
			rulerY
		};

		// intro timeline
		const since = nowMs - introStart;
		const rise: [number, number, number] = reduced
			? [1, 1, 1]
			: [0, 1, 2].map((i) => easeOutQuart((since - 120 - i * 140) / 1100)) as [number, number, number];
		const starsAlpha = reduced ? 1 : easeOutQuart(since / 1600);
		const bodiesAlpha = reduced ? 1 : easeOutQuart((since - 450) / 800);
		const pathReveal = reduced ? 1 : easeOutQuart((nowMs - Math.max(pathStart, introStart + 500)) / 1600);

		updatePath();
		const e = ephemAt(eph, app.t).earthKm;
		const earthDist = Math.hypot(e[0], e[1], e[2]);
		const stepH = eph.step_s / 3600;
		let dir = 1;
		if (path && path.n > 2) {
			const k = clamp(Math.floor(path.now), 0, path.n - 2);
			dir = wrapDelta(path.az[k + 1] - path.az[k]) >= 0 ? 1 : -1;
		}
		// skip the repaint when nothing on screen can have changed (saves battery when idle)
		const hv = dragging || pointers.size > 0 ? null : hover;
		const sig = [
			W, H, dpr, vp.cx, cam.az, cam.fov, ppdV, elCenter, safe.top, safe.bottom, safe.right,
			app.t, app.earthMarginDeg, alphaB, morphing ? nowMs : 0, rise[0] + rise[1] + rise[2],
			starsAlpha, bodiesAlpha, pathReveal, hv ? hv.x : -1, hv ? hv.y : -1, dataVer,
			readoutBox.right, readoutBox.bottom, dockTop, W >= 768 ? 1 : 0
		];
		if (!forceDraw && sig.length === lastSig.length && sig.every((x, i) => x === lastSig[i])) return;
		forceDraw = false;
		lastSig = sig;
		renderer.draw(vp, {
			profA: dispA,
			profB: dispB,
			alphaB,
			marginDeg: app.earthMarginDeg,
			sun: { az: a.sunAz, el: a.sunEl, rDeg: a.sunRadiusDeg, frac: a.sunFrac },
			earth: {
				az: a.earthAz,
				el: a.earthEl,
				rDeg: (Math.asin(EARTH_R_KM / earthDist) * 180) / Math.PI,
				phase: a.earthPhase,
				visible: a.earthVisible
			},
			sunPath: path,
			pathReveal,
			earthLoop: loop,
			hover: hv,
			rise,
			starsAlpha,
			bodiesAlpha,
			starRot: (dir * (app.t * stepH) / 655.72) * 360,
			teacher: app.mode === 'teacher',
			labels: canvasLabels
		});

		placeOverlays(vp, a, bodiesAlpha);
	}

	// edge indicators and teacher callouts follow the bodies (transform only: no layout)
	function placeOverlays(v: Viewport, a: Instant, alpha: number) {
		const y = (el: number) => v.yRef - (el - v.elRef) * v.ppdV;
		const place = (btn: HTMLElement | undefined, az: number, el: number) => {
			if (!btn) return;
			const x = v.cx + wrapDelta(az - v.camAz) * v.ppd;
			const off = x < v.safe.left + 24 ? -1 : x > v.safe.right - 24 ? 1 : 0;
			if (off === 0 || alpha < 0.5) {
				btn.style.opacity = '0';
				btn.style.pointerEvents = 'none';
				btn.tabIndex = -1;
				return;
			}
			const yy = clamp(y(el), v.safe.top + 24, Math.max(v.safe.top + 24, Math.min(v.rulerY - 60, dockTop - 26)));
			// keep the left indicator clear of the readout panel
			const leftX = yy < readoutBox.bottom + 24 && W >= 768 ? readoutBox.right + 12 : v.safe.left + 14;
			const xx = off < 0 ? leftX : v.safe.right - 14;
			btn.style.transform = `translate3d(${xx}px, ${yy}px, 0) translate(${off < 0 ? '0' : '-100%'}, -50%)`;
			btn.style.opacity = '1';
			btn.style.pointerEvents = 'auto';
			btn.tabIndex = 0;
			btn.dataset.side = off < 0 ? 'left' : 'right';
		};
		place(edgeSun, a.sunAz, a.sunEl);
		place(edgeEarth, a.earthAz, a.earthEl);
		// the lowest y a callout may reach: above the control dock and the azimuth ruler
		const floor = Math.min(v.rulerY - 40, dockTop - 8);
		const anchor = (elx: HTMLElement | undefined, az: number, el: number, dy: number, dyUp: number | null) => {
			if (!elx) return;
			const x = v.cx + wrapDelta(az - v.camAz) * v.ppd;
			let yy = y(el) + dy;
			// a "below" bubble that would run into the dock flips above its object
			let up = false;
			if (dyUp !== null && yy + 56 > floor) {
				yy = y(el) - dyUp;
				up = true;
			}
			const underReadout = x - 150 < readoutBox.right && yy - 40 < readoutBox.bottom;
			const inside = x > v.safe.left + 80 && x < v.safe.right - 80 && yy > v.safe.top + (up ? 56 : 0) && yy < floor && !underReadout;
			elx.style.transform = `translate3d(${x}px, ${yy}px, 0)`;
			elx.style.opacity = inside && alpha > 0.9 ? '1' : '0';
			if (dyUp !== null) elx.dataset.flip = up ? 'up' : 'down';
		};
		const sunR = Math.max(7, a.sunRadiusDeg * v.ppdV);
		// above: clear the Sun's own label pill (drawn ~22 px over the disk)
		anchor(callSun, a.sunAz, a.sunEl, Math.max(16, a.sunRadiusDeg * v.ppdV) + 18, sunR + 40);
		anchor(callEarth, a.earthAz, earthTopEl, 0, null);
	}

	// ------------------------------------------------------------------ interaction
	const pointers = new Map<number, { x: number; y: number }>();
	let dragging = false;
	let lastMove = { x: 0, y: 0, t: 0 };
	let velEma = 0;
	let pinch: { d: number; fov: number } | null = null;
	/** touch tap (no drag) shows the crosshair at that point, since touch has no hover */
	let tap: { x: number; y: number; t: number; moved: number } | null = null;

	const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
		const r = root.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	};
	const ppdNow = () => Math.max(200, safe.right - safe.left) / cam.fov;
	const cxNow = () => (safe.left + safe.right) / 2;

	function interacted() {
		if (showHint) showHint = false;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0 && e.pointerType === 'mouse') return;
		canvas.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, local(e));
		cam.stop();
		interacted();
		if (e.pointerType !== 'mouse') {
			hover = null;
			const p = local(e);
			tap = pointers.size === 1 ? { x: p.x, y: p.y, t: performance.now(), moved: 0 } : null;
		}
		if (pointers.size === 1) {
			dragging = true;
			const p = local(e);
			lastMove = { x: p.x, y: p.y, t: performance.now() };
			velEma = 0;
		} else if (pointers.size === 2) {
			const [p1, p2] = [...pointers.values()];
			pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), fov: cam.fovTarget };
		}
	}

	function onPointerMove(e: PointerEvent) {
		const p = local(e);
		if (!pointers.has(e.pointerId)) {
			hover = e.pointerType === 'mouse' ? p : null;
			return;
		}
		pointers.set(e.pointerId, p);
		if (tap) tap.moved = Math.max(tap.moved, Math.hypot(p.x - tap.x, p.y - tap.y));
		if (pointers.size === 2 && pinch) {
			const [p1, p2] = [...pointers.values()];
			const d = Math.max(10, Math.hypot(p1.x - p2.x, p1.y - p2.y));
			const midX = (p1.x + p2.x) / 2 - cxNow();
			cam.zoomBy((pinch.fov * (pinch.d / d)) / cam.fovTarget, midX, ppdNow());
			return;
		}
		if (pointers.size !== 1 || !dragging) return;
		const now = performance.now();
		const dx = p.x - lastMove.x;
		const dy = p.y - lastMove.y;
		const dtm = Math.max(1, now - lastMove.t) / 1000;
		const dAz = -dx / ppdNow();
		cam.panBy(dAz);
		velEma = 0.75 * (dAz / dtm) + 0.25 * velEma;
		if (vp && Math.abs(dy) > 0) {
			// vertical pan only matters when the full range does not fit
			cam.elUser = (cam.elUser ?? elCenter) + dy / vp.ppdV;
		}
		lastMove = { x: p.x, y: p.y, t: now };
	}

	function onPointerUp(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.delete(e.pointerId);
		if (pointers.size === 1) {
			// pinch ended with one finger left: continue as a drag from here
			pinch = null;
			const p = [...pointers.values()][0];
			lastMove = { x: p.x, y: p.y, t: performance.now() };
			velEma = 0;
			return;
		}
		if (pointers.size === 0) {
			if (tap && e.type === 'pointerup' && tap.moved < 8 && performance.now() - tap.t < 400) hover = { x: tap.x, y: tap.y };
			tap = null;
			pinch = null;
			if (dragging && !reduced && performance.now() - lastMove.t < 90) cam.vel = clamp(velEma, -720, 720);
			dragging = false;
		}
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		interacted();
		const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
		const dy = e.deltaY * unit;
		const dx = e.deltaX * unit;
		if (Math.abs(dx) > Math.abs(dy) || e.shiftKey) {
			cam.panBy(((e.shiftKey ? dy : dx) / ppdNow()) * 1);
			return;
		}
		const p = local(e);
		cam.zoomBy(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0016)), p.x - cxNow(), ppdNow());
	}

	function onDblClick(e: MouseEvent) {
		const p = local(e);
		cam.zoomBy(0.5, p.x - cxNow(), ppdNow());
	}

	function zoomStep(f: number) {
		interacted();
		cam.zoomBy(f, 0, ppdNow());
	}
	function lookAt(which: 'sun' | 'earth') {
		interacted();
		const a = instA;
		if (!a) return;
		cam.flyTo(which === 'sun' ? a.sunAz : a.earthAz);
		cam.elUser = null;
		if (cam.fovTarget > 200) cam.setFov(160);
	}
	function showAll() {
		interacted();
		cam.setFov(MAX_FOV);
		cam.elUser = null;
	}

	function onKey(e: KeyboardEvent) {
		if (e.altKey || e.metaKey || e.ctrlKey) return;
		const stepDeg = cam.fovTarget * (e.shiftKey ? 0.4 : 0.12);
		let handled = true;
		switch (e.key) {
			case 'ArrowLeft':
				cam.flyTo(cam.az - stepDeg);
				break;
			case 'ArrowRight':
				cam.flyTo(cam.az + stepDeg);
				break;
			case 'ArrowUp':
				cam.elUser = elCenter + 1 / Math.max(0.5, scaleShown);
				break;
			case 'ArrowDown':
				cam.elUser = elCenter - 1 / Math.max(0.5, scaleShown);
				break;
			case '+':
			case '=':
				zoomStep(0.7);
				break;
			case '-':
			case '_':
				zoomStep(1 / 0.7);
				break;
			case '0':
				showAll();
				break;
			case 's':
			case 'S':
				lookAt('sun');
				break;
			case 'e':
			case 'E':
				lookAt('earth');
				break;
			default:
				handled = false;
		}
		if (handled) {
			e.preventDefault();
			interacted();
		}
	}

	// ------------------------------------------------------------------ lifecycle
	onMount(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduced = mq.matches;
		cam.reduced = reduced;
		coarse = window.matchMedia('(pointer: coarse)').matches;
		const onMq = () => {
			reduced = mq.matches;
			cam.reduced = reduced;
		};
		mq.addEventListener('change', onMq);

		renderer = new PanoramaRenderer(canvas, getComputedStyle(root));
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(root);
		canvas.addEventListener('wheel', onWheel, { passive: false });
		introStart = performance.now();
		pathStart = introStart;
		legendOpen = window.innerWidth >= 768;
		mounted = true;
		const hintTimer = setTimeout(() => (showHint = false), 6500);

		let raf = 0;
		let last = performance.now();
		const tick = (ms: number) => {
			const dt = Math.min(0.05, Math.max(0, (ms - last) / 1000));
			last = ms;
			updateProfiles(dt);
			frame(ms, dt);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		// redraw once fonts are ready so canvas text uses the right faces
		document.fonts?.ready
			.then(() => {
				lastMeasure = -1e9;
				forceDraw = true;
			})
			.catch(() => {});

		return () => {
			cancelAnimationFrame(raf);
			clearTimeout(hintTimer);
			ro.disconnect();
			mq.removeEventListener('change', onMq);
			canvas.removeEventListener('wheel', onWheel);
			renderer = null;
		};
	});

	const teacher = $derived(app.mode === 'teacher');
	const scaleText = $derived(fmtNum(scaleN, scaleN % 1 ? 1 : 0));
</script>

<div class="pano" bind:this={root} class:reduced>
	<canvas
		bind:this={canvas}
		tabindex="0"
		aria-roledescription={t.roledesc}
		aria-label={ariaSummary}
		aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 S E"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onpointerleave={(e) => {
			if (e.pointerType === 'mouse') hover = null;
		}}
		ondblclick={onDblClick}
		onkeydown={onKey}
	></canvas>

	{#if mounted && instA && now}
		<!-- readout -->
		<section class="readout glass" bind:this={readoutEl} aria-label={`${t.title} ${app.siteA?.name[app.lang] ?? ''}`} in:fly={{ y: -14, duration: reduced ? 0 : 600, delay: reduced ? 0 : 350, easing: cubicOut }}>
			<header>
				<span class="dot a" aria-hidden="true"></span>
				<div class="site">
					<span class="label">{t.title}</span>
					<span class="name">{app.siteA?.name[app.lang]}</span>
				</div>
			</header>
			<div class="time">
				<span class="label">{t.time}</span>
				<span class="mono clock">{fmtDateTime(now)}</span>
			</div>
			<dl class="grid">
				<div class="row sun">
					<dt>{t.sunEl}</dt>
					<dd class="num">{sign(instA.sunEl, 2)}</dd>
				</div>
				<div class="row sun extra">
					<dt>{t.sunAz}</dt>
					<dd class="num">{fmtNum(instA.sunAz, 1)}°</dd>
				</div>
				<div class="row sun">
					<dt>{t.sunVis}</dt>
					<dd class="num">
						<span class="bar" aria-hidden="true"><span style:transform={`scaleX(${instA.sunFrac})`}></span></span>
						{pct(instA.sunFrac * 100)}
					</dd>
				</div>
				<div class="row earth">
					<dt>{t.earthEl}</dt>
					<dd class="num">{sign(instA.earthEl, 2)}</dd>
				</div>
				<div class="row earth status" class:off={!instA.earthVisible}>
					<dt>{t.earthLink}</dt>
					<dd>
						<span class="badge">{instA.earthVisible ? t.inView : t.hidden}</span>
					</dd>
				</div>
				{#if !instA.earthVisible}
					<p class="why-hidden" transition:fade={{ duration: 200 }}>{t.hiddenWhy(fmtNum(app.earthMarginDeg, 1))}</p>
				{/if}
			</dl>
			{#if app.siteB && instB}
				<div class="cmp" transition:fly={{ y: 6, duration: reduced ? 0 : 300 }}>
					<span class="dot b" aria-hidden="true"></span>
					<span class="cmp-name">{t.siteB}: {app.siteB.name[app.lang]}</span>
					<span class="cmp-vals">
						<span class="sunc">{t.sunShort} {pct(instB.sunFrac * 100)}</span>
						<span class="sep">·</span>
						<span class={instB.earthVisible ? 'earthc' : 'offc'}>{instB.earthVisible ? t.inView : t.hidden}</span>
					</span>
				</div>
			{/if}
			<footer class="meta">
				<span>{cm.heightLabel}: <b class="num">{fmtNum(app.heightM, 0)} m</b></span>
				<span>{cm.marginLabel}: <b class="num">{fmtNum(app.earthMarginDeg, 1)}°</b></span>
			</footer>
			{#if teacher}
				<p class="teach" transition:fade={{ duration: 200 }}>{t.why}</p>
			{/if}
		</section>

		<!-- controls + legend -->
		<div class="dock" bind:this={dockEl} in:fly={{ y: 14, duration: reduced ? 0 : 600, delay: reduced ? 0 : 500, easing: cubicOut }}>
			<div class="controls glass" role="toolbar" aria-label={t.toolbar}>
				<button class="ctl sunb" onclick={() => lookAt('sun')} aria-label={t.toSun} title={t.toSun}>
					<span class="ico sun-ico" aria-hidden="true"></span><span class="txt">{t.sunShort}</span>
				</button>
				<button class="ctl earthb" onclick={() => lookAt('earth')} aria-label={t.toEarth} title={t.toEarth}>
					<span class="ico earth-ico" aria-hidden="true"></span><span class="txt">{t.earthShort}</span>
				</button>
				<button class="ctl" onclick={showAll} aria-label={t.all} title={t.all}><span class="mono">360°</span></button>
				<span class="divider" aria-hidden="true"></span>
				<button class="ctl sq" onclick={() => zoomStep(1 / 0.7)} aria-label={t.zoomOut} title={t.zoomOut}>
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
				</button>
				<button class="ctl sq" onclick={() => zoomStep(0.7)} aria-label={t.zoomIn} title={t.zoomIn}>
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" /></svg>
				</button>
				<span class="divider" aria-hidden="true"></span>
				<span class="scale" title={t.scaleWhy(scaleText)}>
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M5 4.5 8 2l3 2.5M5 11.5 8 14l3-2.5" /></svg>
					{#key scaleText}
						<span class="num" in:fly={{ y: 6, duration: reduced ? 0 : 260 }}>{t.scale(scaleText)}</span>
					{/key}
				</span>
				<button class="ctl sq legend-toggle" onclick={() => (legendOpen = !legendOpen)} aria-expanded={legendOpen} aria-label={t.legend} title={t.legend}>
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h6" /></svg>
				</button>
			</div>
		</div>
		<div class="dock right" in:fly={{ y: 14, duration: reduced ? 0 : 600, delay: reduced ? 0 : 620, easing: cubicOut }}>
			{#if legendOpen}
				<ul class="legend glass" transition:fly={{ y: 10, duration: reduced ? 0 : 320, easing: cubicOut }}>
					<li>
						<span class="sw path"><i class="full"></i><i class="part"></i><i class="hid"></i></span>
						<span>
							<b>{t.sunPath}</b> <span class="muted">{periodPath}</span><br />
							<span class="k full-t">{t.full}</span> · <span class="k part-t">{t.partial}</span> · <span class="k hid-t">{t.hiddenL}</span>
						</span>
					</li>
					<li>
						<span class="sw eloop"></span>
						<span><b>{t.earthPath}</b> <span class="muted">{periodWin}</span><br /><span class="muted">{t.earthNote}</span></span>
					</li>
					<li><span class="sw hza"></span><span>{t.horizonA}</span></li>
					{#if app.siteB}
						<li transition:fade={{ duration: 200 }}><span class="sw hzb"></span><span>{t.horizonB}</span></li>
					{/if}
					<li><span class="sw marg"></span><span>{t.margin(fmtNum(app.earthMarginDeg, 1))}</span></li>
				</ul>
			{/if}
			{#if teacher}
				<p class="scale-why glass" transition:fly={{ y: 8, duration: reduced ? 0 : 280 }}>{t.scaleWhy(scaleText)}</p>
			{/if}
		</div>

		<span class="scale-mobile num" aria-hidden="true">{t.scale(scaleText)}</span>

		<!-- off-screen indicators -->
		<button class="edge sun-edge" bind:this={edgeSun} onclick={() => lookAt('sun')} aria-label={t.toSun}>
			<span class="arrow" aria-hidden="true"></span><span class="ico sun-ico" aria-hidden="true"></span>{t.sunShort}
		</button>
		<button class="edge earth-edge" bind:this={edgeEarth} onclick={() => lookAt('earth')} aria-label={t.toEarth}>
			<span class="arrow" aria-hidden="true"></span><span class="ico earth-ico" aria-hidden="true"></span>{t.earthShort}
		</button>

		<!-- teacher callouts -->
		{#if teacher}
			<div class="callout-sky" transition:fly={{ y: -10, duration: reduced ? 0 : 420, easing: cubicOut }}>
				<div class="bubble glass">{t.sky}</div>
			</div>
			<div class="anchor" bind:this={callSun}>
				<div class="bubble glass below sunc" transition:fly={{ y: 10, duration: reduced ? 0 : 420, delay: reduced ? 0 : 120, easing: cubicOut }}>
					{t.sunNote}
				</div>
			</div>
			<div class="anchor" bind:this={callEarth}>
				<div class="bubble glass side earthc" transition:fly={{ y: 10, duration: reduced ? 0 : 420, delay: reduced ? 0 : 240, easing: cubicOut }}>
					{t.earthCall}
				</div>
			</div>
		{/if}

		{#if showHint}
			<div class="hint" transition:fade={{ duration: reduced ? 0 : 500 }}>
				<span class="hand" aria-hidden="true"></span>{coarse ? t.hintTouch : t.hint}
			</div>
		{/if}
	{/if}
</div>

<style>
	.pano {
		--pano-top: 90px;
		--pano-bottom: 170px;
		--pano-right: 420px;
		--pano-scene-top: 90px;
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--bg);
		user-select: none;
		-webkit-user-select: none;
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		touch-action: none;
		cursor: grab;
		outline: none;
	}
	canvas:active {
		cursor: grabbing;
	}
	canvas:focus-visible {
		box-shadow: inset 0 0 0 2px var(--earth);
	}

	/* ---------------------------------------------------------------- readout */
	.readout {
		position: absolute;
		top: var(--pano-top);
		left: var(--gutter);
		width: 300px;
		padding: 14px 16px 12px;
		display: grid;
		gap: 10px;
		z-index: 2;
		pointer-events: auto;
		transition: top var(--dur-slow) var(--ease-out);
	}
	.readout header {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.site {
		display: grid;
		min-width: 0;
	}
	.name {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 16px;
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dot {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.dot.a {
		background: var(--site-a);
		box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
	}
	.dot.b {
		background: var(--site-b);
		box-shadow: 0 0 0 3px rgba(196, 155, 255, 0.18);
	}
	.time {
		display: grid;
		gap: 2px;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--hairline);
	}
	.clock {
		font-size: 15px;
		color: var(--text);
	}
	.grid {
		margin: 0;
		display: grid;
		gap: 2px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 5px 2px;
		border-bottom: 1px solid var(--hairline);
	}
	.row dt {
		font-size: 12.5px;
		color: var(--text-2);
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.row dt::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
	.row.sun dt::before {
		background: var(--sun);
		box-shadow: 0 0 8px var(--sun);
	}
	.row.earth dt::before {
		background: var(--earth);
		box-shadow: 0 0 8px var(--earth);
	}
	.row dd {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.row.sun dd {
		color: var(--sun-soft);
	}
	.row.earth dd {
		color: var(--earth-soft);
	}
	.bar {
		width: 46px;
		height: 4px;
		border-radius: 2px;
		background: rgba(255, 181, 71, 0.16);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--sun);
		transform-origin: left;
		transition: transform var(--dur-fast) linear;
	}
	.badge {
		font-size: 12px;
		font-weight: 600;
		padding: 3px 9px;
		border-radius: var(--radius-pill);
		background: var(--earth-dim);
		color: var(--earth-soft);
		transition:
			background var(--dur) var(--ease-out),
			color var(--dur) var(--ease-out);
	}
	.status.off .badge {
		background: rgba(109, 106, 146, 0.25);
		color: #c9c6ea;
	}
	.status.off dt::before {
		background: var(--night);
		box-shadow: none;
	}
	.why-hidden {
		margin: 2px 2px 0;
		font-size: 11.5px;
		color: var(--text-3);
	}
	.cmp {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 8px;
		align-items: center;
		font-size: 12px;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: rgba(196, 155, 255, 0.07);
		border: 1px solid rgba(196, 155, 255, 0.2);
	}
	.cmp-name {
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cmp-vals {
		grid-column: 2;
		color: var(--text-2);
	}
	.sunc {
		color: var(--sun-soft);
	}
	.earthc {
		color: var(--earth-soft);
	}
	.offc {
		color: #c9c6ea;
	}
	.sep {
		color: var(--text-3);
		margin: 0 4px;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		font-size: 11.5px;
		color: var(--text-3);
	}
	.meta b {
		color: var(--text-2);
		font-weight: 600;
	}
	.teach {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-2);
		padding-top: 8px;
		border-top: 1px dashed var(--glass-border-strong);
	}

	/* ---------------------------------------------------------------- dock */
	.dock {
		position: absolute;
		left: var(--gutter);
		bottom: calc(var(--pano-bottom) + 52px);
		display: flex;
		flex-direction: column-reverse;
		align-items: flex-start;
		gap: 8px;
		z-index: 2;
		max-width: calc(100% - var(--pano-right) - var(--gutter) * 2);
		transition: bottom var(--dur-slow) var(--ease-out);
	}
	.dock.right {
		left: auto;
		bottom: auto;
		top: var(--pano-top);
		right: calc(var(--pano-right) + 64px);
		flex-direction: column;
		align-items: flex-end;
		max-width: 380px;
		pointer-events: none;
		transition: top var(--dur-slow) var(--ease-out);
	}
	.dock.right > :global(*) {
		pointer-events: auto;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border-radius: var(--radius-pill);
		flex-wrap: wrap;
	}
	.ctl {
		height: 34px;
		padding: 0 12px;
		border-radius: var(--radius-pill);
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-2);
		transition:
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out),
			transform var(--dur-fast) var(--ease-spring);
	}
	.ctl.sq {
		width: 34px;
		padding: 0;
		justify-content: center;
	}
	.ctl:hover {
		background: rgba(255, 255, 255, 0.07);
		color: var(--text);
	}
	.ctl:active {
		transform: scale(0.94);
	}
	.ctl svg,
	.scale svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.legend-toggle[aria-expanded='true'] {
		color: var(--text);
		background: rgba(255, 255, 255, 0.06);
	}
	.divider {
		width: 1px;
		height: 20px;
		background: var(--glass-border-strong);
		margin: 0 4px;
	}
	.ico {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex: none;
	}
	.sun-ico {
		background: radial-gradient(circle, #fff7e0 0 30%, var(--sun) 70%);
		box-shadow: 0 0 10px 2px rgba(255, 181, 71, 0.55);
	}
	.earth-ico {
		background: linear-gradient(90deg, #12233a 0 45%, var(--earth-soft) 45%);
		box-shadow: 0 0 10px 1px rgba(92, 200, 255, 0.45);
	}
	.scale {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 10px 0 8px;
		font-size: 12.5px;
		color: var(--text);
		white-space: nowrap;
		cursor: help;
		overflow: hidden;
	}
	.scale .num {
		display: inline-block;
	}
	.scale-why {
		margin: 0;
		max-width: 420px;
		padding: 10px 12px;
		font-size: 12px;
		color: var(--text-2);
	}
	.legend {
		list-style: none;
		margin: 0;
		padding: 10px 14px;
		display: grid;
		gap: 7px;
		font-size: 11.5px;
		color: var(--text-2);
		max-width: 380px;
		background: rgba(10, 13, 20, 0.5);
	}
	.legend li {
		display: grid;
		grid-template-columns: 30px 1fr;
		align-items: center;
		gap: 10px;
		line-height: 1.4;
	}
	.legend b {
		color: var(--text);
		font-weight: 600;
	}
	.muted {
		color: var(--text-3);
	}
	.k.full-t {
		color: var(--sun);
	}
	.k.part-t {
		color: #c9a07a;
	}
	.k.hid-t {
		color: #a09dc6;
	}
	.sw {
		width: 30px;
		height: 10px;
		position: relative;
	}
	.sw.path {
		display: flex;
		gap: 2px;
		align-items: center;
	}
	.sw.path i {
		flex: 1;
		height: 2px;
		border-radius: 1px;
	}
	.sw.path .full {
		background: var(--sun);
		height: 2.5px;
	}
	.sw.path .part {
		background: repeating-linear-gradient(90deg, #c9a07a 0 4px, transparent 4px 6px);
	}
	.sw.path .hid {
		background: repeating-linear-gradient(90deg, var(--night) 0 2px, transparent 2px 5px);
	}
	.sw.eloop {
		border: 1px solid rgba(92, 200, 255, 0.6);
		border-radius: 50%;
		height: 12px;
		width: 22px;
		margin-left: 4px;
	}
	.sw.hza {
		background: linear-gradient(180deg, transparent 40%, #4a4a4c 40%);
		border-top: 0;
		clip-path: polygon(0 80%, 20% 40%, 35% 60%, 55% 20%, 75% 55%, 100% 35%, 100% 100%, 0 100%);
		height: 14px;
		background: linear-gradient(180deg, #d9dde6, #2a2c33 60%);
	}
	.sw.hzb {
		height: 2px;
		background: var(--site-b);
		box-shadow: 0 0 6px var(--site-b);
	}
	.sw.marg {
		height: 6px;
		border-top: 1px dashed var(--earth);
		background: rgba(92, 200, 255, 0.1);
	}

	.scale-mobile {
		display: none;
		position: absolute;
		top: calc(var(--pano-scene-top) - 4px);
		left: var(--gutter);
		font-size: 11.5px;
		color: var(--text-2);
		padding: 3px 9px;
		border-radius: var(--radius-pill);
		background: rgba(8, 11, 18, 0.6);
		border: 1px solid var(--glass-border);
		z-index: 2;
		pointer-events: none;
	}

	/* ---------------------------------------------------------------- edge indicators */
	.edge {
		position: absolute;
		left: 0;
		top: 0;
		z-index: 3;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 32px;
		padding: 0 12px 0 10px;
		border-radius: var(--radius-pill);
		font-size: 12.5px;
		font-weight: 500;
		background: var(--glass-strong);
		border: 1px solid var(--glass-border-strong);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--dur) var(--ease-out);
		will-change: transform;
	}
	.sun-edge {
		color: var(--sun-soft);
	}
	.earth-edge {
		color: var(--earth-soft);
	}
	.arrow {
		width: 7px;
		height: 7px;
		border-left: 1.6px solid currentColor;
		border-bottom: 1.6px solid currentColor;
		transform: rotate(45deg);
		animation: nudge-l 1.6s var(--ease-in-out) infinite;
	}
	.edge:global([data-side='right']) {
		flex-direction: row-reverse;
		padding: 0 10px 0 12px;
	}
	.edge:global([data-side='right']) .arrow {
		transform: rotate(-135deg);
		animation-name: nudge-r;
	}
	@keyframes nudge-l {
		50% {
			translate: -3px 0;
		}
	}
	@keyframes nudge-r {
		50% {
			translate: 3px 0;
		}
	}

	/* ---------------------------------------------------------------- teacher callouts */
	.callout-sky {
		position: absolute;
		top: calc(var(--pano-top) + 6px);
		left: calc((100% - var(--pano-right)) / 2);
		transform: translateX(-50%);
		z-index: 1;
		pointer-events: none;
	}
	.anchor {
		position: absolute;
		left: 0;
		top: 0;
		width: 0;
		height: 0;
		z-index: 1;
		pointer-events: none;
		opacity: 0;
		transition: opacity var(--dur) var(--ease-out);
		will-change: transform;
	}
	.bubble {
		font-size: 12.5px;
		line-height: 1.4;
		color: var(--text);
		padding: 8px 12px;
		border-radius: 12px;
		max-width: 260px;
		width: max-content;
	}
	.bubble.below {
		position: absolute;
		left: 0;
		top: 0;
		translate: -50% 10px;
	}
	.anchor:global([data-flip='up']) .bubble.below {
		translate: -50% calc(-100% - 10px);
	}
	.anchor:global([data-flip='up']) .bubble.below::before {
		top: auto;
		bottom: -10px;
	}
	.bubble.below::before {
		content: '';
		position: absolute;
		left: 50%;
		top: -10px;
		width: 1px;
		height: 10px;
		background: currentColor;
		opacity: 0.6;
	}
	.bubble.side {
		position: absolute;
		left: 0;
		top: 0;
		translate: 22px -50%;
	}
	.bubble.side::before {
		content: '';
		position: absolute;
		left: -18px;
		top: 50%;
		width: 14px;
		height: 1px;
		background: currentColor;
		opacity: 0.6;
	}
	.bubble.sunc {
		border-color: rgba(255, 181, 71, 0.35);
	}
	.bubble.earthc {
		border-color: rgba(92, 200, 255, 0.35);
	}
	.bubble.sunc,
	.bubble.earthc {
		color: var(--text);
	}

	/* ---------------------------------------------------------------- hint */
	.hint {
		position: absolute;
		left: calc((100% - var(--pano-right)) / 2);
		top: calc(var(--pano-scene-top) + 16%);
		transform: translateX(-50%);
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		border-radius: var(--radius-pill);
		background: rgba(8, 11, 18, 0.7);
		border: 1px solid var(--glass-border);
		font-size: 12.5px;
		color: var(--text-2);
		pointer-events: none;
		z-index: 2;
		white-space: nowrap;
	}
	.hand {
		width: 18px;
		height: 10px;
		border-radius: 5px;
		border: 1.5px solid var(--text-2);
		position: relative;
	}
	.hand::after {
		content: '';
		position: absolute;
		top: 1.5px;
		left: 2px;
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--text);
		animation: swipe 1.8s var(--ease-in-out) infinite;
	}
	@keyframes swipe {
		50% {
			translate: 7px 0;
		}
	}

	/* ---------------------------------------------------------------- phones */
	@media (max-width: 767px) {
		.readout {
			left: var(--gutter);
			right: var(--gutter);
			width: auto;
			padding: 10px 12px;
			gap: 6px;
		}
		.readout header .label,
		.time .label,
		.extra,
		.why-hidden,
		.meta span:last-child {
			display: none;
		}
		.time {
			padding: 0;
			background: none;
			border: 0;
		}
		.clock {
			font-size: 12.5px;
			color: var(--text-2);
		}
		.status dt {
			display: none;
		}
		.status {
			justify-content: flex-end;
		}
		.grid {
			grid-template-columns: 1fr 1fr;
			column-gap: 12px;
		}
		.row {
			padding: 3px 0;
		}
		.row dt {
			font-size: 11.5px;
		}
		.row dd {
			font-size: 13.5px;
		}
		.bar {
			display: none;
		}
		.badge {
			font-size: 11px;
			padding: 2px 7px;
		}
		.dock {
			left: var(--gutter);
			right: var(--gutter);
			max-width: none;
			bottom: calc(var(--pano-bottom) + 44px);
		}
		.dock.right {
			left: var(--gutter);
			right: var(--gutter);
			max-width: none;
			align-items: stretch;
			top: auto;
			bottom: calc(var(--pano-bottom) + 92px);
			flex-direction: column-reverse;
		}
		.ctl .txt {
			display: none;
		}
		.ctl {
			padding: 0 10px;
		}
		.legend {
			max-width: none;
		}
		.bubble {
			max-width: 200px;
			font-size: 11.5px;
		}
		.scale-why,
		.scale {
			display: none;
		}
		/* the "no air" callout sits at the top of the sky, right of the scale label */
		.callout-sky {
			top: calc(var(--pano-scene-top) - 6px);
			left: auto;
			right: var(--gutter);
			transform: none;
		}
		.callout-sky .bubble {
			max-width: min(200px, calc(100vw - 170px));
		}
		.scale-mobile {
			display: block;
		}
		.controls {
			flex-wrap: nowrap;
		}
		.hint {
			top: calc(var(--pano-scene-top) + 36px);
			white-space: normal;
			width: max-content;
			max-width: calc(100% - 32px);
			text-align: center;
		}
	}
	@media (max-width: 420px) {
		.scale {
			font-size: 11.5px;
		}
		.cmp {
			font-size: 11px;
		}
	}

	.reduced .arrow,
	.reduced .hand::after {
		animation: none;
	}
</style>
