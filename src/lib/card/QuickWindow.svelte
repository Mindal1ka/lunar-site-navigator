<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- "When to land": the best 14-day window for site A inside the selected period, ranked like the
     planner's best-window search (share of hours with the Sun and the Earth in view together).
     Clicking it moves the time cursor to the start of the window. -->
<script lang="ts">
	import { app, QUICK_DAYS } from '#lib/state.svelte.ts';
	import { timeOf } from '#lib/engine/visibility.ts';
	import { fmtDate, fmtPct } from '#lib/i18n.ts';
	import { metres } from './format.ts';

	const T = {
		en: {
			title: `Best ${QUICK_DAYS}-day landing window`,
			both: 'Sun + Earth together',
			sun: 'Sun',
			earth: 'Earth',
			tip: (h: string) =>
				`Within the selected period. Ranked by the share of hours when the Sun (average visible share of the disk) and the Earth are in view together. Panel/antenna height: ${h}. Click to move the time cursor there.`
		},
		uk: {
			title: `Найкраще ${QUICK_DAYS}-денне вікно посадки`,
			both: 'Сонце + Земля разом',
			sun: 'Сонце',
			earth: 'Земля',
			tip: (h: string) =>
				`У межах вибраного періоду. Упорядковано за часткою годин, коли водночас видно Сонце (середня видима частка диска) і Землю. Висота панелі/антени: ${h}. Натисніть, щоб перемістити курсор часу.`
		}
	};
	const t = $derived(T[app.lang]);
	const w = $derived(app.quickBest);
	const range = $derived(
		w && app.eph
			? `${fmtDate(timeOf(app.eph, w.i0), { day: 'numeric', month: 'short' })} – ${fmtDate(timeOf(app.eph, w.i1))}`
			: ''
	);
	const active = $derived(!!w && app.t >= w.i0 && app.t < w.i1);
</script>

{#if w}
	<button class="qw" class:active onclick={() => (app.t = w.i0)} title={t.tip(metres(app.heightM))}>
		<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 7h12M5 1.5v3M11 1.5v3" /><path d="m6 10.5 1.5 1.5L10.5 9" /></svg>
		<span class="txt">
			<span class="k">{t.title}</span>
			<span class="v"><b class="num">{range}</b></span>
			<span class="s num">
				<span class="both">{fmtPct(100 * w.score, 0)}% {t.both}</span>
				<span class="dot">·</span><span class="sun">{t.sun} {fmtPct(w.sunPct, 0)}%</span>
				<span class="dot">·</span><span class="earth">{t.earth} {fmtPct(w.earthPct, 0)}%</span>
			</span>
		</span>
	</button>
{/if}

<style>
	.qw {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		margin-top: 10px;
		padding: 9px 12px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: linear-gradient(90deg, rgba(255, 181, 71, 0.08), rgba(92, 200, 255, 0.08));
		color: inherit;
		text-align: left;
		font: inherit;
		cursor: pointer;
		transition: border-color 0.2s, background 0.2s;
	}
	.qw:hover,
	.qw:focus-visible {
		border-color: rgba(255, 255, 255, 0.28);
	}
	.qw.active {
		border-color: rgba(92, 200, 255, 0.45);
	}
	svg {
		flex: none;
		width: 16px;
		height: 16px;
		margin-top: 2px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.8;
	}
	.txt {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.k {
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		opacity: 0.65;
	}
	.v {
		font-size: 15px;
	}
	.s {
		font-size: 12px;
		opacity: 0.85;
		display: flex;
		flex-wrap: wrap;
		column-gap: 5px;
	}
	.both {
		color: #fff;
	}
	.sun {
		color: var(--sun);
	}
	.earth {
		color: var(--earth);
	}
	.dot {
		opacity: 0.5;
	}
</style>
