<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Planner charts (uPlot): Sun elevation vs horizon, visible solar disk, Earth elevation
     vs horizon + margin. Site B is overlaid when comparing. The time cursor is shared
     with app.t both ways: press / drag / arrow keys on the chart move app.t, and app.t
     (playback, timeline) moves the marker here. -->
<script lang="ts">
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import { untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app } from '#lib/state.svelte.ts';
	import { timeOf } from '#lib/engine/visibility.ts';
	import { fmtDateTime, fmtNum } from '#lib/i18n.ts';
	import { buildPack, makeOptions, readTheme, type Metric } from './chart.ts';
	import { LOCALE, clamp } from './format.ts';

	const T = {
		en: {
			metrics: { sun: 'Sun elevation', disk: 'Sunlight', earth: 'Earth elevation' },
			short: { sun: 'Sun', disk: 'Light', earth: 'Earth' },
			hints: {
				sun: 'Sun centre vs the real horizon under it. Filled gap = the Sun is above the terrain.',
				disk: 'Share of the solar disk above the terrain. 100 % = full Sun, 0 % = night.',
				earth: 'Earth centre vs the horizon under it plus the antenna margin. Filled = Earth in view.'
			},
			line: { sun: 'Sun elevation', disk: 'visible solar disk', earth: 'Earth elevation' },
			limit: { sun: 'horizon under the Sun', disk: '', earth: 'horizon + margin' },
			fillLbl: { sun: 'Sun above the terrain', disk: '100 % = full Sun, 0 % = night', earth: 'Earth in view' },
			elev: 'elevation',
			horizon: 'horizon',
			limitShort: 'limit',
			visible: 'Visible',
			partial: 'Partly visible',
			hidden: 'Below horizon',
			inView: 'In view',
			notInView: 'Not in view',
			ofDisk: 'of the disk',
			cursor: 'Time cursor',
			axis: 'Time, UTC',
			chartLabel: 'Chart over the selected period. Press or drag to move the time cursor; arrow keys step one hour, Shift + arrow one day.',
			noData: 'No horizon data for this site.'
		},
		uk: {
			metrics: { sun: 'Висота Сонця', disk: 'Сонячне світло', earth: 'Висота Землі' },
			short: { sun: 'Сонце', disk: 'Світло', earth: 'Земля' },
			hints: {
				sun: 'Центр Сонця проти справжнього горизонту під ним. Заливка — Сонце над рельєфом.',
				disk: 'Частка сонячного диска над рельєфом. 100 % — повне Сонце, 0 % — ніч.',
				earth: 'Центр Землі проти горизонту під нею плюс запас антени. Заливка — Земля видна.'
			},
			line: { sun: 'висота Сонця', disk: 'видимий диск Сонця', earth: 'висота Землі' },
			limit: { sun: 'горизонт під Сонцем', disk: '', earth: 'горизонт + запас' },
			fillLbl: { sun: 'Сонце над рельєфом', disk: '100 % — повне Сонце, 0 % — ніч', earth: 'Земля видна' },
			elev: 'висота',
			horizon: 'горизонт',
			limitShort: 'межа',
			visible: 'Видно',
			partial: 'Видно частково',
			hidden: 'За горизонтом',
			inView: 'Видна',
			notInView: 'Не видна',
			ofDisk: 'диска',
			cursor: 'Курсор часу',
			axis: 'Час, UTC',
			chartLabel: 'Графік за вибраний період. Натисніть або протягніть, щоб пересунути курсор часу; стрілки — крок на годину, Shift + стрілка — на добу.',
			noData: 'Для цього місця немає даних горизонту.'
		}
	};
	const t = $derived(T[app.lang]);

	let { metric = $bindable<Metric>('sun') }: { metric?: Metric } = $props();
	const metrics: Metric[] = ['sun', 'disk', 'earth'];

	let host = $state<HTMLDivElement>();
	let size = $state({ w: 0, h: 0 });
	let hoverIdx = $state<number | null>(null);
	/** bumped by uPlot on ready / resize so the marker re-measures */
	let layout = $state({ left: 0, top: 0, width: 0, height: 0, v: 0 });
	let plot = $state.raw<uPlot | null>(null);
	/** flips once when the container is first measured; size changes alone only resize */
	const hasSize = $derived(size.w > 10 && size.h > 10);
	let scrubbing = $state(false);

	const pack = $derived.by(() => {
		const eph = app.eph;
		const a = app.viewA;
		if (!eph || !a || a.series.n < 2) return null;
		return buildPack(metric, eph, a, app.viewB, app.heightIndex, app.earthMarginDeg);
	});

	// ---- create / recreate the plot when the data or the language changes
	$effect(() => {
		const p = pack;
		const lang = app.lang;
		const el = host;
		if (!el || !p || !hasSize) return;
		const { w, h } = untrack(() => size);
		const tl = T[lang];
		const opts = makeOptions({
			pack: p,
			theme: readTheme(el),
			width: w,
			height: h,
			locale: LOCALE[lang],
			labels: { a: 'A', b: 'B', line: tl.line[p.metric], limit: tl.limit[p.metric] },
			onCursor: (idx) =>
				untrack(() => {
					if (!scrubbing) hoverIdx = idx;
				}),
			onLayout: (u) =>
				untrack(() => {
					layout = {
						left: u.over.offsetLeft,
						top: u.over.offsetTop,
						width: u.over.clientWidth,
						height: u.over.clientHeight,
						v: layout.v + 1
					};
				})
		});
		const u = new uPlot(opts, [p.xs, ...p.cols] as uPlot.AlignedData, el);
		plot = u;
		bindScrub(u);
		if (!prefersReducedMotion.current) {
			u.root.querySelector('canvas')?.animate(
				[
					{ clipPath: 'inset(0 100% 0 0)', opacity: 0.4 },
					{ clipPath: 'inset(0 0 0 0)', opacity: 1 }
				],
				{ duration: 820, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
			);
		}
		return () => {
			u.destroy();
			if (plot === u) plot = null;
		};
	});

	// ---- resize without recreating
	$effect(() => {
		const el = host;
		if (!el) return;
		const ro = new ResizeObserver(([e]) => {
			const w = Math.floor(e.contentRect.width);
			const h = Math.floor(e.contentRect.height);
			if (w === size.w && h === size.h) return;
			size = { w, h };
			if (plot && w > 10 && h > 10) plot.setSize({ width: w, height: h });
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	// ---- scrubbing: press/drag on the plot sets app.t
	function idxFromClientX(u: uPlot, clientX: number) {
		const eph = app.eph;
		if (!eph) return null;
		const r = u.over.getBoundingClientRect();
		const x = clamp(clientX - r.left, 0, r.width);
		const val = u.posToVal(x, 'x');
		return (val - eph.start_unix) / eph.step_s;
	}
	function setT(i: number | null) {
		if (i == null) return;
		app.t = clamp(i, app.win.i0, app.win.i1 - 1);
	}
	let resume = false;
	function bindScrub(u: uPlot) {
		const over = u.over;
		over.style.touchAction = 'pan-y';
		over.addEventListener('pointerdown', (e) => {
			if (e.button !== 0) return;
			scrubbing = true;
			hoverIdx = null;
			// hold playback while the user drags the cursor, resume on release
			resume = app.playing;
			app.playing = false;
			over.setPointerCapture(e.pointerId);
			setT(idxFromClientX(u, e.clientX));
		});
		over.addEventListener('pointermove', (e) => {
			if (scrubbing) setT(idxFromClientX(u, e.clientX));
		});
		const end = (e: PointerEvent) => {
			if (!scrubbing) return;
			scrubbing = false;
			if (resume) app.playing = true;
			resume = false;
			if (over.hasPointerCapture(e.pointerId)) over.releasePointerCapture(e.pointerId);
		};
		over.addEventListener('pointerup', end);
		over.addEventListener('pointercancel', end);
		over.addEventListener('pointerleave', () => {
			if (!scrubbing) hoverIdx = null;
		});
	}

	/** ARIA radio group: arrow keys move the selection (roving tabindex) */
	function onChipKey(e: KeyboardEvent) {
		const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
		if (!d) return;
		e.preventDefault();
		const next = metrics[(metrics.indexOf(metric) + d + metrics.length) % metrics.length];
		metric = next;
		(e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`[data-m="${next}"]`)?.focus();
	}

	function onKey(e: KeyboardEvent) {
		const step = e.shiftKey ? 24 : 1;
		let next: number | null = null;
		if (e.key === 'ArrowRight') next = Math.floor(app.t) + step;
		else if (e.key === 'ArrowLeft') next = Math.ceil(app.t) - step;
		else if (e.key === 'Home') next = app.win.i0;
		else if (e.key === 'End') next = app.win.i1 - 1;
		else if (e.key === 'PageUp') next = app.t + 24 * 7;
		else if (e.key === 'PageDown') next = app.t - 24 * 7;
		if (next == null) return;
		e.preventDefault();
		setT(next);
	}

	// ---- marker for app.t (pure transform, no canvas redraw)
	const markerX = $derived.by(() => {
		void layout.v;
		void size.w;
		const eph = app.eph;
		if (!plot || !eph || !pack) return null;
		const x = eph.start_unix + app.t * eph.step_s;
		const px = plot.valToPos(x, 'x');
		if (!Number.isFinite(px) || px < -1 || px > layout.width + 1) return null;
		return layout.left + px;
	});

	// ---- readout at hover (preview) or at app.t
	const readK = $derived.by(() => {
		if (!pack) return 0;
		const n = pack.xs.length;
		const k = hoverIdx ?? Math.round(app.t) - pack.i0;
		return clamp(k, 0, n - 1);
	});
	const readTime = $derived(app.eph && pack ? fmtDateTime(timeOf(app.eph, pack.i0 + readK)) : '');

	interface Row {
		slot: 'A' | 'B';
		name: string;
		main: string;
		sub: string;
		state: string;
		on: boolean;
		partial: boolean;
	}
	const rows = $derived.by<Row[]>(() => {
		const p = pack;
		if (!p) return [];
		const k = readK;
		const out: Row[] = [];
		const views = p.compare && app.viewB ? [app.viewA!, app.viewB] : [app.viewA!];
		views.forEach((v, j) => {
			const slot = j === 0 ? 'A' : 'B';
			const name = v.site.name[app.lang];
			const s = v.series;
			if (p.metric === 'disk') {
				const f = s.sunFrac[k];
				out.push({ slot, name, main: `${fmtNum(f * 100, 0)} %`, sub: t.ofDisk, state: f >= 1 ? t.visible : f > 0 ? t.partial : t.hidden, on: f > 0, partial: f > 0 && f < 1 });
			} else if (p.metric === 'sun') {
				const f = s.sunFrac[k];
				out.push({
					slot,
					name,
					main: `${fmtNum(s.sunEl[k], 2)}°`,
					sub: `${t.horizon} ${fmtNum(s.sunHorizon[k], 2)}°`,
					state: f >= 1 ? t.visible : f > 0 ? t.partial : t.hidden,
					on: f > 0,
					partial: f > 0 && f < 1
				});
			} else {
				const lim = p.cols[j * 2 + 1][k];
				const on = s.earthVis[k] === 1;
				out.push({ slot, name, main: `${fmtNum(s.earthEl[k], 2)}°`, sub: `${t.limitShort} ${fmtNum(lim, 2)}°`, state: on ? t.inView : t.notInView, on, partial: false });
			}
		});
		return out;
	});

	const accent = $derived(metric === 'earth' ? 'var(--earth)' : 'var(--sun)');
</script>

<div class="charts" style:--accent={accent}>
	<div class="bar">
		<div
			class="chips"
			role="radiogroup"
			tabindex="-1"
			aria-label={t.metrics.sun + ' / ' + t.metrics.disk + ' / ' + t.metrics.earth}
			onkeydown={onChipKey}
		>
			{#each metrics as m (m)}
				<button
					class="chip"
					class:on={metric === m}
					class:earth={m === 'earth'}
					role="radio"
					aria-checked={metric === m}
					tabindex={metric === m ? 0 : -1}
					data-m={m}
					onclick={() => (metric = m)}
				>
					<span class="dot" aria-hidden="true"></span><span class="long">{t.metrics[m]}</span><span class="short" aria-hidden="true">{t.short[m]}</span>
				</button>
			{/each}
		</div>
		<p class="legend" title={t.hints[metric]}>
			<span><i class="ln"></i>{t.line[metric]}</span>
			{#if metric !== 'disk'}<span><i class="ln dash"></i>{t.limit[metric]}</span>{/if}
			<span><i class="sw"></i>{t.fillLbl[metric]}</span>
		</p>
		<p class="sr-only" id="pl-chart-hint">{t.hints[metric]}</p>
	</div>

	{#if !pack}
		<div class="empty">{t.noData}</div>
	{:else}
		<div class="body">
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="plotwrap"
				role="slider"
				tabindex="0"
				aria-label={t.chartLabel}
				aria-describedby="pl-chart-hint"
				aria-valuemin={app.win.i0}
				aria-valuemax={app.win.i1 - 1}
				aria-valuenow={Math.round(app.t)}
				aria-valuetext={app.eph ? fmtDateTime(timeOf(app.eph, Math.round(app.t))) : ''}
				onkeydown={onKey}
				class:scrubbing
			>
				<div class="plot" bind:this={host}></div>
				{#if markerX != null}
					<div
						class="marker"
						class:hovering={hoverIdx != null}
						style:transform="translate3d({markerX}px,0,0)"
						style:top="{layout.top}px"
						style:height="{layout.height}px"
						aria-hidden="true"
					>
						<span class="knob"></span>
					</div>
				{/if}
				<span class="utc mono" aria-hidden="true">UTC</span>
			</div>

			<aside class="readout" aria-live="off">
				<div class="rtime mono" class:preview={hoverIdx != null}>{readTime}</div>
				{#each rows as r (r.slot)}
					<div class="row" class:b={r.slot === 'B'}>
						<div class="who">
							<span class="tag" class:tb={r.slot === 'B'}>{r.slot}</span>
							<span class="name" title={r.name}>{r.name}</span>
						</div>
						<span class="state" class:on={r.on} class:partial={r.partial}>{r.state}</span>
						<div class="vals">
							<span class="main num">{r.main}</span>
							<span class="sub">{r.sub}</span>
						</div>
					</div>
				{/each}
			</aside>
		</div>
	{/if}
</div>

<style>
	.charts {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		gap: 8px;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}
	.chips {
		display: flex;
		gap: 4px;
		flex: none;
	}
	.chip {
		--c: var(--sun);
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 28px;
		padding: 0 11px;
		border-radius: var(--radius-pill);
		font-size: 12px;
		color: var(--text-2);
		border: 1px solid transparent;
		transition:
			color var(--dur-fast) var(--ease-out),
			background var(--dur) var(--ease-out),
			border-color var(--dur) var(--ease-out);
	}
	.short {
		display: none;
	}
	.chip.earth {
		--c: var(--earth);
	}
	.chip:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.04);
	}
	.chip.on {
		color: var(--text);
		background: color-mix(in srgb, var(--c) 14%, transparent);
		border-color: color-mix(in srgb, var(--c) 38%, transparent);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
		opacity: 0.45;
		transform: scale(0.8);
		transition:
			transform var(--dur) var(--ease-spring),
			opacity var(--dur) var(--ease-out),
			box-shadow var(--dur) var(--ease-out);
	}
	.chip.on .dot {
		opacity: 1;
		transform: scale(1);
		box-shadow: 0 0 10px var(--c);
	}
	.body {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 216px;
		gap: 14px;
	}
	.plotwrap {
		position: relative;
		min-width: 0;
		min-height: 0;
		border-radius: var(--radius-sm);
		cursor: crosshair;
	}
	.plotwrap:focus-visible {
		outline-offset: 4px;
	}
	.plotwrap.scrubbing {
		cursor: ew-resize;
	}
	.plot {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	.plot :global(.uplot) {
		font-family: var(--font-mono);
	}
	.plot :global(.u-cursor-x) {
		border-right: 1px dashed rgba(255, 255, 255, 0.28);
	}
	.plot :global(.u-over) {
		cursor: inherit;
	}
	.marker {
		position: absolute;
		left: 0;
		width: 0;
		pointer-events: none;
		will-change: transform;
		border-left: 1.5px solid var(--accent);
		margin-left: -0.75px;
		filter: drop-shadow(0 0 6px var(--accent));
		transition: opacity var(--dur) var(--ease-out);
	}
	.marker.hovering {
		opacity: 0.55;
	}
	.knob {
		position: absolute;
		top: -5px;
		left: -5.75px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow:
			0 0 0 3px rgba(4, 6, 10, 0.9),
			0 0 14px var(--accent);
	}
	.scrubbing .knob {
		animation: pulse 900ms var(--ease-in-out) infinite alternate;
	}
	@keyframes pulse {
		to {
			transform: scale(1.35);
		}
	}
	.utc {
		position: absolute;
		right: 4px;
		bottom: 2px;
		font-size: 9.5px;
		letter-spacing: 0.08em;
		color: var(--text-3);
		pointer-events: none;
	}
	.readout {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		padding-left: 14px;
		border-left: 1px solid var(--hairline);
		overflow-y: auto;
		scrollbar-width: none;
	}
	.rtime {
		font-size: 11px;
		color: var(--text-2);
		transition: color var(--dur-fast) var(--ease-out);
	}
	.rtime.preview {
		color: var(--text-3);
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'who who' 'main state' 'sub sub';
		align-items: center;
		gap: 1px 8px;
		padding: 7px 10px 8px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid var(--hairline);
		flex: none;
	}
	.vals {
		display: contents;
	}
	.who {
		grid-area: who;
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		margin-bottom: 2px;
	}
	.tag {
		flex: none;
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		border-radius: 5px;
		font-size: 10px;
		font-weight: 600;
		background: var(--site-a);
		color: #0a0e16;
	}
	.tag.tb {
		background: var(--site-b);
	}
	.name {
		font-size: 11.5px;
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.main {
		grid-area: main;
		font-size: 19px;
		line-height: 1.15;
		font-weight: 500;
		color: var(--text);
	}
	.sub {
		grid-area: sub;
		font-size: 11px;
		color: var(--text-3);
		white-space: nowrap;
	}
	.state {
		grid-area: state;
		align-self: center;
		font-size: 10.5px;
		padding: 2px 7px;
		border-radius: var(--radius-pill);
		color: var(--text-3);
		background: rgba(255, 255, 255, 0.04);
		white-space: nowrap;
		transition:
			color var(--dur) var(--ease-out),
			background var(--dur) var(--ease-out);
	}
	.state.on {
		color: #0a0e16;
		background: var(--accent);
	}
	.state.partial {
		background: color-mix(in srgb, var(--accent) 55%, transparent);
	}
	.legend {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 3px 14px;
		min-width: 0;
		font-size: 11px;
		color: var(--text-3);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.ln {
		width: 16px;
		height: 0;
		border-top: 2px solid var(--accent);
	}
	.ln.dash {
		border-top: 1.5px dashed rgba(255, 255, 255, 0.55);
	}
	.sw {
		width: 12px;
		height: 10px;
		border-radius: 2px;
		background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 60%, transparent), color-mix(in srgb, var(--accent) 15%, transparent));
	}
	.empty {
		flex: 1;
		display: grid;
		place-content: center;
		color: var(--text-3);
		font-size: 13px;
	}

	@container planner (max-width: 640px) {
		.bar {
			flex-wrap: wrap;
			gap: 6px 12px;
		}
		.body {
			grid-template-columns: 1fr;
			grid-template-rows: auto minmax(0, 1fr);
			gap: 6px;
		}
		.readout {
			order: -1;
			flex-direction: row;
			align-items: center;
			flex-wrap: nowrap;
			padding: 0;
			border: 0;
			gap: 6px;
			overflow-x: auto;
			scrollbar-width: none;
		}
		.rtime {
			display: none;
		}
		.row {
			grid-template-columns: auto auto auto;
			grid-template-areas: 'who main state';
			padding: 4px 8px;
			gap: 6px;
		}
		.who {
			margin: 0;
		}
		.name,
		.sub {
			display: none;
		}
		.main {
			font-size: 14px;
		}
	}
	@container planner (max-width: 420px) {
		.long {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
		}
		.short {
			display: inline;
		}
		.chip {
			padding: 0 9px;
			font-size: 11.5px;
		}
		.sub {
			display: none;
		}
	}
</style>
