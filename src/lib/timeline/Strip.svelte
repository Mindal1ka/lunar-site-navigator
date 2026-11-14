<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!--
	The time strip: calendar axis, per-hour Sun / Earth bands for site A (and B),
	the selected period as a draggable / resizable brush, the time cursor as a scrubbable
	playhead, longest-night highlights and best-window markers.
	Dense data is drawn on a canvas from pre-baked textures; interactive parts are DOM
	(focusable, labelled) and move with transforms only.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Tween, prefersReducedMotion } from 'svelte/motion';
	import { cubicInOut, cubicOut } from 'svelte/easing';
	import { scale, fade } from 'svelte/transition';
	import { app, LUNAR_MONTH_H } from '#lib/state.svelte.ts';
	import { computeSeries, siteRadius, timeOf, type Stats } from '#lib/engine/visibility.ts';
	import type { Site } from '#lib/engine/data.ts';
	import { COMMON, fmtDate, fmtDateTime, fmtDuration, fmtNum, fmtPct } from '#lib/i18n.ts';
	import { bakeBands, readPalette, sample, type BandTex, type Palette } from './bands.ts';
	import { makeTicks } from './ticks.ts';
	import { T } from './strings.ts';

	let {
		detail,
		hint = 0,
		ontoggledetail
	}: { detail: boolean; hint?: number; ontoggledetail: () => void } = $props();

	const t = $derived(T[app.lang]);
	const reduced = $derived(prefersReducedMotion.current);
	const eph = $derived(app.eph!);
	const count = $derived(app.eph?.count ?? 1);
	const stepH = $derived((app.eph?.step_s ?? 3600) / 3600);
	const perDay = $derived(Math.round(24 / stepH));

	let plot: HTMLDivElement | undefined = $state();
	let cv: HTMLCanvasElement | undefined = $state();
	let W = $state(0);
	let H = $state(0);
	let dpr = $state(1);
	let fontTick = $state(0);
	let palette = $state.raw<Palette | null>(null);

	onMount(() => {
		palette = readPalette();
		dpr = Math.min(3, window.devicePixelRatio || 1);
		document.fonts?.ready.then(() => fontTick++);
		const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
		const onDpr = () => (dpr = Math.min(3, window.devicePixelRatio || 1));
		mq.addEventListener?.('change', onDpr);
		return () => {
			mq.removeEventListener?.('change', onDpr);
			cancelAnimationFrame(anim);
			detach();
		};
	});

	// ------------------------------------------------------------------ textures
	// window bands: rebuilt only when the series change (site, height, margin, window)
	const texA = $derived(palette && app.viewA ? bakeBands(app.viewA.series, 4096, palette) : null);
	const texB = $derived(palette && app.viewB ? bakeBands(app.viewB.series, 4096, palette) : null);

	// context bands over the whole ephemeris span (dimmed outside the period), computed lazily
	let ctxA = $state.raw<BandTex | null>(null);
	let ctxB = $state.raw<BandTex | null>(null);
	const cache = new Map<string, BandTex>();

	function useContext(get: () => Site | null | undefined, set: (v: BandTex | null) => void) {
		$effect(() => {
			const e = app.eph, site = get(), pal = palette;
			const hi = app.heightIndex, h = app.heightM, m = app.earthMarginDeg;
			if (!e || !site?.horizons || !pal) return set(null);
			const key = `${site.id}|${hi}|${h}|${m}`;
			const hit = cache.get(key);
			if (hit) return set(hit);
			set(null);
			const prof = site.horizons[hi];
			const id = setTimeout(() => {
				const s = computeSeries(prof, site.lat, site.lon, siteRadius(site.elevation_m, h), e, 0, e.count, m);
				const tex = bakeBands(s, 8192, pal);
				if (!tex) return;
				cache.set(key, tex);
				if (cache.size > 8) cache.delete(cache.keys().next().value!);
				set(tex);
			}, 160);
			return () => clearTimeout(id);
		});
	}
	useContext(() => app.siteA, (v) => (ctxA = v));
	useContext(() => app.siteB, (v) => (ctxB = v));

	const ctxFade = new Tween(0, { duration: 600, easing: cubicOut });
	$effect(() => {
		if (ctxA) ctxFade.target = 1;
		else ctxFade.set(0, { duration: 0 });
	});

	// wipe-in of fresh bands when the site / height / margin change (not when the window moves)
	const reveal = new Tween(1, { duration: 720, easing: cubicOut });
	let revealKey = '';
	$effect(() => {
		const k = `${app.siteAId}|${app.siteBId}|${app.heightM}|${app.earthMarginDeg}`;
		if (revealKey && k !== revealKey && !reduced) reveal.set(0, { duration: 0 }).then(() => (reveal.target = 1));
		revealKey = k;
	});

	// number of site groups, animated so adding B makes room smoothly
	const groups = new Tween(app.viewB ? 2 : 1, { duration: 520, easing: cubicOut });
	$effect(() => {
		groups.set(app.viewB ? 2 : 1, { duration: reduced ? 0 : 520 });
	});

	// ------------------------------------------------------------------ domain and brush
	let dragKind = $state<null | 'scrub' | 'move' | 'l' | 'r'>(null);
	let dragWin = $state<[number, number] | null>(null);

	const frame = new Tween<[number, number]>([app.win.i0, app.win.i1], { duration: 460, easing: cubicOut });
	$effect(() => {
		const w = app.win;
		if (dragWin) return;
		frame.set([w.i0, w.i1], { duration: reduced ? 0 : 460 });
	});
	const fr = $derived<[number, number]>(dragWin ?? frame.current);

	const domain = new Tween<[number, number]>([0, app.eph?.count ?? 1], { duration: 700, easing: cubicInOut });
	$effect(() => {
		const w = app.win;
		const len = w.i1 - w.i0;
		const pad = Math.max(6, len * 0.035);
		const target: [number, number] = detail ? [w.i0 - pad, w.i1 + pad] : [0, count];
		if (dragKind === 'move' || dragKind === 'l' || dragKind === 'r') return; // freeze while the brush is dragged
		domain.set(target, { duration: reduced ? 0 : 700 });
	});
	const d0 = $derived(domain.current[0]);
	const d1 = $derived(domain.current[1]);

	const x = (i: number) => ((i - d0) / (d1 - d0)) * W;
	const invX = (px: number) => d0 + (px / Math.max(1, W)) * (d1 - d0);

	// ------------------------------------------------------------------ geometry
	const mobile = $derived(H > 0 && H < 66);
	const geo = $derived.by(() => {
		const lane = mobile ? 15 : 19;
		const axis = mobile ? 12 : 15;
		const top = lane + 2;
		const bot = H - axis - 2;
		const th = Math.max(8, bot - top);
		const g = groups.current;
		const gap = mobile ? 3 : 5;
		const rg = mobile ? 1.5 : 2;
		const rowH = Math.max(2, (th - (g - 1) * gap - g * rg) / (2 * g));
		const groupH = 2 * rowH + rg;
		return { lane, axis, top, bot, th, rowH, rg, gap, groupH, groupY: (k: number) => top + k * (groupH + gap) };
	});

	// ------------------------------------------------------------------ drawing
	function rr(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: number) {
		g.beginPath();
		g.roundRect(x0, y0, w, h, Math.min(r, h / 2, Math.abs(w) / 2));
	}

	function blit(g: CanvasRenderingContext2D, tex: BandTex, img: HTMLCanvasElement, y: number, h: number, xa: number, xb: number, alpha: number) {
		if (alpha <= 0.002) return;
		const ia = Math.max(tex.i0, invX(Math.max(0, xa)));
		const ib = Math.min(tex.i1, invX(Math.min(W, xb)));
		if (ib <= ia) return;
		const span = tex.i1 - tex.i0;
		const sx = ((ia - tex.i0) / span) * tex.cols;
		const sw = Math.max(0.0001, ((ib - ia) / span) * tex.cols);
		const dx = x(ia);
		const dw = x(ib) - dx;
		g.imageSmoothingEnabled = (dw * dpr) / sw < 1.5;
		g.globalAlpha = alpha;
		g.drawImage(img, sx, 0, sw, 1, dx, y, dw, h);
	}

	function nightOf(s: Stats | undefined | null): [number, number] | null {
		if (!s || s.longestNightH <= 0) return null;
		return [s.longestNightStart, s.longestNightStart + s.longestNightH / stepH];
	}

	function draw() {
		const g = cv?.getContext('2d');
		if (!g || W <= 0 || H <= 0) return;
		const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
		if (cv!.width !== cw || cv!.height !== ch) {
			cv!.width = cw;
			cv!.height = ch;
		}
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, W, H);
		void fontTick;

		const G = geo;
		const xa = x(fr[0]), xb = x(fr[1]);
		const xrev = xa + (xb - xa) * reveal.current;
		const sites: { tex: BandTex | null; ctx: BandTex | null; alpha: number; stats: Stats | null | undefined }[] = [
			{ tex: texA, ctx: ctxA, alpha: 1, stats: app.viewA?.stats },
			{ tex: texB, ctx: ctxB, alpha: Math.max(0, Math.min(1, groups.current - 1)), stats: app.viewB?.stats }
		];

		// track base
		g.globalAlpha = 1;
		sites.forEach((s, k) => {
			if (s.alpha <= 0) return;
			const y0 = G.groupY(k);
			for (let r = 0; r < 2; r++) {
				const y = y0 + r * (G.rowH + G.rg);
				if (y > G.bot) continue;
				const h = Math.min(G.rowH, G.bot - y);
				g.save();
				rr(g, 0, y, W, h, 3);
				g.clip();
				g.globalAlpha = s.alpha;
				g.fillStyle = 'rgba(255,255,255,0.035)';
				g.fillRect(0, y, W, h);
				const img = (tx: BandTex) => (r === 0 ? tx.sun : tx.earth);
				const fade = ctxFade.current * s.alpha;
				if (s.ctx) {
					// dim context everywhere except the revealed part of the period
					blit(g, s.ctx, img(s.ctx), y, h, -1, xa, 0.3 * fade);
					blit(g, s.ctx, img(s.ctx), y, h, xrev, W + 1, 0.3 * fade);
					blit(g, s.ctx, img(s.ctx), y, h, xa, xrev, fade);
				}
				if (s.tex) blit(g, s.tex, img(s.tex), y, h, xa, xrev, s.alpha);
				g.restore();
			}
			// longest night of this site in the period
			const n = nightOf(s.stats);
			if (n) {
				const nx0 = x(n[0]), nx1 = Math.max(nx0 + 2, x(n[1]));
				if (nx1 > 0 && nx0 < W) {
					g.save();
					g.globalAlpha = s.alpha * reveal.current;
					rr(g, nx0, y0 - 1.5, nx1 - nx0, G.groupH + 3, 4);
					g.fillStyle = 'rgba(150, 138, 255, 0.16)';
					g.fill();
					g.shadowColor = 'rgba(170, 150, 255, 0.85)';
					g.shadowBlur = 8;
					g.lineWidth = 1;
					g.strokeStyle = 'rgba(214, 204, 255, 0.92)';
					g.stroke();
					g.restore();
				}
			}
		});

		// calendar axis
		const ticks = makeTicks(d0, d1, W, eph.start_unix, eph.step_s, app.lang);
		const ay = H - G.axis;
		g.globalAlpha = 1;
		g.fillStyle = 'rgba(255,255,255,0.14)';
		for (const i of ticks.minor) {
			const px = x(i);
			if (px >= 0 && px <= W) g.fillRect(Math.round(px * dpr) / dpr, ay, 1, 3);
		}
		g.font = `500 ${mobile ? 9.5 : 10.5}px "Inter Variable", system-ui, sans-serif`;
		g.textBaseline = 'alphabetic';
		// best-window capsules sit in the axis lane: skip the labels they would cover
		const occupied = app.best.map((b) => {
			const a = x(b.i0);
			return [a - 3, a + Math.max(18, x(b.i1) - a) + 3] as const;
		});
		for (const tk of ticks.major) {
			const px = x(tk.i);
			if (px < -1 || px > W + 1) continue;
			const sx = Math.round(px * dpr) / dpr;
			// faint calendar gridline through the bands
			g.fillStyle = tk.strong ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
			g.fillRect(sx, G.top, 1, G.bot - G.top);
			g.fillStyle = tk.strong ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.28)';
			g.fillRect(sx, ay, 1, 5);
			if (px > W - 22) continue;
			const lw = g.measureText(tk.label).width;
			if (occupied.some(([a, b]) => sx + 4 < b && sx + 4 + lw > a)) continue;
			g.fillStyle = tk.strong ? '#d9dee8' : '#8e97a8';
			g.fillText(tk.label, sx + 4, H - 2);
		}
	}

	$effect(() => {
		draw();
	});

	// ------------------------------------------------------------------ actions
	const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
	const snapDay = (i: number) => Math.round(i / perDay) * perDay;

	/** setWindow, but keep the best-window markers and keep the cursor where it was (clamped). */
	function commitWin(i0: number, i1: number, tNext = app.t) {
		const best = app.best;
		app.setWindow(i0, i1);
		app.best = best;
		app.t = clamp(tNext, app.win.i0, app.win.i1 - 1);
	}

	let anim = 0;
	function jumpT(target: number) {
		cancelAnimationFrame(anim);
		const from = app.t;
		if (reduced || Math.abs(target - from) < 0.5) {
			app.t = target;
			return;
		}
		const t0 = performance.now();
		const D = 340;
		const step = (now: number) => {
			const k = Math.min(1, (now - t0) / D);
			app.t = from + (target - from) * (1 - (1 - k) ** 3);
			if (k < 1) anim = requestAnimationFrame(step);
		};
		anim = requestAnimationFrame(step);
	}

	// magnet points for scrubbing: nights, best windows, period edges
	const magnets = $derived.by(() => {
		const out: number[] = [app.win.i0, app.win.i1 - 1];
		for (const s of [app.viewA?.stats, app.viewB?.stats]) {
			const n = nightOf(s);
			if (n) out.push(n[0], n[1]);
		}
		for (const b of app.best) out.push(b.i0);
		return out;
	});
	let lastSnap: number | null = null;
	let snapPulse = $state(0);
	function snapT(i: number) {
		let best: number | null = null, bd = 8;
		for (const m of magnets) {
			const d = Math.abs(x(m) - x(i));
			if (d < bd) {
				bd = d;
				best = m;
			}
		}
		if (best !== null && best !== lastSnap) {
			snapPulse++;
			if (matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(6);
		}
		lastSnap = best;
		return clamp(best ?? Math.round(i), app.win.i0, app.win.i1 - 1);
	}

	// ------------------------------------------------------------------ pointer
	interface DragState {
		kind: 'scrub' | 'move' | 'l' | 'r';
		startX: number;
		moved: boolean;
		off: number;
		w0: [number, number];
		t0: number;
		wasPlaying: boolean;
		last: number;
	}
	let ds: DragState | null = null;
	let hoverI = $state<number | null>(null);
	let phFocus = $state(false);

	function idxAt(e: PointerEvent) {
		const r = plot!.getBoundingClientRect();
		return invX(e.clientX - r.left);
	}

	function begin(e: PointerEvent, kind: DragState['kind']) {
		if (e.button !== 0 || !plot) return;
		e.preventDefault();
		e.stopPropagation();
		const i = idxAt(e);
		const w = app.win;
		ds = { kind, startX: e.clientX, moved: false, off: i - w.i0, w0: [w.i0, w.i1], t0: app.t, wasPlaying: app.playing, last: 0 };
		dragKind = kind;
		hoverI = null;
		if (kind === 'scrub') {
			app.playing = false;
			lastSnap = null;
			jumpT(snapT(i));
		} else dragWin = [w.i0, w.i1];
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', end);
		window.addEventListener('pointercancel', end);
	}

	function onMove(e: PointerEvent) {
		if (!ds) return;
		if (!ds.moved && Math.abs(e.clientX - ds.startX) < 3) return;
		ds.moved = true;
		const i = idxAt(e);
		if (ds.kind === 'scrub') {
			cancelAnimationFrame(anim);
			app.t = snapT(i);
			return;
		}
		const [a, b] = dragWin ?? ds.w0;
		let next: [number, number];
		if (ds.kind === 'move') {
			const len = ds.w0[1] - ds.w0[0];
			const i0 = clamp(snapDay(i - ds.off), 0, count - len);
			next = [i0, i0 + len];
		} else if (ds.kind === 'l') {
			next = [clamp(snapDay(i), 0, b - perDay), b];
			app.preset = 'custom';
		} else {
			next = [a, clamp(snapDay(i), a + perDay, count)];
			app.preset = 'custom';
		}
		dragWin = next;
		const now = performance.now();
		if (now - ds.last > 130) {
			ds.last = now;
			commitWin(next[0], next[1], ds.kind === 'move' ? ds.t0 + (next[0] - ds.w0[0]) : app.t);
		}
	}

	function end() {
		const d = ds;
		detach();
		ds = null;
		if (!d) return;
		if (d.kind === 'scrub') {
			if (d.wasPlaying) app.playing = true;
		} else if (dragWin) {
			const [a, b] = dragWin;
			commitWin(a, b, d.kind === 'move' ? d.t0 + (a - d.w0[0]) : app.t);
			frame.set([app.win.i0, app.win.i1], { duration: 0 });
			dragWin = null;
		}
		dragKind = null;
	}

	function detach() {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', end);
		window.removeEventListener('pointercancel', end);
	}

	function plotDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const i = idxAt(e);
		const w = app.win;
		if (i < w.i0 || i > w.i1) {
			// outside the period: slide the period there (same length), cursor follows
			const len = w.i1 - w.i0;
			const i0 = clamp(snapDay(i - len / 2), 0, count - len);
			commitWin(i0, i0 + len, app.t);
			jumpT(clamp(Math.round(i), app.win.i0, app.win.i1 - 1));
			return;
		}
		begin(e, 'scrub');
	}

	function plotHover(e: PointerEvent) {
		if (ds || e.pointerType !== 'mouse') return;
		hoverI = idxAt(e);
	}

	// ------------------------------------------------------------------ keyboard
	function keyPlayhead(e: KeyboardEvent) {
		const w = app.win;
		let v: number | null = null;
		const big = e.shiftKey;
		switch (e.key) {
			case 'ArrowRight':
			case 'ArrowUp':
				v = app.t + (big ? perDay : 1);
				break;
			case 'ArrowLeft':
			case 'ArrowDown':
				v = app.t - (big ? perDay : 1);
				break;
			case 'PageUp':
				v = app.t + 7 * perDay;
				break;
			case 'PageDown':
				v = app.t - 7 * perDay;
				break;
			case 'Home':
				v = w.i0;
				break;
			case 'End':
				v = w.i1 - 1;
				break;
			case ' ':
			case 'Enter':
			case 'k':
				e.preventDefault();
				app.playing = !app.playing;
				return;
		}
		if (v === null) return;
		e.preventDefault();
		const target = clamp(Math.round(v), w.i0, w.i1 - 1);
		if (e.key.startsWith('Arrow')) {
			cancelAnimationFrame(anim);
			app.t = target;
		} else jumpT(target);
	}

	function keyBrush(e: KeyboardEvent, kind: 'move' | 'l' | 'r') {
		const w = app.win;
		const len = w.i1 - w.i0;
		let delta = 0;
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = e.shiftKey ? 7 * perDay : perDay;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -(e.shiftKey ? 7 * perDay : perDay);
		else if (e.key === 'PageUp') delta = LUNAR_MONTH_H / stepH;
		else if (e.key === 'PageDown') delta = -LUNAR_MONTH_H / stepH;
		else if (kind === 'move' && e.key === 'Home') delta = -w.i0;
		else if (kind === 'move' && e.key === 'End') delta = count - len - w.i0;
		else if (kind === 'move' && e.key === 'Enter') {
			e.preventDefault();
			ontoggledetail();
			return;
		} else return;
		e.preventDefault();
		if (kind === 'move') {
			const i0 = clamp(w.i0 + delta, 0, count - len);
			commitWin(i0, i0 + len, app.t + (i0 - w.i0));
		} else if (kind === 'l') {
			app.preset = 'custom';
			commitWin(clamp(w.i0 + delta, 0, w.i1 - perDay), w.i1);
		} else {
			app.preset = 'custom';
			commitWin(w.i0, clamp(w.i1 + delta, w.i0 + perDay, count));
		}
	}

	// ------------------------------------------------------------------ labels
	const fmtShort = (d: Date) => fmtDate(d, { day: 'numeric', month: 'short' });
	function periodText(i0: number, i1: number) {
		const a = timeOf(eph, i0), b = timeOf(eph, i1 - 1);
		const hours = (i1 - i0) * stepH;
		if (hours <= 24 * 120) {
			return a.getUTCFullYear() === b.getUTCFullYear() ? `${fmtShort(a)} – ${fmtDate(b)}` : `${fmtDate(a)} – ${fmtDate(b)}`;
		}
		return `${fmtDate(a, { month: 'short', year: 'numeric' })} – ${fmtDate(b, { month: 'short', year: 'numeric' })}`;
	}
	const daysText = (i0: number, i1: number) => {
		const d = ((i1 - i0) * stepH) / 24;
		return t.days(fmtNum(d, d < 100 && d % 1 !== 0 ? 1 : 0));
	};

	const xa = $derived(x(fr[0]));
	const xb = $derived(x(fr[1]));
	const bw = $derived(xb - xa);
	const pillText = $derived.by(() => {
		const p = periodText(fr[0], fr[1]);
		const d = ((fr[1] - fr[0]) * stepH) / 24;
		const short = `${fmtNum(d, d < 100 && d % 1 !== 0 ? 1 : 0)} ${COMMON[app.lang].days}`;
		const cw = mobile ? 5.4 : 6; // rough glyph width at the pill font size
		for (const s of [`${p} · ${daysText(fr[0], fr[1])}`, p, short]) if (s.length * cw + 44 < bw) return s;
		return '';
	});
	const phX = $derived(x(app.t));
	const phVisible = $derived(phX >= -1 && phX <= W + 1);

	const nightTags = $derived.by(() => {
		const out: { k: number; key: string; cx: number; cy: number; text: string; full: string }[] = [];
		[app.viewA?.stats, app.viewB?.stats].forEach((s, k) => {
			const n = nightOf(s);
			if (!n || !s) return;
			const a = x(n[0]), b = x(n[1]);
			if (b < 0 || a > W) return;
			const dur = fmtDuration(s.longestNightH);
			const roomy = b - a > 150 && !(mobile && groups.current > 1.5);
			out.push({
				k,
				key: `${k}-${n[0]}-${s.longestNightH}`,
				cx: clamp((a + b) / 2, 46, W - 46),
				cy: geo.groupY(k) + geo.groupH / 2,
				text: roomy ? `${t.longestNight} ${dur}` : dur,
				full: `${t.longestNight}: ${dur}, ${fmtDateTime(timeOf(eph, n[0]))}`
			});
		});
		return out;
	});

	const bestMarks = $derived.by(() => {
		const out = app.best.map((b, n) => {
			const a = x(b.i0), z = x(b.i1);
			return { b, n, left: a, width: Math.max(18, z - a), label: `${t.best(n + 1)}: ${periodText(b.i0, b.i1)}, ${t.bothTogether} ${fmtPct(b.score * 100)} %` };
		});
		// windows never overlap in time, but at overview scale on a phone their minimum-width
		// capsules can: nudge them apart so each stays readable and tappable
		const byX = [...out].sort((p, q) => p.left - q.left);
		for (let k = 1; k < byX.length; k++) {
			const prev = byX[k - 1];
			byX[k].left = Math.max(byX[k].left, prev.left + prev.width + 2);
		}
		return out;
	});

	function pickBest(b: { i0: number; i1: number }) {
		app.preset = 'custom';
		commitWin(b.i0, b.i1, b.i0);
	}

	// readout bubble (hover, scrubbing or keyboard focus on the playhead)
	const readI = $derived(dragKind === 'scrub' || (phFocus && hoverI === null) ? app.t : hoverI);
	const readout = $derived.by(() => {
		if (readI === null || !app.eph) return null;
		const i = clamp(Math.floor(readI), 0, count - 1);
		const rows: { id: string; color: string; sun: number | null; earth: boolean | null }[] = [];
		const add = (id: string, color: string, tex: BandTex | null, ctx: BandTex | null) => {
			const v = sample(tex, i) ?? sample(ctx, i);
			rows.push({ id, color, sun: v ? v.sun : null, earth: v ? v.earth : null });
		};
		if (app.viewA) add('A', 'var(--site-a)', texA, ctxA);
		if (app.viewB) add('B', 'var(--site-b)', texB, ctxB);
		return { x: clamp(x(i), 92, W - 92), lineX: x(i), date: fmtDateTime(timeOf(eph, i)), rows };
	});
	const sunText = (f: number | null) => (f === null ? '—' : f <= 0 ? t.hidden : `${fmtPct(f * 100)} %`);

	const sr = $derived(fmtDateTime(timeOf(eph, app.t)));
	const hintOn = $state({ v: false });
	$effect(() => {
		if (!hint) return;
		hintOn.v = true;
		const id = setTimeout(() => (hintOn.v = false), 1600);
		return () => clearTimeout(id);
	});
	const siteName = $derived(app.siteA?.name[app.lang] ?? '');
</script>

<div class="strip" class:mobile role="group" aria-label={t.strip(siteName)}>
	<div class="gutter" aria-hidden="true">
		<span class="badge a" style:transform="translateY({geo.groupY(0) + geo.groupH / 2}px)">A</span>
		{#if app.viewB}
			<span
				class="badge b"
				style:transform="translateY({geo.groupY(1) + geo.groupH / 2}px)"
				style:opacity={Math.max(0, groups.current - 1)}
				transition:fade={{ duration: 200 }}>B</span
			>
		{/if}
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="plot"
		class:dragging={dragKind !== null}
		class:grabbing={dragKind === 'move'}
		bind:this={plot}
		bind:clientWidth={W}
		bind:clientHeight={H}
		onpointerdown={plotDown}
		onpointermove={plotHover}
		onpointerleave={() => (hoverI = null)}
	>
		<canvas bind:this={cv} aria-hidden="true"></canvas>

		<!-- selected period (brush) -->
		<div
			class="brush"
			class:active={dragKind === 'move' || dragKind === 'l' || dragKind === 'r'}
			class:hint={hintOn.v}
			style:transform="translateX({xa}px)"
			style:width="{Math.max(0, bw)}px"
			style:--lane="{geo.lane}px"
			style:--axis="{geo.axis}px"
		>
			<div class="frame" aria-hidden="true"></div>
			<div
				class="pill"
				role="slider"
				tabindex="0"
				aria-label={t.periodLabel}
				aria-valuemin={0}
				aria-valuemax={count}
				aria-valuenow={app.win.i0}
				aria-valuetext={`${periodText(app.win.i0, app.win.i1)}, ${daysText(app.win.i0, app.win.i1)}`}
				onpointerdown={(e) => begin(e, 'move')}
				ondblclick={ontoggledetail}
				onkeydown={(e) => keyBrush(e, 'move')}
			>
				<span class="grip" aria-hidden="true"></span>
				{#if pillText}<span class="ptext">{pillText}</span>{/if}
				<span class="grip" aria-hidden="true"></span>
			</div>
			<div
				class="handle l"
				role="slider"
				tabindex="0"
				aria-label={t.periodStart}
				aria-valuemin={0}
				aria-valuemax={app.win.i1}
				aria-valuenow={app.win.i0}
				aria-valuetext={fmtDate(timeOf(eph, app.win.i0))}
				onpointerdown={(e) => begin(e, 'l')}
				onkeydown={(e) => keyBrush(e, 'l')}
			>
				<i></i>
			</div>
			<div
				class="handle r"
				role="slider"
				tabindex="0"
				aria-label={t.periodEnd}
				aria-valuemin={app.win.i0}
				aria-valuemax={count}
				aria-valuenow={app.win.i1}
				aria-valuetext={fmtDate(timeOf(eph, app.win.i1 - 1))}
				onpointerdown={(e) => begin(e, 'r')}
				onkeydown={(e) => keyBrush(e, 'r')}
			>
				<i></i>
			</div>
		</div>

		<!-- longest night labels -->
		{#each nightTags as n (n.k)}
			<span
				class="night"
				class:b={n.k === 1}
				class:tiny={mobile && groups.current > 1.5}
				style:transform="translate({n.cx}px, {n.cy}px) translate(-50%, -50%)"
				title={n.full}
				in:scale={{ duration: reduced ? 0 : 380, start: 0.7, easing: cubicOut }}
			>
				<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M8.6 9.4A4.6 4.6 0 0 1 4.2 1.6a4.6 4.6 0 1 0 6.2 6.2 4.6 4.6 0 0 1-1.8 1.6Z" /></svg>
				<span>{n.text}</span>
				<span class="sr-only">{n.full}</span>
			</span>
		{/each}

		<!-- best windows (planner) -->
		{#each bestMarks as m (m.b.i0)}
			<button
				type="button"
				class="best"
				style:transform="translateX({m.left}px)"
				style:width="{m.width}px"
				style:height="{geo.axis - 1}px"
				aria-label={m.label}
				title={m.label}
				onpointerdown={(e) => e.stopPropagation()}
				onclick={() => pickBest(m.b)}
				in:scale={{ duration: reduced ? 0 : 420, delay: m.n * 90, start: 0.4, easing: cubicOut }}
			>
				<span>{m.n + 1}</span>
			</button>
		{/each}

		<!-- hover ghost -->
		{#if readout && hoverI !== null && dragKind === null}
			<span class="ghost" style:transform="translateX({readout.lineX}px)" style:top="{geo.top}px" style:bottom="{geo.axis}px" aria-hidden="true"></span>
		{/if}

		<!-- playhead -->
		<div
			class="ph"
			class:hidden={!phVisible}
			class:scrubbing={dragKind === 'scrub'}
			class:playing={app.playing}
			style:transform="translateX({phX}px)"
			style:--top="{geo.top}px"
			style:--axis="{geo.axis}px"
		>
			<span class="line" aria-hidden="true"></span>
			{#key snapPulse}
				<span class="pulse" aria-hidden="true"></span>
			{/key}
			<div
				class="knob"
				role="slider"
				tabindex="0"
				aria-label={t.time}
				aria-valuemin={app.win.i0}
				aria-valuemax={app.win.i1 - 1}
				aria-valuenow={Math.round(app.t)}
				aria-valuetext={sr}
				aria-describedby="tl-keys"
				onpointerdown={(e) => begin(e, 'scrub')}
				onkeydown={keyPlayhead}
				onfocus={() => (phFocus = true)}
				onblur={() => (phFocus = false)}
			></div>
		</div>
		<span id="tl-keys" class="sr-only">{t.keysHint}</span>

		<!-- readout -->
		{#if readout}
			<div class="bubble glass" style:transform="translateX({readout.x}px) translateX(-50%)" aria-hidden="true" transition:fade={{ duration: 140 }}>
				<div class="bdate mono">{readout.date}</div>
				{#each readout.rows as r (r.id)}
					<div class="brow">
						<span class="bid num" style:color={r.color}>{r.id}</span>
						<span class="dot sun" class:off={!r.sun}></span>
						<span class="bval">{sunText(r.sun)}</span>
						<span class="dot earth" class:off={!r.earth}></span>
						<span class="bval">{r.earth === null ? '—' : r.earth ? t.earthVisible : t.earthHidden}</span>
					</div>
				{/each}
				<div class="bfoot">{COMMON[app.lang].heightLabel}: {app.heightM} {t.m}</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.strip {
		position: relative;
		display: flex;
		height: 100%;
		min-height: 0;
		--gw: 26px;
	}
	.strip.mobile {
		--gw: 18px;
	}
	.gutter {
		position: relative;
		width: var(--gw);
		flex: none;
	}
	.badge {
		position: absolute;
		left: 0;
		top: 0;
		width: 17px;
		height: 17px;
		margin-top: -8.5px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-family: var(--font-display);
		font-size: 10px;
		font-weight: 700;
		color: #0b0e14;
		background: var(--site-a);
		box-shadow: 0 0 12px rgba(255, 255, 255, 0.25);
		transition: transform var(--dur) var(--ease-out);
	}
	.badge.b {
		background: var(--site-b);
		box-shadow: 0 0 12px rgba(196, 155, 255, 0.35);
	}
	.mobile .badge {
		width: 14px;
		height: 14px;
		margin-top: -7px;
		font-size: 9px;
	}
	.plot {
		position: relative;
		flex: 1;
		min-width: 0;
		height: 100%;
		touch-action: none;
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
	}
	.plot.dragging {
		cursor: ew-resize;
	}
	.plot.grabbing {
		cursor: grabbing;
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}

	/* ---------- brush */
	.brush {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		will-change: transform, width;
		pointer-events: none;
	}
	.frame {
		position: absolute;
		top: calc(var(--lane) + 0px);
		bottom: calc(var(--axis) + 0px);
		left: 0;
		right: 0;
		border-radius: 6px;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.28),
			0 0 0 1px rgba(0, 0, 0, 0.25),
			0 0 28px rgba(255, 255, 255, 0.05);
		transition: box-shadow var(--dur) var(--ease-out);
	}
	.brush.active .frame {
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.55),
			0 0 0 1px rgba(0, 0, 0, 0.3),
			0 0 30px rgba(255, 255, 255, 0.12);
	}
	.pill {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: calc(var(--lane) - 3px);
		min-width: 14px;
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 0 8px;
		border-radius: var(--radius-pill);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.07));
		border: 1px solid rgba(255, 255, 255, 0.2);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
		cursor: grab;
		overflow: hidden;
		transition:
			background var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}
	.pill:hover,
	.brush.active .pill {
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.11));
		border-color: rgba(255, 255, 255, 0.34);
	}
	.brush.active .pill {
		cursor: grabbing;
	}
	.pill:focus-visible {
		outline-offset: 1px;
		border-radius: var(--radius-pill);
	}
	.ptext {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.01em;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-variant-numeric: tabular-nums;
	}
	.mobile .ptext {
		font-size: 9.5px;
	}
	.grip {
		flex: none;
		width: 6px;
		height: 6px;
		opacity: 0.55;
		background: radial-gradient(circle, #fff 0.9px, transparent 1.1px) 0 0 / 3px 3px;
	}
	.handle {
		position: absolute;
		top: var(--lane);
		bottom: var(--axis);
		width: 18px;
		pointer-events: auto;
		cursor: ew-resize;
		display: grid;
		place-items: center;
		touch-action: none;
	}
	.handle.l {
		left: -9px;
	}
	.handle.r {
		right: -9px;
	}
	.handle i {
		width: 4px;
		height: min(70%, 22px);
		border-radius: 3px;
		background: #fff;
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.35),
			0 0 10px rgba(255, 255, 255, 0.5);
		transition:
			transform var(--dur) var(--ease-spring),
			height var(--dur) var(--ease-spring);
	}
	.handle:hover i,
	.handle:focus-visible i {
		transform: scaleX(1.5);
		height: min(90%, 30px);
	}
	.handle:focus-visible {
		outline: none;
	}
	.handle:focus-visible i {
		box-shadow:
			0 0 0 2px var(--earth),
			0 0 12px rgba(92, 200, 255, 0.6);
	}
	.brush.hint .handle i {
		animation: hint 0.8s var(--ease-in-out) 2;
	}
	@keyframes hint {
		50% {
			transform: scaleX(1.8) scaleY(1.25);
			box-shadow:
				0 0 0 1px rgba(0, 0, 0, 0.35),
				0 0 18px rgba(255, 255, 255, 0.9);
		}
	}
	@media (pointer: coarse) {
		.handle {
			width: 30px;
		}
		.handle.l {
			left: -15px;
		}
		.handle.r {
			right: -15px;
		}
	}

	/* ---------- longest night */
	.night {
		position: absolute;
		left: 0;
		top: 0;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 18px;
		padding: 0 7px 0 5px;
		border-radius: var(--radius-pill);
		font-size: 10.5px;
		font-weight: 600;
		white-space: nowrap;
		color: #e9e4ff;
		background: rgba(26, 22, 52, 0.86);
		border: 1px solid rgba(206, 196, 255, 0.55);
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
		pointer-events: none;
		font-variant-numeric: tabular-nums;
	}
	.night svg {
		width: 10px;
		height: 10px;
		fill: #cfc4ff;
	}
	.night.tiny {
		height: 12px;
		font-size: 9px;
		padding: 0 5px 0 4px;
		gap: 3px;
	}
	.night.tiny svg {
		width: 8px;
		height: 8px;
	}
	.mobile .night:not(.tiny) {
		height: 15px;
		font-size: 9.5px;
	}

	/* ---------- best windows */
	.best {
		position: absolute;
		left: 0;
		bottom: 0;
		display: grid;
		place-items: center;
		border-radius: var(--radius-pill);
		background: linear-gradient(180deg, #b7f2c2, var(--both));
		color: #08210f;
		font-family: var(--font-display);
		font-size: 9.5px;
		font-weight: 700;
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.4),
			0 0 14px rgba(155, 231, 168, 0.55);
		transition:
			filter var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
		z-index: 2;
	}
	.best:hover {
		filter: brightness(1.12);
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.4),
			0 0 22px rgba(155, 231, 168, 0.9);
	}
	.best:focus-visible {
		border-radius: var(--radius-pill);
	}

	/* ---------- hover ghost */
	.ghost {
		position: absolute;
		left: -0.5px;
		width: 1px;
		background: rgba(255, 255, 255, 0.4);
		pointer-events: none;
	}

	/* ---------- playhead */
	.ph {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 0;
		z-index: 3;
		will-change: transform;
		pointer-events: none;
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.ph.hidden {
		opacity: 0;
	}
	.ph .line {
		position: absolute;
		left: -1px;
		width: 2px;
		top: calc(var(--top) - 4px);
		bottom: calc(var(--axis) - 2px);
		border-radius: 2px;
		background: linear-gradient(180deg, #fff, rgba(255, 255, 255, 0.75));
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.35),
			0 0 10px rgba(255, 255, 255, 0.55);
	}
	.knob {
		position: absolute;
		left: -14px;
		top: calc(var(--top) - 18px);
		width: 28px;
		height: 28px;
		pointer-events: auto;
		cursor: grab;
		touch-action: none;
		border-radius: 50%;
	}
	.knob::before {
		content: '';
		position: absolute;
		inset: 8px;
		border-radius: 50%;
		background: #fff;
		box-shadow:
			0 0 0 1.5px rgba(0, 0, 0, 0.45),
			0 0 14px rgba(255, 255, 255, 0.7);
		transition: transform var(--dur) var(--ease-spring);
	}
	.knob:hover::before,
	.ph.scrubbing .knob::before {
		transform: scale(1.3);
	}
	.ph.scrubbing .knob {
		cursor: grabbing;
	}
	.ph.playing .knob::after {
		content: '';
		position: absolute;
		inset: 6px;
		border-radius: 50%;
		border: 1.5px solid var(--sun);
		animation: ring 1.6s var(--ease-out) infinite;
	}
	@keyframes ring {
		from {
			transform: scale(0.8);
			opacity: 0.9;
		}
		to {
			transform: scale(2);
			opacity: 0;
		}
	}
	.knob:focus-visible {
		outline: none;
	}
	.knob:focus-visible::before {
		box-shadow:
			0 0 0 2px var(--earth),
			0 0 16px rgba(92, 200, 255, 0.8);
	}
	.pulse {
		position: absolute;
		left: -9px;
		top: calc(var(--top) - 13px);
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1.5px solid rgba(214, 204, 255, 0.9);
		opacity: 0;
		animation: snap 420ms var(--ease-out);
	}
	@keyframes snap {
		from {
			transform: scale(0.6);
			opacity: 1;
		}
		to {
			transform: scale(1.9);
			opacity: 0;
		}
	}

	/* ---------- readout bubble */
	.bubble {
		position: absolute;
		left: 0;
		bottom: calc(100% + 10px);
		padding: 7px 10px 8px;
		border-radius: var(--radius-sm);
		background: var(--glass-strong);
		pointer-events: none;
		white-space: nowrap;
		z-index: 5;
		display: grid;
		gap: 3px;
		min-width: 170px;
	}
	.bdate {
		font-size: 11px;
		color: var(--text);
	}
	.brow {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		color: var(--text-2);
	}
	.bid {
		width: 12px;
		font-weight: 700;
		font-size: 11px;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex: none;
	}
	.dot.sun {
		background: var(--sun);
		box-shadow: 0 0 6px var(--sun);
	}
	.dot.earth {
		background: var(--earth);
		box-shadow: 0 0 6px var(--earth);
		margin-left: 4px;
	}
	.dot.off {
		background: #3a4152;
		box-shadow: none;
	}
	.bval {
		font-variant-numeric: tabular-nums;
	}
	.bfoot {
		margin-top: 2px;
		font-size: 10px;
		color: var(--text-3);
	}
	@media (max-width: 767px) {
		.bubble {
			bottom: auto;
			top: calc(100% + 10px);
		}
	}
</style>
