<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- The three big numbers: sunlight, Earth in view, longest night. One site = three ring tiles;
     two sites = comparison rows (A white, B violet) with the difference highlighted. -->
<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { app } from '#lib/state.svelte.ts';
	import { COMMON, fmtNum } from '#lib/i18n.ts';
	import { prefersReducedMotion } from 'svelte/motion';
	import { MediaQuery } from 'svelte/reactivity';
	import { T } from './strings.ts';
	import { nightParts, periodLabel, metres, signed, pctDigits, marginText, type MetricKey } from './format.ts';
	import Ring from './Ring.svelte';
	import Count from './Count.svelte';

	const mobile = new MediaQuery('max-width: 767px');
	const ringSize = $derived(mobile.current ? 64 : 92);

	interface Props {
		focus?: MetricKey;
		/** tiles are buttons that pick the explained metric (teacher mode) */
		selectable?: boolean;
	}
	let { focus = $bindable('sun'), selectable = false }: Props = $props();

	const t = $derived(T[app.lang]);
	const c = $derived(COMMON[app.lang]);
	const A = $derived(app.viewA?.stats ?? null);
	const B = $derived(app.viewB?.stats ?? null);
	const digits = $derived(pctDigits());
	const LUNAR_DAY_H = 708.7;
	const mo = (d: number) => (prefersReducedMotion.current ? 0 : d);

	interface Row {
		key: MetricKey;
		name: string;
		caption: string;
		/** plain-language explanation (tooltip / accessible description) */
		plain: string;
		color: string;
		a: number;
		b: number | null;
		/** higher is better? */
		up: boolean;
		frac: (v: number) => number;
	}
	const rows = $derived<Row[]>(
		A
			? [
					{ key: 'sun', name: c.sun, caption: t.sunCaption, plain: t.sunPlain, color: 'var(--sun)', a: A.sunPct, b: B?.sunPct ?? null, up: true, frac: (v) => v / 100 },
					{ key: 'earth', name: c.earth, caption: t.earthCaption, plain: t.earthPlain, color: 'var(--earth)', a: A.earthPct, b: B?.earthPct ?? null, up: true, frac: (v) => v / 100 },
					{ key: 'night', name: c.night, caption: t.nightCaption, plain: t.nightPlain, color: '#8f8ac9', a: A.longestNightH, b: B?.longestNightH ?? null, up: false, frac: (v) => v / LUNAR_DAY_H }
				]
			: []
	);

	function diffText(r: Row): string {
		if (r.b === null) return '';
		const d = r.b - r.a;
		if (r.key === 'night') {
			const days = Math.abs(d) >= 48;
			return days ? `${signed(d / 24, 1)} ${c.days}` : `${signed(d, 0)} ${c.hours}`;
		}
		return `${signed(d, digits)} ${t.pp}`;
	}
	function winner(r: Row): 'A' | 'B' | null {
		if (r.b === null) return null;
		const eps = r.key === 'night' ? 1 : 0.5;
		if (Math.abs(r.b - r.a) < eps) return null;
		return (r.b > r.a) === r.up ? 'B' : 'A';
	}
	const summary = $derived(
		rows
			.map((r) => {
				const f = (v: number) => (r.key === 'night' ? `${nightParts(v).value} ${nightParts(v).unit}` : `${fmtNum(v, digits)}%`);
				return `${r.name}: ${f(r.a)}${r.b !== null ? ` / ${f(r.b)}` : ''}`;
			})
			.join('; ')
	);
	const shortName = (s: { name: Record<'en' | 'uk', string> } | null | undefined) => s?.name[app.lang] ?? '';
</script>

{#snippet value(r: Row, v: number, size: 'xl' | 'lg', delay: number)}
	{#if r.key === 'night'}
		<Count value={v} {delay}>
			{#snippet render(x: number)}
				{@const p = nightParts(x, !(mobile.current && size === 'lg'))}
				<span class="big {size} num">{p.value}</span><span class="unit">{p.unit}</span>
			{/snippet}
		</Count>
	{:else}
		<Count value={v} {delay}>
			{#snippet render(x: number)}
				<span class="big {size} num">{fmtNum(x, digits)}<small>%</small></span>
			{/snippet}
		</Count>
	{/if}
{/snippet}

<div class="metrics">
	<p class="sr-only" aria-live="polite">{summary}</p>
	{#if !B}
		<div class="tiles" in:fade={{ duration: mo(260) }}>
			{#each rows as r, k (r.key)}
				<svelte:element
					this={selectable ? 'button' : 'div'}
					class="tile"
					class:selectable
					class:focus={selectable && focus === r.key}
					style:--c={r.color}
					aria-pressed={selectable ? focus === r.key : undefined}
					onclick={selectable ? () => (focus = r.key) : undefined}
					role={selectable ? undefined : 'group'}
					aria-label={selectable ? `${r.name}. ${t.why}` : r.name}
					title={r.plain}
				>
					<Ring frac={r.frac(r.a)} color={r.color} delay={k * 110} size={ringSize}>
						<div class="inring">
							{@render value(r, r.a, 'xl', k * 110)}
						</div>
					</Ring>
					<span class="name">{r.name}</span>
					<span class="cap">{r.caption}</span>
					{#if r.key === 'earth'}
						<span class="cap sub">{t.marginLine} {marginText(app.earthMarginDeg)}</span>
					{/if}
					{#if selectable}<span class="whydot" aria-hidden="true">?</span>{/if}
				</svelte:element>
			{/each}
		</div>
	{:else}
		<div class="cmp" in:fade={{ duration: mo(260) }}>
			<div class="cmp-head">
				<span></span>
				<span class="who a" title={shortName(app.siteA)}><i></i><span class="nm">{shortName(app.siteA)}</span></span>
				<span class="who b" title={shortName(app.siteB)}><i></i><span class="nm">{shortName(app.siteB)}</span></span>
				<span class="who d" title={t.diff}><span class="sr-only">{t.diff}</span><span aria-hidden="true">Δ {t.diffShort}</span></span>
			</div>
			{#each rows as r, k (r.key)}
				{@const w = winner(r)}
				{@const better = w === 'B' ? 'good' : w === 'A' ? 'bad' : 'even'}
				<div
					class="crow"
					style:--c={r.color}
					in:fly={{ y: 10, duration: mo(420), delay: mo(k * 70), easing: cubicOut }}
				>
					<svelte:element
						this={selectable ? 'button' : 'div'}
						class="rname"
						class:focus={selectable && focus === r.key}
						onclick={selectable ? () => (focus = r.key) : undefined}
						aria-pressed={selectable ? focus === r.key : undefined}
						role={selectable ? undefined : 'rowheader'}
					>
						<span class="sw"></span>{r.name}
					</svelte:element>
					<span class="cell a" class:win={w === 'A'}>{@render value(r, r.a, 'lg', k * 90)}</span>
					<span class="cell b" class:win={w === 'B'}>{@render value(r, r.b ?? 0, 'lg', k * 90 + 60)}</span>
					<span class="delta num {better}">{diffText(r)}</span>
					<div class="duo" aria-hidden="true">
						<span class="track"><span class="fill a" style:transform="scaleX({Math.min(1, r.frac(r.a))})"></span></span>
						<span class="track"><span class="fill b" style:transform="scaleX({Math.min(1, r.frac(r.b ?? 0))})"></span></span>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="meta">
		<span class="chip">
			<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 7h12M5 1.5v3M11 1.5v3" /></svg>
			<span class="sr-only">{t.periodLabel}:</span>{periodLabel()}
		</span>
		<span class="chip">
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15V5M4 15h8M3 2l5 3 5-3" /></svg>
			<span class="hl-long">{t.heightLine}:</span><span class="hl-short">{t.heightShort}:</span> <b class="num">{metres(app.heightM)}</b>
		</span>
		{#if B}
			<span class="chip"><span class="edot"></span>{t.marginLine} {marginText(app.earthMarginDeg)}</span>
		{/if}
	</div>
</div>

<style>
	.metrics {
		display: grid;
		gap: 12px;
	}
	/* ---- single site ---- */
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.tile {
		position: relative;
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 2px;
		padding: 12px 4px 10px;
		border-radius: var(--radius);
		text-align: center;
		background: radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--c) 9%, transparent), transparent 70%);
		border: 1px solid transparent;
		transition:
			border-color var(--dur) var(--ease-out),
			background-color var(--dur) var(--ease-out),
			transform var(--dur) var(--ease-spring);
	}
	.tile.selectable:hover {
		transform: translateY(-2px);
		border-color: var(--hairline);
	}
	.tile.selectable:active {
		transform: scale(0.97);
	}
	.tile.focus {
		border-color: color-mix(in srgb, var(--c) 45%, transparent);
		background-color: color-mix(in srgb, var(--c) 6%, transparent);
	}
	.inring {
		display: grid;
		justify-items: center;
		line-height: 1;
	}
	.big {
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
	}
	.big.xl {
		font-size: 25px;
	}
	.big small {
		font-size: 0.55em;
		font-weight: 500;
		color: var(--text-2);
		margin-left: 1px;
	}
	.unit {
		font-size: 10.5px;
		color: var(--text-2);
		margin-top: 3px;
	}
	.name {
		margin-top: 8px;
		font-size: 13px;
		font-weight: 600;
		color: color-mix(in srgb, var(--c) 70%, white);
	}
	.cap {
		font-size: 11px;
		line-height: 1.3;
		color: var(--text-3);
		max-width: 14ch;
	}
	.cap.sub {
		color: var(--earth);
		opacity: 0.8;
	}
	.whydot {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 16px;
		height: 16px;
		display: grid;
		place-content: center;
		border-radius: 50%;
		font-size: 10px;
		font-weight: 700;
		color: var(--c);
		border: 1px solid color-mix(in srgb, var(--c) 50%, transparent);
		opacity: 0.6;
		transition: opacity var(--dur-fast);
	}
	.tile.focus .whydot {
		opacity: 1;
		background: color-mix(in srgb, var(--c) 18%, transparent);
	}

	/* ---- comparison ---- */
	.cmp {
		display: grid;
		gap: 4px;
	}
	.cmp-head,
	.crow {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.95fr);
		align-items: center;
		gap: 6px;
	}
	.cmp-head {
		font-size: 11px;
		color: var(--text-3);
		padding: 0 6px 2px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		white-space: nowrap;
	}
	.who .nm {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.who i {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--site-a);
	}
	.who.b i {
		background: var(--site-b);
		box-shadow: 0 0 8px var(--site-b);
	}
	.who.a {
		color: var(--text);
	}
	.who.b {
		color: var(--site-b);
	}
	.who.d {
		justify-content: flex-end;
		font-size: 10px;
	}
	.crow {
		position: relative;
		padding: 8px 6px 12px;
		border-radius: var(--radius-sm);
		background: linear-gradient(90deg, color-mix(in srgb, var(--c) 8%, transparent), transparent 60%);
	}
	.rname {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 12.5px;
		font-weight: 600;
		text-align: left;
		color: color-mix(in srgb, var(--c) 70%, white);
		border-radius: 6px;
		min-width: 0;
	}
	.rname.focus {
		text-decoration: underline;
		text-underline-offset: 4px;
		text-decoration-color: var(--c);
	}
	.sw {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--c);
		box-shadow: 0 0 8px var(--c);
	}
	.cell {
		display: flex;
		align-items: baseline;
		gap: 3px;
		padding: 3px 6px;
		border-radius: 8px;
		transition: background var(--dur), box-shadow var(--dur);
	}
	.cell.b .big {
		color: var(--site-b);
	}
	.cell.win {
		background: color-mix(in srgb, var(--c) 12%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent);
	}
	.big.lg {
		font-size: 20px;
	}
	.cell .unit {
		margin: 0;
	}
	.delta {
		justify-self: end;
		font-size: 12.5px;
		font-weight: 600;
		padding: 3px 7px;
		border-radius: var(--radius-pill);
		white-space: nowrap;
		transition: color var(--dur), background var(--dur);
	}
	.delta.good {
		color: var(--both);
		background: rgba(155, 231, 168, 0.1);
	}
	.delta.bad {
		color: #ff9b9b;
		background: rgba(255, 107, 107, 0.1);
	}
	.delta.even {
		color: var(--text-3);
	}
	.duo {
		position: absolute;
		left: 6px;
		right: 6px;
		bottom: 4px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.track {
		height: 2px;
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.06);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		transform-origin: left;
		transition: transform 800ms var(--ease-out);
	}
	.fill.a {
		background: var(--site-a);
		opacity: 0.8;
	}
	.fill.b {
		background: var(--site-b);
	}

	/* ---- meta ---- */
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 9px;
		border-radius: var(--radius-pill);
		font-size: 11.5px;
		color: var(--text-2);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--hairline);
	}
	.chip b {
		color: var(--text);
		font-weight: 600;
	}
	.chip svg {
		width: 13px;
		height: 13px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.8;
	}
	.hl-short {
		display: none;
	}
	.edot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--earth);
	}

	@media (max-width: 767px) {
		.big.xl {
			font-size: 18px;
		}
		.metrics {
			gap: 8px;
		}
		.meta {
			flex-wrap: nowrap;
			gap: 4px;
		}
		.chip {
			padding: 3px 8px;
			font-size: 11px;
			white-space: nowrap;
			gap: 5px;
		}
		.hl-long {
			display: none;
		}
		.hl-short {
			display: inline;
		}
		.big.lg {
			font-size: 17px;
		}
		.crow {
			padding: 6px 4px 10px;
		}
		.cmp-head,
		.crow {
			grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr) minmax(0, 0.95fr) auto;
			gap: 4px;
		}
		.cell {
			padding: 3px 4px;
			min-width: 0;
		}
		.delta {
			font-size: 11.5px;
			padding: 2px 6px;
		}
		.rname {
			font-size: 12px;
			gap: 5px;
		}
		.meta {
			overflow-x: auto;
			scrollbar-width: none;
			margin: 0 -14px;
			padding: 0 14px;
		}
		.tile {
			padding: 6px 2px 6px;
		}
		.cap {
			display: none;
		}
		.cap.sub {
			display: block;
		}
		.name {
			margin-top: 5px;
		}
	}
</style>
