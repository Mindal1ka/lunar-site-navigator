<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Panel/antenna height slider. Each stop is a bar showing sunlight at that height, so the
     effect of a taller mast is visible before you pick it. Snaps to app.sites.heights_m. -->
<script lang="ts">
	import { app } from '#lib/state.svelte.ts';
	import { fmtNum } from '#lib/i18n.ts';
	import { T } from './strings.ts';
	import { metres, signed, pctDigits } from './format.ts';
	import { heightProfile, type HeightProfile } from './profile.ts';

	const t = $derived(T[app.lang]);
	const heights = $derived(app.sites?.heights_m ?? [0, 1, 2, 3, 5, 7, 10, 15, 20]);
	const idx = $derived(app.heightIndex);

	let profA = $state.raw<HeightProfile | null>(null);
	let profB = $state.raw<HeightProfile | null>(null);
	let pending = $state(false);

	// Recompute per-height stats off the interaction path (debounced), so dragging stays at 60 fps.
	$effect(() => {
		const eph = app.eph;
		const a = app.siteA;
		const b = app.siteB;
		const { i0, i1 } = app.win;
		const m = app.earthMarginDeg;
		const hs = heights;
		if (!eph || !a) return;
		pending = true;
		const id = setTimeout(() => {
			profA = heightProfile(a, eph, hs, i0, i1, m);
			profB = b ? heightProfile(b, eph, hs, i0, i1, m) : null;
			pending = false;
		}, 180);
		return () => clearTimeout(id);
	});

	let el: HTMLDivElement | undefined = $state();
	let dragging = $state(false);

	function setIdx(i: number) {
		const k = Math.max(0, Math.min(heights.length - 1, i));
		if (heights[k] !== app.heightM) app.heightM = heights[k];
	}
	function idxFromX(x: number) {
		if (!el) return idx;
		const r = el.getBoundingClientRect();
		return Math.floor(((x - r.left) / r.width) * heights.length);
	}
	function down(e: PointerEvent) {
		if (e.button !== 0) return;
		dragging = true;
		el?.setPointerCapture(e.pointerId);
		setIdx(idxFromX(e.clientX));
	}
	function move(e: PointerEvent) {
		if (dragging) setIdx(idxFromX(e.clientX));
	}
	function up(e: PointerEvent) {
		dragging = false;
		el?.releasePointerCapture?.(e.pointerId);
	}
	function key(e: KeyboardEvent) {
		const map: Record<string, number> = {
			ArrowRight: idx + 1,
			ArrowUp: idx + 1,
			ArrowLeft: idx - 1,
			ArrowDown: idx - 1,
			PageUp: idx + 2,
			PageDown: idx - 2,
			Home: 0,
			End: heights.length - 1
		};
		if (e.key in map) {
			e.preventDefault();
			setIdx(map[e.key]);
		}
	}

	// insight: what the tallest mast or the next stop would change
	const insight = $derived.by(() => {
		if (!profA) return null;
		const cur = profA.sun[idx];
		const k10 = heights.indexOf(10);
		const target = idx < k10 ? k10 : heights.length - 1;
		if (target === idx) return null;
		const dSun = profA.sun[target] - cur;
		const dNight = profA.night[target] - profA.night[idx];
		return { h: heights[target], dSun, dNight };
	});
	const maxSun = $derived(Math.max(1, ...(profA?.sun ?? [100]), ...(profB?.sun ?? [0])));
</script>

<div class="hc">
	<div class="head">
		<span class="lbl" id="hc-label">{t.heightLine}</span>
		<span class="val num">
			{#key app.heightM}
				<span class="roll">{metres(app.heightM)}</span>
			{/key}
		</span>
	</div>

	<div
		bind:this={el}
		class="bars"
		class:dragging
		class:pending
		class:compare={!!profB}
		role="slider"
		tabindex="0"
		aria-labelledby="hc-label"
		aria-valuemin={heights[0]}
		aria-valuemax={heights[heights.length - 1]}
		aria-valuenow={app.heightM}
		aria-valuetext={metres(app.heightM)}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		onkeydown={key}
		style:--n={heights.length}
		style:--i={idx}
	>
		<div class="thumb" aria-hidden="true"></div>
		{#each heights as h, k (h)}
			{@const sa = profA?.sun[k] ?? 0}
			{@const sb = profB?.sun[k] ?? 0}
			<div class="col" class:on={k === idx} aria-hidden="true">
				<div class="plot">
					{#if k === idx && profA}
						<span class="tip num" style:bottom="calc({(sa / maxSun) * 100}% + 4px)">{fmtNum(sa, pctDigits())}%</span>
					{/if}
					<span class="bar a" style:transform="scaleY({profA ? sa / maxSun : 0.04})" style:transition-delay="{k * 22}ms"></span>
					{#if profB}
						<span class="bar b" style:transform="scaleY({sb / maxSun})" style:transition-delay="{k * 22 + 40}ms"></span>
					{/if}
				</div>
				<span class="tick mono">{h}</span>
			</div>
		{/each}
	</div>

	<div class="foot">
		<span>{t.heightHelp}{app.lang === 'uk' ? ', м' : ', m'}</span>
		{#if insight}
			<span class="ins">
				{insight.h} {app.lang === 'uk' ? 'м' : 'm'}:
				<b class="sunc">{signed(insight.dSun, pctDigits())} {t.pp}</b>
				{#if Math.abs(insight.dNight) >= 1}
					· <b class="nightc">{signed(insight.dNight / 24, 1)} {app.lang === 'uk' ? 'д ночі' : 'd night'}</b>
				{/if}
			</span>
		{/if}
	</div>
</div>

<style>
	.hc {
		display: grid;
		gap: 8px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.lbl {
		font-size: 13px;
		color: var(--text-2);
	}
	.val {
		position: relative;
		font-size: 20px;
		font-weight: 600;
		min-width: 4ch;
		text-align: right;
		overflow: hidden;
		height: 1.3em;
		display: inline-grid;
	}
	.roll {
		grid-area: 1 / 1;
		animation: roll var(--dur) var(--ease-out);
	}
	@keyframes roll {
		from {
			transform: translateY(60%);
			opacity: 0;
			filter: blur(3px);
		}
	}

	.bars {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--n), 1fr);
		height: 96px;
		padding: 18px 0 0;
		border-radius: var(--radius-sm);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), rgba(255, 255, 255, 0.04));
		border: 1px solid var(--hairline);
		cursor: pointer;
		touch-action: pan-y;
		user-select: none;
		transition: border-color var(--dur-fast);
	}
	.bars:hover,
	.bars.dragging {
		border-color: var(--glass-border-strong);
	}
	.bars:focus-visible {
		outline-offset: 3px;
	}
	.thumb {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 0;
		width: calc(100% / var(--n));
		transform: translateX(calc(var(--i) * 100%));
		border-radius: 8px;
		background: linear-gradient(180deg, rgba(255, 181, 71, 0.06), rgba(255, 181, 71, 0.16));
		box-shadow: inset 0 0 0 1px rgba(255, 181, 71, 0.35), 0 0 24px rgba(255, 181, 71, 0.12);
		transition: transform 420ms var(--ease-spring);
		pointer-events: none;
	}
	.bars.dragging .thumb {
		transition-duration: 220ms;
	}
	.col {
		position: relative;
		display: grid;
		grid-template-rows: 1fr auto;
		min-width: 0;
	}
	.plot {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: 2px;
		padding: 0 22%;
	}
	.bar {
		display: block;
		flex: 1;
		max-width: 14px;
		height: 100%;
		border-radius: 3px 3px 1px 1px;
		transform-origin: bottom;
		transition: transform 620ms var(--ease-out), background var(--dur), opacity var(--dur);
		will-change: transform;
	}
	.bar.a {
		background: linear-gradient(180deg, var(--sun-soft), rgba(255, 181, 71, 0.35));
		opacity: 0.42;
	}
	.bar.b {
		background: linear-gradient(180deg, var(--site-b), rgba(196, 155, 255, 0.3));
		opacity: 0.38;
	}
	.compare .plot {
		padding: 0 16%;
	}
	.col.on .bar {
		opacity: 1;
	}
	.col.on .bar.a {
		box-shadow: 0 0 14px rgba(255, 181, 71, 0.5);
	}
	.pending .bar {
		opacity: 0.25;
	}
	.tip {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		font-size: 11px;
		font-weight: 600;
		color: var(--sun-soft);
		white-space: nowrap;
		animation: pop var(--dur) var(--ease-spring);
		transition: bottom 620ms var(--ease-out);
		pointer-events: none;
		z-index: 1;
	}
	@keyframes pop {
		from {
			transform: translate(-50%, 4px) scale(0.8);
			opacity: 0;
		}
	}
	.tick {
		font-size: 10.5px;
		color: var(--text-3);
		text-align: center;
		padding: 4px 0 5px;
		transition: color var(--dur-fast);
	}
	.col.on .tick {
		color: var(--text);
		font-weight: 600;
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 12px;
		font-size: 11.5px;
		color: var(--text-3);
	}
	.ins {
		color: var(--text-2);
	}
	.ins b {
		font-weight: 600;
	}
	.sunc {
		color: var(--sun);
	}
	.nightc {
		color: #a7a3d6;
	}
</style>
