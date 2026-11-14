<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!--
	Timeline, the time machine: play / speed / clock on the left, period presets, legend and
	zoom on top, and the strip (bands, brush, playhead) below. Two compact rows on phones.
-->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app, LUNAR_MONTH_H, YEAR_H, type Preset } from '#lib/state.svelte.ts';
	import { timeOf } from '#lib/engine/visibility.ts';
	import { COMMON, fmtDate, fmtNum } from '#lib/i18n.ts';
	import Strip from '#lib/timeline/Strip.svelte';
	import Segmented from '#lib/timeline/Segmented.svelte';
	import PlayButton from '#lib/timeline/PlayButton.svelte';
	import { SPEEDS, T } from '#lib/timeline/strings.ts';

	const t = $derived(T[app.lang]);
	const eph = $derived(app.eph!);
	const stepH = $derived(eph.step_s / 3600);
	const perDay = $derived(Math.round(24 / stepH));

	let detail = $state(false);
	let hint = $state(0);
	let whyOpen = $state(false);

	// ---- clock
	const now = $derived(timeOf(eph, app.t));
	const dateStr = $derived(fmtDate(now));
	const dayStr = $derived(fmtDate(now, { day: 'numeric', month: 'short' }));
	const yearStr = $derived(String(now.getUTCFullYear()));
	const hourStr = $derived(
		`${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
	);
	const progress = $derived((app.t - app.win.i0) / Math.max(1, app.win.i1 - 1 - app.win.i0));

	// ---- period
	const periodStr = $derived.by(() => {
		const a = timeOf(eph, app.win.i0), b = timeOf(eph, app.win.i1 - 1);
		const hours = (app.win.i1 - app.win.i0) * stepH;
		if (hours <= 24 * 120) {
			const short = fmtDate(a, { day: 'numeric', month: 'short' });
			return a.getUTCFullYear() === b.getUTCFullYear() ? `${short} – ${fmtDate(b)}` : `${fmtDate(a)} – ${fmtDate(b)}`;
		}
		return `${fmtDate(a, { month: 'short', year: 'numeric' })} – ${fmtDate(b, { month: 'short', year: 'numeric' })}`;
	});
	const daysStr = $derived.by(() => {
		const d = ((app.win.i1 - app.win.i0) * stepH) / 24;
		return t.days(fmtNum(d, d < 100 && d % 1 !== 0 ? 1 : 0));
	});

	const presetOpts = $derived(
		(['month', 'year', 'custom'] as Preset[]).map((p) => ({ value: p, label: t.presets[p] }))
	);
	const speedOpts = $derived(SPEEDS.map((v, i) => ({ value: v as number, label: t.speeds[i], title: t.speedsLong[i] })));
	const speedIdx = $derived(SPEEDS.indexOf(app.speed as (typeof SPEEDS)[number]));

	function choosePreset(p: Preset) {
		if (p === 'custom') {
			app.preset = 'custom';
			hint++;
			return;
		}
		const len = Math.round((p === 'month' ? LUNAR_MONTH_H : YEAR_H) / stepH);
		// a month starts at the cursor's day; a year keeps the current start
		const startRaw = p === 'month' ? Math.floor(app.t / perDay) * perDay : app.win.i0;
		const start = Math.max(0, Math.min(eph.count - len, startRaw));
		const best = app.best;
		const tPrev = app.t;
		app.setPreset(p, start);
		app.best = best;
		app.t = Math.max(app.win.i0, Math.min(app.win.i1 - 1, tPrev));
	}

	function toggle() {
		app.playing = !app.playing;
	}

	function onKey(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		if (el.closest('input, select, textarea')) return;
		if (e.key === 'z' || e.key === 'Z') {
			detail = !detail;
			e.preventDefault();
		} else if (e.key === 'Escape' && whyOpen) {
			whyOpen = false;
		}
	}

	const reduced = $derived(prefersReducedMotion.current);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="tl glass" aria-label={t.region} onkeydown={onKey}>
	<div class="controls">
		<PlayButton playing={app.playing} {progress} label={app.playing ? t.pause : t.play} ontoggle={toggle} />
		<div class="clock" title={t.time}>
			<span class="label">{t.time}</span>
			<span class="date num"><span class="d-long">{dateStr}</span><span class="d-short">{dayStr}</span></span>
			<span class="hour mono"><span class="d-short">{yearStr}&nbsp;·&nbsp;</span>{hourStr}</span>
		</div>
		<div class="speed desk">
			<Segmented
				label={t.speed}
				options={speedOpts}
				value={speedIdx >= 0 ? app.speed : null}
				onchange={(v) => (app.speed = v)}
				accent="var(--sun-soft)"
			/>
		</div>
		<label class="chip-select phone">
			<span class="sr-only">{t.speed}</span>
			<select bind:value={app.speed} aria-label={t.speed}>
				{#each speedOpts as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
			</select>
		</label>
		<label class="chip-select phone">
			<span class="sr-only">{t.presetGroup}</span>
			<select value={app.preset} onchange={(e) => choosePreset((e.currentTarget as HTMLSelectElement).value as Preset)} aria-label={t.presetGroup}>
				{#each ['month', 'year', 'custom'] as const as p (p)}<option value={p}>{t.presetsShort[p]}</option>{/each}
			</select>
		</label>
		<button
			type="button"
			class="zoom phone"
			class:on={detail}
			aria-pressed={detail}
			aria-label={detail ? t.zoomOut : t.zoomIn}
			title={detail ? t.zoomOut : t.zoomIn}
			onclick={() => (detail = !detail)}
		>
			{@render zoomIcon()}
		</button>
	</div>

	<div class="main">
		<div class="head">
			<Segmented label={t.presetGroup} options={presetOpts} value={app.preset} onchange={choosePreset} />
			<div class="period" title={`${t.periodLabel}: ${periodStr}`}>
				<span class="ptxt num">{periodStr}</span>
				<span class="pdur">{daysStr}</span>
			</div>
			<span class="hchip" title={t.legendAt(app.heightM)}>{COMMON[app.lang].heightLabel}: <b class="num">{app.heightM} {t.m}</b></span>
			<div class="spacer"></div>
			<ul class="legend" aria-label={t.legendAt(app.heightM)}>
				<!-- in priority order: keys that do not fit drop from the end -->
				<li><i class="sw sun"></i>{t.legendSun}</li>
				<li><i class="sw earth"></i>{t.legendEarth}</li>
				<li><i class="sw night"></i>{t.legendNight}</li>
				<li><i class="sw partial"></i>{t.legendPartial}</li>
				{#if app.best.length}<li in:fly={{ y: 4, duration: reduced ? 0 : 300 }}><i class="sw best"></i>{t.legendBest}</li>{/if}
			</ul>
			{#if app.mode === 'teacher'}
				<div class="why-wrap">
					<button type="button" class="why" aria-expanded={whyOpen} aria-controls="tl-why" onclick={() => (whyOpen = !whyOpen)}>
						{t.why}
					</button>
					{#if whyOpen}
						<div
							id="tl-why"
							class="why-pop glass"
							role="dialog"
							aria-label={t.whyTitle}
							transition:fly={{ y: 8, duration: reduced ? 0 : 260, easing: cubicOut }}
						>
							<div class="why-head">
								<strong>{t.whyTitle}</strong>
								<button type="button" class="x" aria-label={t.close} onclick={() => (whyOpen = false)}>×</button>
							</div>
							<p>{t.whyText}</p>
							<p class="why-at">{t.legendAt(app.heightM)}</p>
						</div>
					{/if}
				</div>
			{/if}
			<button
				type="button"
				class="zoom desk"
				class:on={detail}
				aria-pressed={detail}
				aria-label={detail ? t.zoomOut : t.zoomIn}
				title={(detail ? t.zoomOut : t.zoomIn) + ' (Z)'}
				onclick={() => (detail = !detail)}
			>
				{@render zoomIcon()}
				<span>{detail ? t.overview : t.detail}</span>
			</button>
		</div>
		<div class="strip-wrap">
			<Strip {detail} {hint} ontoggledetail={() => (detail = !detail)} />
		</div>
	</div>
</section>

{#snippet zoomIcon()}
	<svg viewBox="0 0 16 16" aria-hidden="true" class:wide={detail}>
		<path class="br l" d="M6 3.5H4.5v9H6" />
		<path class="br r" d="M10 3.5h1.5v9H10" />
		<path class="mid" d="M7 8h2" />
	</svg>
{/snippet}

<style>
	.tl {
		position: relative;
		height: 100%;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 18px;
		padding: 10px 14px 9px 12px;
		border-radius: var(--radius);
		animation: rise var(--dur-slow) var(--ease-out) both;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(14px) scale(0.985);
		}
	}

	/* ---------- left: play, clock, speed */
	.controls {
		display: grid;
		grid-template-columns: auto auto;
		grid-template-rows: auto 1fr;
		column-gap: 12px;
		row-gap: 8px;
		align-content: center;
		align-items: center;
		min-width: 0;
	}
	.clock {
		display: grid;
		line-height: 1.1;
		min-width: 128px;
	}
	.clock .label {
		font-size: 9.5px;
		margin-bottom: 3px;
	}
	.date {
		font-size: 19px;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
	}
	.hour {
		white-space: nowrap;
		font-size: 11.5px;
		color: var(--sun-soft);
		margin-top: 2px;
	}
	.speed {
		grid-column: 1 / -1;
	}
	.d-short {
		display: none;
	}
	.tl .phone {
		display: none;
	}

	/* ---------- right: head + strip */
	.main {
		display: flex;
		flex-direction: column;
		gap: 7px;
		min-width: 0;
		container-type: inline-size;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		height: 30px;
		flex: none;
	}
	.period {
		display: flex;
		align-items: baseline;
		gap: 7px;
		min-width: 0;
		white-space: nowrap;
	}
	.ptxt {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pdur {
		font-size: 11.5px;
		color: var(--text-3);
	}
	.spacer {
		flex: 1;
		display: none;
	}
	/* the legend takes the free space; items that do not fit wrap onto a hidden second line,
	   so a key is either shown whole or not at all (never clipped mid-word, in any language) */
	.legend {
		flex: 1 1 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-content: flex-start;
		align-items: center;
		column-gap: 12px;
		row-gap: 8px;
		height: 16px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 11px;
		line-height: 16px;
		color: var(--text-2);
		white-space: nowrap;
		min-width: 0;
		overflow: hidden;
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 16px;
	}
	.hchip {
		flex: none;
		font-size: 11px;
		color: var(--text-3);
		white-space: nowrap;
		padding-left: 12px;
		border-left: 1px solid var(--hairline);
	}
	.hchip b {
		color: var(--text-2);
		font-weight: 600;
	}
	.sw {
		width: 14px;
		height: 7px;
		border-radius: 2px;
		flex: none;
	}
	.sw.sun {
		background: var(--sun);
		box-shadow: 0 0 8px rgba(255, 181, 71, 0.5);
	}
	.sw.partial {
		background: linear-gradient(90deg, rgba(255, 110, 70, 0.55), rgb(255, 110, 70));
	}
	.sw.earth {
		background: var(--earth);
		box-shadow: 0 0 8px rgba(92, 200, 255, 0.45);
	}
	.sw.night {
		background: rgba(150, 138, 255, 0.18);
		box-shadow: inset 0 0 0 1px rgba(214, 204, 255, 0.9);
	}
	.sw.best {
		background: var(--both);
		border-radius: 4px;
	}
	.strip-wrap {
		flex: 1;
		min-height: 0;
	}

	/* ---------- zoom */
	.zoom {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		padding: 0 11px 0 9px;
		border-radius: var(--radius-pill);
		font-size: 12px;
		font-weight: 500;
		color: var(--text-2);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--hairline);
		flex: none;
		transition:
			color var(--dur) var(--ease-out),
			background var(--dur) var(--ease-out),
			border-color var(--dur) var(--ease-out);
	}
	.zoom:hover {
		color: var(--text);
		border-color: var(--glass-border-strong);
	}
	.zoom.on {
		color: var(--earth-soft);
		background: rgba(92, 200, 255, 0.1);
		border-color: rgba(92, 200, 255, 0.35);
	}
	.zoom:focus-visible {
		border-radius: var(--radius-pill);
	}
	.zoom svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.zoom .br,
	.zoom .mid {
		transition: transform 420ms var(--ease-spring);
		transform-origin: 8px 8px;
	}
	.zoom svg.wide .br.l {
		transform: translateX(-2.5px);
	}
	.zoom svg.wide .br.r {
		transform: translateX(2.5px);
	}
	.zoom svg.wide .mid {
		transform: scaleX(2.6);
	}

	/* ---------- teacher "why" */
	.why-wrap {
		position: relative;
		flex: none;
	}
	.why {
		height: 26px;
		padding: 0 10px;
		border-radius: var(--radius-pill);
		font-size: 11.5px;
		font-weight: 600;
		color: var(--sun-soft);
		background: rgba(255, 181, 71, 0.1);
		border: 1px solid rgba(255, 181, 71, 0.3);
	}
	.why:focus-visible {
		border-radius: var(--radius-pill);
	}
	.why-pop {
		position: absolute;
		right: 0;
		bottom: calc(100% + 14px);
		width: min(380px, 80vw);
		padding: 12px 14px;
		background: var(--glass-strong);
		z-index: 30;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.why-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: var(--text);
		font-size: 13px;
	}
	.why-pop p {
		margin: 6px 0 0;
	}
	.why-at {
		color: var(--text-3);
		font-size: 11.5px;
	}
	.x {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		font-size: 17px;
		line-height: 1;
		color: var(--text-3);
	}
	.x:hover {
		color: var(--text);
	}

	/* ---------- adapt to available width */
	@container (max-width: 930px) {
		.legend {
			display: none;
		}
		.spacer {
			display: block;
		}
	}
	@container (max-width: 700px) {
		.pdur {
			display: none;
		}
	}
	@container (max-width: 600px) {
		.hchip {
			display: none;
		}
	}
	@container (max-width: 540px) {
		.period {
			display: none;
		}
	}

	/* ---------- phones: two compact rows */
	@media (max-width: 767px) {
		.tl {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
			gap: 6px;
			padding: 7px 10px 6px 8px;
		}
		.controls {
			grid-template-columns: auto minmax(0, 1fr) auto auto auto;
			grid-template-rows: auto;
			column-gap: 7px;
		}
		.tl .desk,
		.head {
			display: none;
		}
		.tl .phone {
			display: inline-flex;
		}
		.clock {
			min-width: 0;
			overflow: hidden;
		}
		.d-long {
			display: none;
		}
		.d-short {
			display: inline;
		}
		.clock .label {
			display: none;
		}
		.date {
			font-size: 14.5px;
		}
		.hour {
			font-size: 10.5px;
			margin-top: 1px;
		}
		.zoom {
			width: 32px;
			height: 30px;
			padding: 0;
			justify-content: center;
		}
		.controls :global(.play) {
			--s: 36px !important;
		}
	}
	.chip-select {
		position: relative;
		align-items: center;
	}
	.chip-select select {
		appearance: none;
		-webkit-appearance: none;
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		color: var(--text);
		height: 30px;
		padding: 0 22px 0 10px;
		border-radius: var(--radius-pill);
		background:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23a7afbd' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E")
				right 8px center / 9px 6px no-repeat,
			rgba(255, 255, 255, 0.05);
		border: 1px solid var(--hairline);
	}
	.chip-select select:focus-visible {
		outline: 2px solid var(--earth);
		outline-offset: 2px;
	}
	.chip-select option {
		background: #10141d;
		color: var(--text);
	}
</style>
