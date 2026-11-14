<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Best window finder: for a mission length, the engine ranks windows by the share of
     hours with the Sun and the Earth in view together (site A, current height/margin). -->
<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app } from '#lib/state.svelte.ts';
	import { timeOf } from '#lib/engine/visibility.ts';
	import { fmtDate, fmtNum } from '#lib/i18n.ts';
	import AnimatedNumber from './AnimatedNumber.svelte';
	import { clamp } from './format.ts';

	const T = {
		en: {
			length: 'Mission length',
			days: 'days',
			lunarDay: '1 lunar day',
			find: 'Find best windows',
			finding: 'Searching…',
			scope: (site: string, from: string, to: string, h: number) =>
				`Searches ${from} – ${to} for site A (${site}). Panel/antenna height: ${h} m.`,
			both: 'of hours with Sun and Earth together',
			sun: 'Sun',
			earth: 'Earth',
			use: 'Use this window',
			inUse: 'In use',
			empty: 'Pick a mission length and search. Windows are ranked by hours when the panels get sunlight and the antenna sees the Earth at the same time.',
			none: 'No window of this length fits in the data.',
			stale: 'Settings changed since this search.',
			again: 'Search again',
			rank: 'Rank',
			track: 'Where the windows fall in the data span',
			sunPctNote: 'Sun % = average visible share of the solar disk',
			dec: 'Shorter mission',
			inc: 'Longer mission'
		},
		uk: {
			length: 'Тривалість місії',
			days: 'днів',
			lunarDay: '1 місячна доба',
			find: 'Знайти найкращі вікна',
			finding: 'Шукаємо…',
			scope: (site: string, from: string, to: string, h: number) =>
				`Пошук ${from} – ${to} для місця A (${site}). Висота панелі/антени: ${h} м.`,
			both: 'годин, коли разом видно Сонце й Землю',
			sun: 'Сонце',
			earth: 'Земля',
			use: 'Використати це вікно',
			inUse: 'Вибрано',
			empty: 'Виберіть тривалість місії й запустіть пошук. Вікна впорядковано за годинами, коли панелі отримують світло й антена водночас бачить Землю.',
			none: 'Вікно такої довжини не вміщується в дані.',
			stale: 'Після пошуку налаштування змінилися.',
			again: 'Шукати знову',
			rank: 'Місце',
			track: 'Де вікна розташовані в діапазоні даних',
			sunPctNote: '% Сонця = середня видима частка сонячного диска',
			dec: 'Коротша місія',
			inc: 'Довша місія'
		}
	};
	const t = $derived(T[app.lang]);

	const QUICK = [7, 14, 29.5] as const;
	let busy = $state(false);
	let searched = $state<{ key: string; days: number } | null>(null);
	const key = $derived(`${app.siteA?.id}|${app.heightM}|${app.earthMarginDeg}|${app.missionDays}`);
	const stale = $derived(!!searched && app.best.length > 0 && searched.key !== key);

	const spanFrom = $derived(app.eph ? fmtDate(timeOf(app.eph, app.nowIndex)) : '');
	const spanTo = $derived(app.eph ? fmtDate(timeOf(app.eph, app.eph.count)) : '');

	function setDays(v: number) {
		app.missionDays = clamp(Math.round(v * 2) / 2, 1, 120);
	}

	async function find() {
		if (busy) return;
		busy = true;
		// let the button state paint before the (synchronous) search
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		app.findBest();
		searched = { key, days: app.missionDays };
		busy = false;
	}

	function use(i0: number, i1: number) {
		const keep = app.best;
		app.preset = 'custom';
		app.setWindow(i0, i1);
		app.t = app.win.i0;
		// setWindow clears the results; keep them so the planner can compare windows
		app.best = keep;
	}

	const range = (i0: number, i1: number) => (app.eph ? `${fmtDate(timeOf(app.eph, i0))} – ${fmtDate(timeOf(app.eph, i1))}` : '');
	const isActive = (i0: number, i1: number) => app.win.i0 === i0 && app.win.i1 === i1;

	const spanN = $derived(app.eph ? Math.max(1, app.eph.count - app.nowIndex) : 1);
	const pos = (i: number) => (100 * (i - app.nowIndex)) / spanN;

	const dur = $derived(prefersReducedMotion.current ? 0 : 1);
</script>

<div class="best">
	<div class="controls">
		<div class="field">
			<span class="label" id="ml-label">{t.length}</span>
			<div class="stepper" role="group" aria-labelledby="ml-label">
				<button class="sbtn" aria-label={t.dec} onclick={() => setDays(app.missionDays - 1)}>−</button>
				<label class="val">
					<input
						class="num"
						type="number"
						min="1"
						max="120"
						step="0.5"
						value={app.missionDays}
						aria-labelledby="ml-label"
						onchange={(e) => setDays(+e.currentTarget.value || 1)}
					/>
					<span class="unit">{t.days}</span>
				</label>
				<button class="sbtn" aria-label={t.inc} onclick={() => setDays(app.missionDays + 1)}>+</button>
			</div>
			<div class="quick">
				{#each QUICK as q (q)}
					<button class="qchip" class:on={app.missionDays === q} onclick={() => setDays(q)}>
						{q === 29.5 ? t.lunarDay : `${q} ${t.days}`}
					</button>
				{/each}
			</div>
		</div>
		<button class="find" class:busy onclick={find} disabled={busy} aria-busy={busy}>
			<span class="shine" aria-hidden="true"></span>
			<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"
				><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path
					d="M13 13l4.5 4.5"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
				/></svg
			>
			{busy ? t.finding : t.find}
		</button>
		<p class="scope">{t.scope(app.siteA?.name[app.lang] ?? '', spanFrom, spanTo, app.heightM)}</p>
	</div>

	<div class="results" aria-live="polite">
		{#if app.best.length}
			<div class="track" role="img" aria-label={t.track}>
				<span class="win" style:left="{pos(app.win.i0)}%" style:width="{Math.max(0.6, pos(app.win.i1) - pos(app.win.i0))}%"></span>
				{#each app.best as w, i (w.i0)}
					<span
						class="mark"
						class:active={isActive(w.i0, w.i1)}
						style:left="{pos(w.i0)}%"
						style:width="{Math.max(0.8, pos(w.i1) - pos(w.i0))}%"
						in:fade={{ duration: 300 * dur, delay: 120 * i * dur }}
					><b>{i + 1}</b></span>
				{/each}
			</div>
			{#if stale}
				<div class="stale" transition:fly={{ y: -6, duration: 220 * dur }}>
					{t.stale} <button class="link" onclick={find}>{t.again}</button>
				</div>
			{/if}
			<ol class="list">
				{#each app.best as w, i (w.i0 + ':' + w.i1)}
					{@const active = isActive(w.i0, w.i1)}
					<li
						class="card"
						class:active
						in:fly={{ y: 14, duration: 520 * dur, delay: 70 * i * dur, easing: cubicOut }}
					>
						<span class="rank num" aria-label="{t.rank} {i + 1}">{i + 1}</span>
						<div class="dates">
							<span class="range">{range(w.i0, w.i1)}</span>
							<span class="len">{fmtNum(((w.i1 - w.i0) * (app.eph?.step_s ?? 3600)) / 86400, 1)} {t.days}</span>
						</div>
						<div class="score">
							<span class="big"><AnimatedNumber value={w.score * 100} />&thinsp;%</span>
							<span class="cap">{t.both}</span>
						</div>
						<div class="bars">
							<div class="b sun">
								<span class="bl">{t.sun}</span>
								<span class="bt"><i style:--w={w.sunPct / 100} style:--d="{(160 + 70 * i) * dur}ms"></i></span>
								<span class="bv num">{fmtNum(w.sunPct, 0)} %</span>
							</div>
							<div class="b earth">
								<span class="bl">{t.earth}</span>
								<span class="bt"><i style:--w={w.earthPct / 100} style:--d="{(220 + 70 * i) * dur}ms"></i></span>
								<span class="bv num">{fmtNum(w.earthPct, 0)} %</span>
							</div>
						</div>
						<button class="use" class:active onclick={() => use(w.i0, w.i1)} aria-pressed={active}>
							{#if active}
								<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"
									><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tick" /></svg
								>
								{t.inUse}
							{:else}
								{t.use}
							{/if}
						</button>
					</li>
				{/each}
			</ol>
			<p class="note">{t.sunPctNote}</p>
		{:else if searched && searched.key === key}
			<p class="emptytxt" in:fade>{t.none}</p>
		{:else}
			<div class="emptybox" in:fade>
				<svg class="orbit" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
					<circle cx="32" cy="32" r="22" fill="none" stroke="rgba(255,255,255,.12)" stroke-dasharray="2 4" />
					<circle cx="32" cy="32" r="9" fill="#2a2f3a" />
					<circle class="s" cx="32" cy="10" r="3.2" fill="var(--sun)" />
					<circle class="e" cx="32" cy="54" r="2.6" fill="var(--earth)" />
				</svg>
				<p class="emptytxt">{t.empty}</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.best {
		display: grid;
		grid-template-columns: 236px minmax(0, 1fr);
		gap: 18px;
		height: 100%;
		min-height: 0;
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.stepper {
		display: flex;
		align-items: stretch;
		height: 40px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--glass-border-strong);
		background: rgba(255, 255, 255, 0.03);
		overflow: hidden;
	}
	.sbtn {
		width: 40px;
		font-size: 18px;
		color: var(--text-2);
		transition:
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast);
	}
	.sbtn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text);
	}
	.sbtn:active {
		transform: scale(0.92);
	}
	.val {
		flex: 1;
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 6px;
		border-inline: 1px solid var(--hairline);
		padding-top: 7px;
	}
	.val input {
		width: 3.4ch;
		background: none;
		border: 0;
		color: var(--text);
		font-size: 20px;
		text-align: right;
		padding: 0;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.val input::-webkit-inner-spin-button,
	.val input::-webkit-outer-spin-button {
		-webkit-appearance: none;
	}
	.val input:focus {
		outline: none;
	}
	.val:focus-within {
		background: rgba(92, 200, 255, 0.06);
	}
	.unit {
		font-size: 12px;
		color: var(--text-3);
	}
	.quick {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.qchip {
		font-size: 11.5px;
		padding: 3px 9px;
		border-radius: var(--radius-pill);
		color: var(--text-2);
		border: 1px solid var(--hairline);
		transition: all var(--dur-fast) var(--ease-out);
	}
	.qchip:hover {
		color: var(--text);
		border-color: var(--glass-border-strong);
	}
	.qchip.on {
		color: var(--text);
		border-color: color-mix(in srgb, var(--both) 50%, transparent);
		background: color-mix(in srgb, var(--both) 12%, transparent);
	}
	.find {
		position: relative;
		overflow: hidden;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 40px;
		border-radius: var(--radius-sm);
		font-weight: 600;
		font-size: 13px;
		color: #06110a;
		background: linear-gradient(135deg, var(--sun-soft), var(--both) 55%, var(--earth-soft));
		box-shadow: 0 6px 24px rgba(155, 231, 168, 0.18);
		transition:
			transform var(--dur) var(--ease-spring),
			box-shadow var(--dur) var(--ease-out),
			filter var(--dur);
	}
	.find:hover {
		transform: translateY(-1px);
		box-shadow: 0 10px 30px rgba(155, 231, 168, 0.28);
	}
	.find:active {
		transform: translateY(0) scale(0.98);
	}
	.find:disabled {
		cursor: progress;
		filter: saturate(0.6);
	}
	.shine {
		position: absolute;
		inset: 0;
		background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.55) 50%, transparent 65%);
		transform: translateX(-100%);
	}
	.find:hover .shine {
		transition: transform 900ms var(--ease-out);
		transform: translateX(100%);
	}
	.find.busy .shine {
		animation: sweep 900ms linear infinite;
	}
	@keyframes sweep {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(100%);
		}
	}
	.scope {
		margin: 0;
		font-size: 11px;
		color: var(--text-3);
		line-height: 1.4;
	}
	.results {
		position: relative;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		padding-right: 2px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.track {
		position: relative;
		flex: none;
		height: 18px;
		border-radius: 5px;
		background: repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 8.33%), rgba(255, 255, 255, 0.03);
		border: 1px solid var(--hairline);
	}
	.track .win {
		position: absolute;
		top: -3px;
		bottom: -3px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.5);
		transition:
			left var(--dur-slow) var(--ease-out),
			width var(--dur-slow) var(--ease-out);
	}
	.mark {
		position: absolute;
		top: 2px;
		bottom: 2px;
		min-width: 12px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--both) 55%, transparent);
		display: grid;
		place-items: center;
		transition: background var(--dur) var(--ease-out);
	}
	.mark b {
		font-size: 9px;
		color: #06110a;
		font-weight: 700;
	}
	.mark.active {
		background: var(--both);
		box-shadow: 0 0 10px var(--both);
	}
	.stale {
		font-size: 11.5px;
		color: var(--warning);
	}
	.link {
		color: var(--earth-soft);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.card {
		display: grid;
		grid-template-columns: 26px minmax(130px, 1.1fr) minmax(110px, 0.9fr) minmax(130px, 1.2fr) auto;
		align-items: center;
		gap: 12px;
		padding: 9px 10px 9px 8px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--hairline);
		transition:
			background var(--dur) var(--ease-out),
			border-color var(--dur) var(--ease-out),
			transform var(--dur) var(--ease-out);
	}
	.card:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.card.active {
		border-color: color-mix(in srgb, var(--both) 50%, transparent);
		background: color-mix(in srgb, var(--both) 7%, transparent);
	}
	.rank {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-2);
		background: rgba(255, 255, 255, 0.05);
	}
	.card:first-child .rank {
		color: #06110a;
		background: var(--both);
	}
	.dates {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.range {
		font-size: 12.5px;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.len {
		font-size: 11px;
		color: var(--text-3);
	}
	.score {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.big {
		white-space: nowrap;
		font-family: var(--font-display);
		font-size: 22px;
		line-height: 1.05;
		font-weight: 500;
		color: var(--both);
	}
	.cap {
		font-size: 10.5px;
		color: var(--text-3);
		line-height: 1.25;
	}
	.bars {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}
	.b {
		display: grid;
		grid-template-columns: 44px 1fr 36px;
		align-items: center;
		gap: 6px;
		font-size: 10.5px;
	}
	.bl {
		color: var(--text-3);
	}
	.bv {
		text-align: right;
		color: var(--text-2);
	}
	.bt {
		height: 5px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.06);
		overflow: hidden;
	}
	.bt i {
		display: block;
		height: 100%;
		border-radius: inherit;
		transform-origin: left;
		transform: scaleX(var(--w));
		animation: grow 900ms var(--ease-out) var(--d) both;
	}
	.sun .bt i {
		background: linear-gradient(90deg, var(--sun-dim), var(--sun));
	}
	.earth .bt i {
		background: linear-gradient(90deg, var(--earth-dim), var(--earth));
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
		}
	}
	.use {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 12px;
		border-radius: var(--radius-pill);
		font-size: 12px;
		white-space: nowrap;
		color: var(--text);
		border: 1px solid var(--glass-border-strong);
		transition:
			background var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast),
			transform var(--dur) var(--ease-spring);
	}
	.use:hover {
		background: rgba(255, 255, 255, 0.07);
	}
	.use:active {
		transform: scale(0.96);
	}
	.use.active {
		color: #06110a;
		background: var(--both);
		border-color: transparent;
	}
	.tick {
		stroke-dasharray: 16;
		stroke-dashoffset: 16;
		animation: draw 420ms var(--ease-out) 80ms forwards;
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	.note {
		margin: 0;
		font-size: 10.5px;
		color: var(--text-3);
	}
	.emptybox {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 100%;
		padding: 0 8px;
	}
	.emptytxt {
		margin: 0;
		font-size: 12.5px;
		color: var(--text-2);
		max-width: 52ch;
		line-height: 1.5;
	}
	.orbit {
		flex: none;
	}
	.orbit .s,
	.orbit .e {
		transform-origin: 32px 32px;
		animation: spin 9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@container planner (max-width: 900px) {
		.card {
			grid-template-columns: 26px minmax(0, 1fr) auto;
			grid-template-areas: 'r d u' 'r s s' 'r b b';
			row-gap: 6px;
		}
		.rank {
			grid-area: r;
			align-self: start;
		}
		.dates {
			grid-area: d;
		}
		.use {
			grid-area: u;
		}
		.score {
			grid-area: s;
			flex-direction: row;
			align-items: baseline;
			gap: 8px;
		}
		.bars {
			grid-area: b;
		}
	}
	@container planner (max-width: 640px) {
		.best {
			grid-template-columns: 1fr;
			grid-auto-rows: max-content;
			overflow-y: auto;
			gap: 12px;
		}
		.results {
			overflow: visible;
		}
		.emptybox {
			height: auto;
		}
	}
</style>
