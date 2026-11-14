<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Battery sizing: capacity = load x longest night / allowed depth of discharge
     (engine batteryWh), for site A and site B when comparing. -->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app, BATTERY_PRESETS, type BatteryPreset, type SiteView } from '#lib/state.svelte.ts';
	import { batteryWh, timeOf } from '#lib/engine/visibility.ts';
	import { fmtDate, fmtDuration, fmtNum } from '#lib/i18n.ts';
	import AnimatedNumber from './AnimatedNumber.svelte';
	import { UNITS, clamp, periodLabel } from './format.ts';

	const T = {
		en: {
			presets: { rover: 'Small rover', lander: 'Lander', base: 'Base', custom: 'Custom' },
			load: 'Load',
			loadHint: 'Average power drawn through the night',
			dod: 'Allowed discharge',
			dodHint: 'Share of the battery you may use (depth of discharge)',
			result: 'Battery needed',
			formula: 'capacity = load × longest night ÷ allowed discharge',
			night: 'Longest night',
			starts: 'starts',
			period: 'Period',
			height: 'Panel/antenna height',
			noNight: 'The Sun never fully sets in this period, so no night storage is needed.',
			allDark: 'The Sun never rises above the horizon in this period: solar panels cannot recharge a battery here.',
			assumptions: 'Assumptions',
			a1: 'No heating loads modelled (survival heaters are often the largest night load).',
			a2: 'Panel output is not modelled: the battery is assumed full at sunset.',
			a3: 'Longest night is taken from the selected period at the selected height.',
			usable: 'usable',
			reserve: 'reserve'
		},
		uk: {
			presets: { rover: 'Малий ровер', lander: 'Посадковий модуль', base: 'База', custom: 'Свій' },
			load: 'Навантаження',
			loadHint: 'Середня потужність, яку споживають уночі',
			dod: 'Допустимий розряд',
			dodHint: 'Частка батареї, яку можна використати (глибина розряду)',
			result: 'Потрібна батарея',
			formula: 'ємність = навантаження × найдовша ніч ÷ допустимий розряд',
			night: 'Найдовша ніч',
			starts: 'початок',
			period: 'Період',
			height: 'Висота панелі/антени',
			noNight: 'Сонце за цей період ніколи повністю не заходить, тож нічний запас не потрібен.',
			allDark: 'Сонце за цей період не піднімається над горизонтом: сонячні панелі тут не зарядять батарею.',
			assumptions: 'Припущення',
			a1: 'Навантаження на обігрів не враховано (нагрівачі часто найбільше нічне споживання).',
			a2: 'Вироблення панелей не моделюється: вважаємо, що на заході Сонця батарея повна.',
			a3: 'Найдовша ніч — із вибраного періоду на вибраній висоті.',
			usable: 'робоча',
			reserve: 'резерв'
		}
	};
	const t = $derived(T[app.lang]);
	const presets: BatteryPreset[] = ['rover', 'lander', 'base', 'custom'];
	const u = $derived(UNITS[app.lang]);
	const W = (w: number) => (w >= 1000 ? `${fmtNum(w / 1000, w % 1000 ? 1 : 0)} ${u.kW}` : `${fmtNum(w)} ${u.W}`);

	function setLoad(v: number) {
		const w = clamp(Math.round(v), 1, 100000);
		app.loadW = w;
		const match = (Object.keys(BATTERY_PRESETS) as (keyof typeof BATTERY_PRESETS)[]).find((k) => BATTERY_PRESETS[k] === w);
		app.batteryPreset = match ?? 'custom';
	}

	/** ARIA radio group: arrow keys move the selection (roving tabindex) */
	function onPresetKey(e: KeyboardEvent) {
		const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
		if (!d) return;
		e.preventDefault();
		const i = presets.indexOf(app.batteryPreset);
		const next = presets[(i + d + presets.length) % presets.length];
		app.setBatteryPreset(next);
		(e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`[data-p="${next}"]`)?.focus();
	}

	interface Res {
		slot: 'A' | 'B';
		name: string;
		nightH: number;
		start: string;
		kwh: number;
		kind: 'ok' | 'noNight' | 'allDark';
	}
	const stepH = $derived((app.eph?.step_s ?? 3600) / 3600);
	function res(v: SiteView, slot: 'A' | 'B'): Res {
		const nightH = v.stats.longestNightH;
		const spanH = v.series.n * stepH;
		const kind = nightH <= 0 ? 'noNight' : nightH >= spanH - stepH * 0.5 ? 'allDark' : 'ok';
		return {
			slot,
			name: v.site.name[app.lang],
			nightH,
			start: app.eph ? fmtDate(timeOf(app.eph, v.stats.longestNightStart)) : '',
			kwh: batteryWh(app.loadW, nightH, app.dod) / 1000,
			kind
		};
	}
	const results = $derived([app.viewA ? res(app.viewA, 'A') : null, app.viewB ? res(app.viewB, 'B') : null].filter((r): r is Res => !!r));
	const period = $derived(app.eph ? periodLabel(app.eph, app.win.i0, app.win.i1) : '');
	const dur = $derived(prefersReducedMotion.current ? 0 : 1);
	const kwhDigits = (v: number) => (v === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2);
</script>

<div class="battery">
	<div class="inputs">
		<div class="seg" role="radiogroup" aria-label={t.load} tabindex="-1" onkeydown={onPresetKey}>
			{#each presets as p (p)}
				<button
					role="radio"
					aria-checked={app.batteryPreset === p}
					tabindex={app.batteryPreset === p ? 0 : -1}
					data-p={p}
					class:on={app.batteryPreset === p}
					onclick={() => app.setBatteryPreset(p)}
				>
					<span class="pn">{t.presets[p]}</span>
					{#if p !== 'custom'}<span class="pw mono">{W(BATTERY_PRESETS[p])}</span>{/if}
				</button>
			{/each}
		</div>

		<div class="row2">
			<label class="field">
				<span class="label">{t.load}</span>
				<span class="inbox">
					<input
						class="num"
						type="number"
						min="1"
						step="10"
						max="100000"
						value={app.loadW}
						oninput={(e) => {
							// live update only for valid values, so clearing the field to retype does not snap to 1
							const v = e.currentTarget.valueAsNumber;
							if (Number.isFinite(v) && v >= 1) setLoad(v);
						}}
						onchange={(e) => {
							const v = e.currentTarget.valueAsNumber;
							setLoad(Number.isFinite(v) && v >= 1 ? v : app.loadW);
							e.currentTarget.value = String(app.loadW);
						}}
						aria-describedby="load-hint"
					/>
					<span class="unit">{u.W}</span>
				</span>
				<span class="hint" id="load-hint">{t.loadHint}</span>
			</label>
			<label class="field">
				<span class="label">{t.dod} <b class="num">{fmtNum(app.dod * 100)} %</b></span>
				<input
					class="range"
					type="range"
					min="0.2"
					max="1"
					step="0.05"
					bind:value={app.dod}
					style:--p={(app.dod - 0.2) / 0.8}
					aria-describedby="dod-hint"
					aria-valuetext="{fmtNum(app.dod * 100)} %"
				/>
				<span class="hint" id="dod-hint">{t.dodHint}</span>
			</label>
		</div>
	</div>

	<div class="out">
		<div class="results" class:two={results.length === 2}>
			{#each results as r (r.slot)}
				<div class="res" in:fly={{ y: 10, duration: 420 * dur, easing: cubicOut }}>
					<svg class="cell" viewBox="0 0 30 52" width="26" height="46" aria-hidden="true">
						<rect x="10" y="1" width="10" height="4" rx="1.5" fill="rgba(255,255,255,.25)" />
						<rect x="1.5" y="5" width="27" height="45" rx="5" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.5" />
						<rect class="reserve" x="4.5" y="8" width="21" height="39" rx="3" />
						<rect class="fill" class:b={r.slot === 'B'} x="4.5" y="8" width="21" height="39" rx="3" style:--dod={app.dod} />
					</svg>
					<div class="rbody">
						<div class="rhead">
							<span class="tag" class:tb={r.slot === 'B'}>{r.slot}</span>
							<span class="rname" title={r.name}>{r.name}</span>
						</div>
						{#if r.kind === 'allDark'}
							<div class="kwh dim"><span class="num">—</span></div>
							<p class="warn">{t.allDark}</p>
						{:else}
							<div class="kwh">
								<AnimatedNumber value={r.kwh} digits={kwhDigits(r.kwh)} /><span class="u">{u.kWh}</span>
							</div>
							{#if r.kind === 'noNight'}
								<p class="ok">{t.noNight}</p>
							{:else}
								<p class="calc mono">
									{W(app.loadW)} × {fmtNum(r.nightH)} {u.h} ÷ {fmtNum(app.dod, 2)} = {fmtNum(r.kwh, kwhDigits(r.kwh))} {u.kWh}
								</p>
								<p class="meta">{t.night}: <b>{fmtDuration(r.nightH)}</b>, {t.starts} {r.start}</p>
							{/if}
						{/if}
					</div>
				</div>
			{/each}
		</div>
		<p class="formula"><span class="label">{t.result}</span> <span class="mono">{t.formula}</span></p>
		<p class="ctx">{t.period}: {period} · {t.height}: {app.heightM} {u.m}</p>
		<details class="assume" open>
			<summary>{t.assumptions}</summary>
			<ul>
				<li>{t.a1}</li>
				<li>{t.a2}</li>
				<li>{t.a3}</li>
			</ul>
		</details>
	</div>
</div>

<style>
	.battery {
		display: grid;
		grid-template-columns: minmax(250px, 0.9fr) minmax(0, 1.3fr);
		gap: 20px;
		height: 100%;
		min-height: 0;
	}
	.inputs {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.seg {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
		padding: 3px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--hairline);
	}
	.seg button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		min-height: 42px;
		padding: 4px 4px;
		border-radius: 7px;
		color: var(--text-2);
		transition:
			background var(--dur) var(--ease-out),
			color var(--dur-fast),
			transform var(--dur) var(--ease-spring);
	}
	.seg button:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.04);
	}
	.seg button:active {
		transform: scale(0.96);
	}
	.seg button.on {
		color: var(--text);
		background: rgba(255, 255, 255, 0.1);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
	}
	.pn {
		font-size: 12px;
		line-height: 1.15;
		text-align: center;
	}
	.pw {
		font-size: 10px;
		color: var(--text-3);
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.field .label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.field .label b {
		white-space: nowrap;
		color: var(--text);
		font-weight: 500;
		letter-spacing: 0;
		margin-left: 4px;
	}
	.inbox {
		display: flex;
		align-items: baseline;
		gap: 6px;
		height: 38px;
		padding: 0 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--glass-border-strong);
		background: rgba(255, 255, 255, 0.03);
		transition:
			border-color var(--dur-fast),
			background var(--dur-fast);
	}
	.inbox:focus-within {
		border-color: color-mix(in srgb, var(--sun) 60%, transparent);
		background: rgba(255, 181, 71, 0.05);
	}
	.inbox input {
		flex: 1;
		min-width: 0;
		height: 100%;
		background: none;
		border: 0;
		color: var(--text);
		font-size: 18px;
		padding: 0;
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.inbox input::-webkit-inner-spin-button {
		-webkit-appearance: none;
	}
	.inbox input:focus {
		outline: none;
	}
	.unit {
		color: var(--text-3);
		font-size: 12px;
	}
	.hint {
		font-size: 10.5px;
		color: var(--text-3);
		line-height: 1.3;
	}
	.range {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 38px;
		background: none;
		margin: 0;
	}
	.range::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(90deg, var(--sun) calc(var(--p) * 100%), rgba(255, 255, 255, 0.12) 0);
	}
	.range::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(90deg, var(--sun) calc(var(--p) * 100%), rgba(255, 255, 255, 0.12) 0);
	}
	.range::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 18px;
		height: 18px;
		margin-top: -7px;
		border-radius: 50%;
		background: var(--text);
		box-shadow: 0 0 0 4px rgba(255, 181, 71, 0.25);
		transition: transform var(--dur-fast) var(--ease-spring);
	}
	.range::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border: 0;
		border-radius: 50%;
		background: var(--text);
		box-shadow: 0 0 0 4px rgba(255, 181, 71, 0.25);
	}
	.range:active::-webkit-slider-thumb {
		transform: scale(1.2);
	}
	.range:focus-visible {
		outline-offset: -4px;
	}
	.out {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}
	.results {
		display: grid;
		gap: 8px;
	}
	.results.two {
		grid-template-columns: 1fr 1fr;
	}
	.res {
		display: flex;
		gap: 12px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: linear-gradient(160deg, rgba(255, 181, 71, 0.07), rgba(255, 255, 255, 0.02) 60%);
		border: 1px solid var(--hairline);
		min-width: 0;
	}
	.cell {
		flex: none;
		margin-top: 4px;
	}
	.reserve {
		fill: rgba(109, 106, 146, 0.35);
	}
	.fill {
		fill: var(--sun);
		transform-box: fill-box;
		transform-origin: 50% 100%;
		transform: scaleY(var(--dod));
		transition: transform var(--dur-slow) var(--ease-spring);
		filter: drop-shadow(0 0 4px rgba(255, 181, 71, 0.6));
	}
	.fill.b {
		fill: var(--site-b);
		filter: drop-shadow(0 0 4px rgba(196, 155, 255, 0.6));
	}
	.rbody {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rhead {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
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
	.rname {
		font-size: 11.5px;
		color: var(--text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.kwh {
		font-family: var(--font-display);
		font-size: 34px;
		line-height: 1.05;
		font-weight: 500;
		letter-spacing: -0.02em;
		color: var(--text);
	}
	.kwh.dim {
		color: var(--text-3);
	}
	.kwh .u {
		font-size: 14px;
		color: var(--text-2);
		margin-left: 5px;
		letter-spacing: 0;
	}
	.calc {
		margin: 2px 0 0;
		font-size: 10.5px;
		color: var(--sun-soft);
		line-height: 1.35;
	}
	.meta,
	.ok,
	.warn {
		margin: 0;
		font-size: 11px;
		color: var(--text-3);
		line-height: 1.35;
	}
	.meta b {
		color: var(--text-2);
		font-weight: 500;
	}
	.ok {
		color: var(--both);
	}
	.warn {
		color: var(--warning);
	}
	.formula {
		margin: 2px 0 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
		font-size: 11.5px;
		color: var(--text-2);
	}
	.ctx {
		margin: 0;
		font-size: 11px;
		color: var(--text-3);
	}
	.assume {
		font-size: 11px;
		color: var(--text-3);
	}
	.assume summary {
		cursor: pointer;
		color: var(--text-2);
		width: fit-content;
		border-radius: 4px;
	}
	.assume ul {
		margin: 4px 0 0;
		padding-left: 16px;
		display: grid;
		gap: 2px;
	}

	@container planner (max-width: 760px) {
		.battery {
			grid-template-columns: 1fr;
			grid-auto-rows: max-content;
			overflow-y: auto;
			gap: 12px;
		}
		.out {
			overflow: visible;
		}
	}
	@container planner (max-width: 460px) {
		.results.two {
			grid-template-columns: 1fr;
		}
		.row2 {
			grid-template-columns: 1fr;
		}
		.seg {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
