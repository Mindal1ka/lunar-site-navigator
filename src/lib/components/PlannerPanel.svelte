<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Planner panel: charts over the selected window, best window finder, battery sizing
     and CSV export, as animated tabs inside one glass panel (Planner mode only). -->
<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app } from '#lib/state.svelte.ts';
	import { c, fmtNum } from '#lib/i18n.ts';
	import Charts from '#lib/planner/Charts.svelte';
	import BestWindows from '#lib/planner/BestWindows.svelte';
	import Battery from '#lib/planner/Battery.svelte';
	import ExportCsv from '#lib/planner/ExportCsv.svelte';
	import { UNITS, periodLabel } from '#lib/planner/format.ts';
	import type { Metric } from '#lib/planner/chart.ts';

	type Tab = 'charts' | 'best' | 'battery' | 'export';
	const TABS: Tab[] = ['charts', 'best', 'battery', 'export'];

	const T = {
		en: {
			region: 'Mission planner',
			tabs: { charts: 'Charts', best: 'Best window', battery: 'Battery', export: 'Export' },
			compare: 'Comparing A and B'
		},
		uk: {
			region: 'Планувальник місії',
			tabs: { charts: 'Графіки', best: 'Найкраще вікно', battery: 'Батарея', export: 'Експорт' },
			compare: 'Порівняння A і B'
		}
	};
	const t = $derived(T[app.lang]);

	let tab = $state<Tab>('charts');
	let metric = $state<Metric>('sun');
	let dir = $state(1);
	const btns: Record<string, HTMLButtonElement | undefined> = $state({});
	let tablist = $state<HTMLDivElement>();
	let ind = $state({ x: 0, w: 0, ready: false });

	function select(next: Tab, focus = false) {
		if (next === tab) return;
		dir = TABS.indexOf(next) > TABS.indexOf(tab) ? 1 : -1;
		tab = next;
		if (focus) btns[next]?.focus();
	}

	function onTabKey(e: KeyboardEvent) {
		const i = TABS.indexOf(tab);
		let n: number | null = null;
		if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
		else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
		else if (e.key === 'Home') n = 0;
		else if (e.key === 'End') n = TABS.length - 1;
		if (n == null) return;
		e.preventDefault();
		select(TABS[n], true);
	}

	// sliding indicator follows the active tab (and re-measures on resize / language)
	$effect(() => {
		void app.lang;
		const el = btns[tab];
		const list = tablist;
		if (!el || !list) return;
		const measure = () => (ind = { x: el.offsetLeft, w: el.offsetWidth, ready: true });
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(list);
		ro.observe(el);
		return () => ro.disconnect();
	});

	const period = $derived(app.eph ? periodLabel(app.eph, app.win.i0, app.win.i1) : '');
	const rm = $derived(prefersReducedMotion.current);
	const cc = $derived(c());
</script>

<section class="planner glass" aria-label={t.region} in:fly={{ y: rm ? 0 : 24, duration: rm ? 0 : 520, easing: cubicOut }}>
	<header class="head">
		<div class="tabs" role="tablist" aria-label={t.region} bind:this={tablist} tabindex="-1" onkeydown={onTabKey}>
			<span
				class="ind"
				class:ready={ind.ready}
				style:transform="translate3d({ind.x}px,0,0)"
				style:width="{ind.w}px"
				aria-hidden="true"
			></span>
			{#each TABS as id (id)}
				<button
					bind:this={btns[id]}
					id="pl-tab-{id}"
					class="tab"
					class:on={tab === id}
					role="tab"
					aria-selected={tab === id}
					aria-controls="pl-panel"
					tabindex={tab === id ? 0 : -1}
					onclick={() => select(id)}
				>
					<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" class="ico">
						{#if id === 'charts'}
							<path d="M3 15.5c2.2 0 2.6-8 5-8s2.6 5 4.5 5 2.3-6 4.5-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
						{:else if id === 'best'}
							<rect x="3" y="4.5" width="14" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6" />
							<path d="M3 8.5h14M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
							<path d="M7.3 12.3l1.8 1.7 3.6-3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
						{:else if id === 'battery'}
							<rect x="2.5" y="6" width="13" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
							<path d="M17.5 9v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
							<rect x="4.5" y="8" width="6" height="4" rx="1" fill="currentColor" />
						{:else}
							<path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
						{/if}
					</svg>
					<span class="tl">{t.tabs[id]}</span>
				</button>
			{/each}
		</div>
		<p class="ctx">
			<span class="period">{period}</span>
			<span class="sep" aria-hidden="true">·</span>
			<span>{cc.heightLabel}: <b class="num">{app.heightM} {UNITS[app.lang].m}</b></span>
			<span class="sep hide-s" aria-hidden="true">·</span>
			<span class="hide-s">{cc.marginLabel}: <b class="num">{fmtNum(app.earthMarginDeg, 1)}°</b></span>
			{#if app.siteB}
				<span class="cmp" title={t.compare} transition:fade={{ duration: rm ? 0 : 200 }}
					><i class="da"></i><i class="db"></i><span class="sr-only">{t.compare}</span>A + B</span
				>
			{/if}
		</p>
	</header>

	<div class="stack" id="pl-panel" role="tabpanel" aria-labelledby="pl-tab-{tab}">
		{#key tab}
			<div
				class="pane"
				in:fly={{ x: rm ? 0 : 28 * dir, duration: rm ? 0 : 460, delay: rm ? 0 : 60, easing: cubicOut, opacity: 0 }}
				out:fly={{ x: rm ? 0 : -18 * dir, duration: rm ? 0 : 200, opacity: 0 }}
			>
				{#if tab === 'charts'}
					<Charts bind:metric />
				{:else if tab === 'best'}
					<BestWindows />
				{:else if tab === 'battery'}
					<Battery />
				{:else}
					<ExportCsv />
				{/if}
			</div>
		{/key}
	</div>
</section>

<style>
	.planner {
		container: planner / inline-size;
		position: relative;
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: 10px 14px 12px;
		gap: 10px;
		min-height: 0;
		overflow: hidden;
	}
	/* faint aurora along the top edge: Sun -> both -> Earth */
	.planner::before {
		content: '';
		position: absolute;
		inset: 0 0 auto;
		height: 1px;
		background: linear-gradient(90deg, transparent, var(--sun) 25%, var(--both) 50%, var(--earth) 75%, transparent);
		opacity: 0.45;
		pointer-events: none;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-width: 0;
	}
	.tabs {
		position: relative;
		display: flex;
		flex: none;
		padding: 3px;
		border-radius: var(--radius-pill);
		background: rgba(255, 255, 255, 0.035);
		border: 1px solid var(--hairline);
	}
	.tabs:focus {
		outline: none;
	}
	.ind {
		position: absolute;
		top: 3px;
		bottom: 3px;
		left: 0;
		border-radius: var(--radius-pill);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.07));
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.12),
			0 4px 14px rgba(0, 0, 0, 0.35);
		opacity: 0;
		will-change: transform, width;
	}
	.ind.ready {
		opacity: 1;
		transition:
			transform 520ms var(--ease-spring),
			width 520ms var(--ease-spring),
			opacity var(--dur);
	}
	.tab {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 30px;
		padding: 0 13px;
		border-radius: var(--radius-pill);
		font-size: 12.5px;
		font-weight: 500;
		color: var(--text-3);
		white-space: nowrap;
		transition: color var(--dur) var(--ease-out);
	}
	.tab:hover {
		color: var(--text-2);
	}
	.tab.on {
		color: var(--text);
	}
	.tab:focus-visible {
		outline-offset: -2px;
		border-radius: var(--radius-pill);
	}
	.ico {
		flex: none;
		transition: transform var(--dur) var(--ease-spring);
	}
	.tab.on .ico {
		transform: scale(1.08);
	}
	.tab:active .ico {
		transform: scale(0.9);
	}
	.ctx {
		margin: 0;
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		justify-content: flex-end;
		gap: 7px;
		min-width: 0;
		font-size: 11.5px;
		color: var(--text-3);
		white-space: nowrap;
		overflow: hidden;
	}
	.ctx b {
		color: var(--text);
		font-weight: 500;
	}
	.period {
		flex: none;
		color: var(--text-2);
	}
	.ctx > span:not(.period):not(.cmp):not(.sep) {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cmp {
		flex: none;
	}
	.cmp {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: 6px;
		padding: 2px 8px 2px 6px;
		border-radius: var(--radius-pill);
		background: rgba(196, 155, 255, 0.1);
		color: var(--site-b);
	}
	.da,
	.db {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--site-a);
	}
	.db {
		background: var(--site-b);
		margin: 0 3px 0 -3px;
	}
	.stack {
		flex: 1;
		min-height: 0;
		display: grid;
	}
	.pane {
		grid-area: 1 / 1;
		min-width: 0;
		min-height: 0;
	}

	@container planner (max-width: 980px) {
		.hide-s {
			display: none;
		}
	}
	@container planner (max-width: 760px) {
		.head {
			flex-direction: column;
			align-items: stretch;
			gap: 6px;
		}
		.tabs {
			align-self: flex-start;
		}
		.ctx {
			justify-content: flex-start;
			flex-wrap: wrap;
			row-gap: 2px;
		}
	}
	@container planner (max-width: 520px) {
		.tab {
			padding: 0 10px;
		}
		.tab:not(.on) .tl {
			display: none;
		}
	}
</style>
