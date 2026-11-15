<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Site card: right glass panel on desktop, bottom sheet on phones. Fixed head with the site and
     the three big numbers; scrolling body with explanations, compare, controls, live readout and
     the validation panel. All numbers come from app.viewA / app.viewB (engine, not re-derived). -->
<script lang="ts">
	import { fade, fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app } from '#lib/state.svelte.ts';
	import { COMMON, fmtDateTime, fmtNum } from '#lib/i18n.ts';
	import { timeOf } from '#lib/engine/visibility.ts';
	import { T } from '#lib/card/strings.ts';
	import { coordText, deg, pctDigits, type MetricKey } from '#lib/card/format.ts';
	import Sheet from '#lib/card/Sheet.svelte';
	import SiteHeader from '#lib/card/SiteHeader.svelte';
	import SiteDetails from '#lib/card/SiteDetails.svelte';
	import Metrics from '#lib/card/Metrics.svelte';
	import HeightControl from '#lib/card/HeightControl.svelte';
	import MarginControl from '#lib/card/MarginControl.svelte';
	import NowReadout from '#lib/card/NowReadout.svelte';
	import DetailSquare from '#lib/card/DetailSquare.svelte';
	import QuickWindow from '#lib/card/QuickWindow.svelte';
	import ValidationPanel from './ValidationPanel.svelte';

	const t = $derived(T[app.lang]);
	const c = $derived(COMMON[app.lang]);
	const mo = (d: number) => (prefersReducedMotion.current ? 0 : d);
	const teacher = $derived(app.mode === 'teacher');
	const planner = $derived(app.mode === 'planner');

	let focus = $state<MetricKey>('sun');
	let collapseTick = $state(0);
	let validationOpen = $state(false);

	// picking B: collapse the sheet so the map is free; once B is chosen go back to normal picking
	let lastB: string | null = app.siteBId;
	$effect(() => {
		const b = app.siteBId;
		if (b !== lastB) {
			lastB = b;
			if (b && app.pickSlot === 'B') app.pickSlot = 'A';
		}
	});
	function startCompare() {
		app.pickSlot = 'B';
		collapseTick++;
	}
	function cancelCompare() {
		app.pickSlot = 'A';
	}
	function removeB() {
		app.siteBId = null;
		app.pickSlot = 'A';
	}
	function swap() {
		const a = app.siteAId;
		const b = app.siteBId;
		if (!b) return;
		app.siteBId = null;
		app.siteAId = b;
		app.siteBId = a;
		lastB = a;
		// best windows were found for the old site A
		app.best = [];
	}

	const why = $derived(
		focus === 'sun'
			? { color: 'var(--sun)', title: c.sun, text: t.whySun, extra: '' }
			: focus === 'earth'
				? { color: 'var(--earth)', title: c.earth, text: t.whyEarth, extra: '' }
				: { color: '#8f8ac9', title: c.night, text: t.whyNight, extra: t.ofLunarDay }
	);

	const A = $derived(app.viewA?.stats ?? null);
	const B = $derived(app.viewB?.stats ?? null);
	const digits = $derived(pctDigits());
	const nightStart = $derived(app.eph && A && A.longestNightH > 0 ? fmtDateTime(timeOf(app.eph, A.longestNightStart)) : '—');
	const nightStartB = $derived(app.eph && B && B.longestNightH > 0 ? fmtDateTime(timeOf(app.eph, B.longestNightStart)) : '—');
</script>

<Sheet
	label={t.panel}
	collapse={collapseTick}
	expandLabel={t.expand}
	moreLabel={t.moreBelow}
	collapseLabel={t.collapse}
>
	{#snippet head()}
		<div class="head" class:busy={app.pointBusy}>
			{#if app.pointBusy}
				<div class="progress" aria-hidden="true" transition:fade={{ duration: mo(200) }}></div>
			{/if}

			{#if app.siteA}
				<div class="who">
					<SiteHeader site={app.siteA} />
					{#if app.pointBusy}
						<div class="skel-over" role="status" transition:fade={{ duration: mo(200) }}>
							<span class="sk w60"></span>
							<span class="sk w40"></span>
							<span class="status">{t.busy}</span>
						</div>
					{/if}
				</div>
			{:else}
				<div class="skel" role="status" aria-label={t.busy}>
					<span class="sk w30"></span><span class="sk w60 tall"></span><span class="sk w40"></span>
				</div>
			{/if}

			{#if app.pointError}
				<div class="error" role="alert" transition:slide={{ duration: mo(260) }}>
					<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M8 4.6v4.2M8 11v.2" /></svg>
					<div>
						<b>{t.errorTitle}</b>
						<span>{app.pointError}</span>
					</div>
					<button class="x" onclick={() => (app.pointError = null)} aria-label={t.dismiss}>
						<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
					</button>
				</div>
			{/if}

			{#if app.viewA}
				<div class="metrics-wrap">
					<Metrics bind:focus selectable={teacher} />
					<QuickWindow />
				</div>
				<DetailSquare part="head" />
			{:else}
				<div class="skel tiles" aria-hidden="true"><span></span><span></span><span></span></div>
			{/if}
		</div>
	{/snippet}

	<div class="body">
		{#if teacher}
			<div class="why" style:--c={why.color} transition:slide={{ duration: mo(320), easing: cubicOut }}>
				<span class="why-k">{t.whyTitle} · <b>{why.title}</b></span>
				{#key focus}
					<p in:fly={{ y: 8, duration: mo(360), easing: cubicOut }}>
						{why.text}
						{#if why.extra}<span class="why-x">{why.extra}.</span>{/if}
					</p>
				{/key}
				<div class="why-tabs" role="group" aria-label={t.why}>
					{#each ['sun', 'earth', 'night'] as const as k (k)}
						<button class:on={focus === k} aria-pressed={focus === k} onclick={() => (focus = k)} class="wt {k}">
							{k === 'sun' ? c.sun : k === 'earth' ? c.earth : c.night}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<DetailSquare part="body" />

		{#if A}
			<div class="secondary" class:grid={planner}>
				<div class="sec-item">
					<span class="k">{t.partial}</span>
					<span class="v num">
						{fmtNum(A.partialPct, digits)}%{#if B}<span class="vb"> / {fmtNum(B.partialPct, digits)}%</span>{/if}
					</span>
				</div>
				{#if planner}
					<div class="sec-item">
						<span class="k">{t.both}</span>
						<span class="v num">
							{fmtNum(A.bothPct, 1)}%{#if B}<span class="vb"> / {fmtNum(B.bothPct, 1)}%</span>{/if}
						</span>
					</div>
					<div class="sec-item">
						<span class="k">{t.maxSunEl}</span>
						<span class="v num">{deg(A.maxSunEl, 2)}{#if B}<span class="vb"> / {deg(B.maxSunEl, 2)}</span>{/if}</span>
					</div>
					<div class="sec-item">
						<span class="k">{t.nightStarts}</span>
						<span class="v mono small">{nightStart}</span>
						{#if B}<span class="v mono small vb">{nightStartB}</span>{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- compare -->
		<div class="compare">
			{#if app.siteB}
				<div class="bsite" in:fly={{ y: 8, duration: mo(380), easing: cubicOut }}>
					<span class="slot b" aria-hidden="true">B</span>
					<div class="bname">
						<span class="nm">{app.siteB.name[app.lang]}</span>
						<span class="co mono">{coordText(app.siteB)}</span>
					</div>
					<button class="icon" onclick={swap} aria-label={t.swap} title={t.swap}>
						<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2v11M2.5 10.5 5 13l2.5-2.5M11 14V3M8.5 5.5 11 3l2.5 2.5" /></svg>
					</button>
					<button class="icon" onclick={startCompare} aria-label={t.changeB} title={t.changeB}>
						<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 2.5 13.5 4.5 6 12l-3 1 1-3z" /></svg>
					</button>
					<button class="icon danger" onclick={removeB} aria-label={t.removeB} title={t.removeB}>
						<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
					</button>
				</div>
			{/if}
			{#if app.pickSlot === 'B'}
				<div class="picking" role="status" transition:slide={{ duration: mo(280), easing: cubicOut }}>
					<span class="pulse" aria-hidden="true"></span>
					<span class="ph">{t.compareHint}</span>
					<button class="ghost" onclick={cancelCompare}>{t.cancel}</button>
				</div>
			{:else if !app.siteB}
				<button class="cta" onclick={startCompare}>
					<span class="plus" aria-hidden="true">
						<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>
					</span>
					<span class="cta-t">
						<b>{t.compare}</b>
						<small>{t.compareHint}</small>
					</span>
				</button>
			{/if}
		</div>

		<!-- controls -->
		<section class="block" aria-label={t.controls}>
			<HeightControl />
			{#if teacher}
				<p class="teach" transition:slide={{ duration: mo(260) }}>{t.whyHeight}</p>
			{/if}
			<div class="divider"></div>
			<MarginControl />
		</section>

		<section class="block">
			<NowReadout />
		</section>

		{#if app.siteA && (app.siteA.note || app.siteA.source || app.siteA.edge_warning)}
			<SiteDetails site={app.siteA} />
		{/if}

		{#if teacher || planner}
			<div transition:slide={{ duration: mo(300) }}>
				<ValidationPanel bind:open={validationOpen} />
			</div>
		{/if}
	</div>
</Sheet>

<style>
	.head {
		position: relative;
		display: grid;
		gap: 14px;
		padding: 18px 18px 14px;
	}
	.progress {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		overflow: hidden;
		border-radius: 2px;
	}
	.progress::after {
		content: '';
		position: absolute;
		inset: 0;
		width: 40%;
		background: linear-gradient(90deg, transparent, var(--site-b), transparent);
		animation: sweep 1.1s var(--ease-in-out) infinite;
	}
	@keyframes sweep {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(250%);
		}
	}
	.who {
		position: relative;
	}
	.skel-over {
		position: absolute;
		inset: -4px;
		display: grid;
		align-content: center;
		gap: 6px;
		padding: 4px;
		border-radius: var(--radius-sm);
		background: rgba(10, 14, 22, 0.97);
	}
	.status {
		font-size: 11.5px;
		color: var(--site-b);
	}
	.busy .metrics-wrap {
		opacity: 0.35;
		filter: saturate(0.4);
		transition: opacity var(--dur), filter var(--dur);
	}
	.metrics-wrap {
		transition: opacity var(--dur), filter var(--dur);
	}
	.skel {
		display: grid;
		gap: 8px;
	}
	.sk {
		display: block;
		height: 10px;
		border-radius: 5px;
	}
	.sk,
	.skel.tiles span {
		background: linear-gradient(90deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
		background-size: 200% 100%;
		animation: shimmer 1.3s linear infinite;
	}
	.sk.tall {
		height: 20px;
	}
	.w30 {
		width: 30%;
	}
	.w40 {
		width: 40%;
	}
	.w60 {
		width: 60%;
	}
	.skel.tiles {
		grid-template-columns: repeat(3, 1fr);
	}
	.skel.tiles span {
		height: 140px;
		border-radius: var(--radius);
	}
	@keyframes shimmer {
		to {
			background-position: -200% 0;
		}
	}
	.error {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 10px 10px 10px 12px;
		border-radius: var(--radius-sm);
		background: rgba(255, 107, 107, 0.09);
		border: 1px solid rgba(255, 107, 107, 0.3);
		font-size: 12px;
		color: #ffc4c4;
	}
	.error > div {
		flex: 1;
		display: grid;
		gap: 2px;
	}
	.error b {
		color: #ffdede;
	}
	.error svg,
	.icon svg,
	.x svg,
	.plus svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
		flex: none;
	}
	.error > svg {
		color: var(--danger);
	}
	.x {
		display: grid;
		place-content: center;
		width: 26px;
		height: 26px;
		border-radius: 8px;
		color: #ffc4c4;
	}
	.x:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	/* ---- body ---- */
	.body {
		display: grid;
		gap: 14px;
		padding: 2px 18px 20px;
	}
	.why {
		position: relative;
		display: grid;
		gap: 6px;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: linear-gradient(135deg, color-mix(in srgb, var(--c) 10%, transparent), rgba(255, 255, 255, 0.02));
		border: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
		transition: background var(--dur), border-color var(--dur);
	}
	.why-k {
		font-size: 11px;
		color: var(--text-3);
	}
	.why-k b {
		color: var(--c);
		font-weight: 600;
		transition: color var(--dur);
	}
	.why p {
		margin: 0;
		font-size: 13px;
		line-height: 1.55;
		color: var(--text-2);
	}
	.why-x {
		display: block;
		margin-top: 4px;
		font-size: 11.5px;
		color: var(--text-3);
	}
	.why-tabs {
		display: flex;
		gap: 4px;
		margin-top: 2px;
	}
	.wt {
		padding: 3px 9px;
		border-radius: var(--radius-pill);
		font-size: 11px;
		color: var(--text-3);
		border: 1px solid var(--hairline);
		transition: color var(--dur-fast), background var(--dur-fast), border-color var(--dur-fast);
	}
	.wt:hover {
		color: var(--text);
	}
	.wt.on.sun {
		color: var(--sun);
		border-color: var(--sun-dim);
		background: rgba(255, 181, 71, 0.08);
	}
	.wt.on.earth {
		color: var(--earth);
		border-color: var(--earth-dim);
		background: rgba(92, 200, 255, 0.08);
	}
	.wt.on.night {
		color: #b3afe6;
		border-color: rgba(143, 138, 201, 0.4);
		background: rgba(143, 138, 201, 0.1);
	}

	.secondary {
		display: grid;
		gap: 8px;
	}
	.secondary.grid {
		grid-template-columns: 1fr 1fr;
	}
	.sec-item {
		display: grid;
		align-content: start;
		gap: 1px;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid var(--hairline);
	}
	.secondary:not(.grid) .sec-item {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.sec-item .k {
		font-size: 11.5px;
		color: var(--text-3);
	}
	.sec-item .v {
		font-size: 15px;
		font-weight: 600;
		color: var(--text);
	}
	.sec-item .v.small {
		font-size: 11px;
		font-weight: 500;
		color: var(--text-2);
	}
	.vb {
		color: var(--site-b) !important;
	}

	/* ---- compare ---- */
	.compare {
		display: grid;
		gap: 8px;
	}
	.cta {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 10px 12px;
		border-radius: var(--radius);
		text-align: left;
		border: 1px dashed rgba(196, 155, 255, 0.35);
		background: rgba(196, 155, 255, 0.04);
		transition:
			background var(--dur-fast),
			border-color var(--dur-fast),
			transform var(--dur) var(--ease-spring);
	}
	.cta:hover {
		background: rgba(196, 155, 255, 0.09);
		border-color: rgba(196, 155, 255, 0.6);
		transform: translateY(-1px);
	}
	.cta:active {
		transform: scale(0.985);
	}
	.plus {
		display: grid;
		place-content: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		color: #0a0e16;
		background: var(--site-b);
		box-shadow: 0 0 16px rgba(196, 155, 255, 0.45);
		transition: transform var(--dur) var(--ease-spring);
	}
	.cta:hover .plus {
		transform: rotate(90deg);
	}
	.cta-t {
		display: grid;
	}
	.cta-t b {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--site-b);
	}
	.cta-t small {
		font-size: 11.5px;
		color: var(--text-3);
	}
	.picking {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: var(--radius);
		background: rgba(196, 155, 255, 0.1);
		border: 1px solid rgba(196, 155, 255, 0.4);
	}
	.pulse {
		position: relative;
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--site-b);
	}
	.pulse::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: var(--site-b);
		animation: ping 1.4s var(--ease-out) infinite;
	}
	@keyframes ping {
		to {
			transform: scale(3);
			opacity: 0;
		}
	}
	.ph {
		flex: 1;
		font-size: 12.5px;
		color: var(--text);
	}
	.ghost {
		padding: 5px 10px;
		border-radius: var(--radius-pill);
		font-size: 12px;
		color: var(--text-2);
		border: 1px solid var(--glass-border-strong);
	}
	.ghost:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.06);
	}
	.bsite {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 8px 8px 10px;
		border-radius: var(--radius);
		background: linear-gradient(90deg, rgba(196, 155, 255, 0.1), rgba(196, 155, 255, 0.02));
		border: 1px solid rgba(196, 155, 255, 0.28);
	}
	.slot.b {
		flex: none;
		display: grid;
		place-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		font-size: 11px;
		font-weight: 700;
		background: var(--site-b);
		color: #0a0e16;
		box-shadow: 0 0 12px rgba(196, 155, 255, 0.5);
	}
	.bname {
		flex: 1;
		display: grid;
		min-width: 0;
	}
	.nm {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--site-b);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.co {
		font-size: 10.5px;
		color: var(--text-3);
	}
	.icon {
		display: grid;
		place-content: center;
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		color: var(--text-2);
		transition: background var(--dur-fast), color var(--dur-fast), transform var(--dur-fast) var(--ease-spring);
	}
	.icon:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.08);
	}
	.icon:active {
		transform: scale(0.9);
	}
	.icon.danger:hover {
		color: var(--danger);
		background: rgba(255, 107, 107, 0.1);
	}

	.block {
		display: grid;
		gap: 12px;
		padding: 14px;
		border-radius: var(--radius);
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid var(--hairline);
	}
	.divider {
		height: 1px;
		background: var(--hairline);
	}
	.teach {
		margin: 0;
		padding-left: 10px;
		border-left: 2px solid var(--sun-dim);
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-2);
	}

	@media (prefers-reduced-motion: reduce) {
		/* the global 1 ms rule would make infinite loops flicker: stop them instead */
		.progress::after,
		.pulse::after,
		.sk,
		.skel.tiles span {
			animation: none;
		}
	}

	@media (max-width: 767px) {
		.head {
			padding: 0 14px 12px;
			gap: 10px;
		}
		.body {
			padding: 2px 14px 24px;
		}
		.skel.tiles span {
			height: 110px;
		}
	}
</style>
