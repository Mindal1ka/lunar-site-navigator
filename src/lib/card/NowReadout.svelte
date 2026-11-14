<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Live readout for the time cursor app.t: Sun and Earth against the real local horizon. -->
<script lang="ts">
	import { app } from '#lib/state.svelte.ts';
	import { fmtDateTime, fmtNum } from '#lib/i18n.ts';
	import { instantAt, siteRadius, timeOf, type Instant } from '#lib/engine/visibility.ts';
	import type { Site } from '#lib/engine/data.ts';
	import { T } from './strings.ts';

	const t = $derived(T[app.lang]);

	function inst(site: Site | null | undefined): Instant | null {
		const eph = app.eph;
		if (!eph || !site?.horizons) return null;
		const prof = site.horizons[app.heightIndex];
		return instantAt(prof, site.lat, site.lon, siteRadius(site.elevation_m, app.heightM), eph, app.t, app.earthMarginDeg);
	}

	const rows = $derived(
		[
			{ slot: 'A' as const, i: inst(app.siteA) },
			...(app.siteB ? [{ slot: 'B' as const, i: inst(app.siteB) }] : [])
		].filter((r): r is { slot: 'A' | 'B'; i: Instant } => !!r.i)
	);
	const when = $derived(app.eph ? fmtDateTime(timeOf(app.eph, Math.floor(app.t))) : '');

	const H = 22; // horizon line y in the glyph
	const sunY = (i: Instant) => H - Math.max(-2.2, Math.min(2.2, (i.sunEl - i.horizonUnderSun) / i.sunRadiusDeg)) * 7;
	const earthY = (i: Instant) => H - Math.max(-3, Math.min(3, (i.earthEl - i.horizonUnderEarth) / 1.5)) * 6;
</script>

<div class="now">
	<div class="head">
		<span class="lbl">{t.now}</span>
		<span class="when mono">{when}</span>
	</div>
	{#each rows as r (r.slot)}
		{@const i = r.i}
		<div class="row" class:b={r.slot === 'B'}>
			{#if rows.length > 1}<span class="slot" aria-label={r.slot === 'A' ? t.slotA : t.slotB}>{r.slot}</span>{/if}
			<div class="cell">
				<svg class="glyph" viewBox="0 0 44 32" aria-hidden="true">
					<defs>
						<clipPath id="sky-{r.slot}"><rect x="0" y="0" width="44" height={H} /></clipPath>
						<radialGradient id="sg-{r.slot}">
							<stop offset="0" stop-color="#fff3d6" />
							<stop offset="0.6" style="stop-color: var(--sun)" />
							<stop offset="1" style="stop-color: var(--sun); stop-opacity: 0" />
						</radialGradient>
					</defs>
					<circle class="halo" cx="22" cy={sunY(i)} r="11" fill="url(#sg-{r.slot})" clip-path="url(#sky-{r.slot})" opacity={i.sunFrac * 0.45} />
					<circle class="disk" cx="22" cy={sunY(i)} r="7" clip-path="url(#sky-{r.slot})" />
					<path class="terrain" d="M0 {H} L8 {H - 1} L15 {H} L26 {H - 2} L34 {H} L44 {H - 1} L44 32 L0 32 Z" />
				</svg>
				<div class="txt">
					<span class="k">{t.sunEl}</span>
					<span class="v num sun">{fmtNum(i.sunEl, 2)}°</span>
					<span class="s">
						{t.horizonHere} {fmtNum(i.horizonUnderSun, 2)}° ·
						<b class:on={i.sunFrac > 0}>{fmtNum(i.sunFrac * 100, 0)}% {t.visible}</b>
					</span>
				</div>
			</div>
			<div class="cell">
				<svg class="glyph" viewBox="0 0 44 32" aria-hidden="true">
					<line class="margin" x1="0" x2="44" y1={H - (app.earthMarginDeg / 1.5) * 6} y2={H - (app.earthMarginDeg / 1.5) * 6} />
					<circle class="earth" class:vis={i.earthVisible} cx="22" cy={earthY(i)} r="5" />
					<path class="terrain" d="M0 {H} L10 {H - 2} L18 {H} L30 {H - 1} L44 {H} L44 32 L0 32 Z" />
				</svg>
				<div class="txt">
					<span class="k">{t.earthEl}</span>
					<span class="v num earthc">{fmtNum(i.earthEl, 2)}°</span>
					<span class="s">
						{t.horizonHere} {fmtNum(i.horizonUnderEarth, 2)}° ·
						<b class:on={i.earthVisible} class="e">{i.earthVisible ? t.inView : t.blocked}</b>
					</span>
				</div>
			</div>
		</div>
	{/each}
</div>

<style>
	.now {
		display: grid;
		gap: 8px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.lbl {
		font-size: 13px;
		color: var(--text-2);
	}
	.when {
		font-size: 11px;
		color: var(--text-3);
	}
	.row {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.row:has(.slot) {
		grid-template-columns: auto 1fr 1fr;
		align-items: center;
	}
	.slot {
		display: grid;
		place-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		font-size: 10px;
		font-weight: 700;
		background: var(--site-a);
		color: #0a0e16;
	}
	.row.b .slot {
		background: var(--site-b);
	}
	.cell {
		display: flex;
		gap: 8px;
		align-items: center;
		min-width: 0;
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid var(--hairline);
	}
	.glyph {
		flex: none;
		width: 40px;
		height: 30px;
		overflow: visible;
	}
	.disk {
		fill: var(--sun);
	}
	.disk,
	.halo,
	.earth {
		transition: cy 120ms linear;
	}
	.terrain {
		fill: #2a2f3b;
		stroke: rgba(255, 255, 255, 0.25);
		stroke-width: 0.8;
	}
	.margin {
		stroke: var(--earth);
		stroke-width: 0.8;
		stroke-dasharray: 2 2;
		opacity: 0.5;
	}
	.earth {
		fill: rgba(92, 200, 255, 0.25);
		stroke: var(--earth);
		stroke-width: 1;
	}
	.earth.vis {
		fill: var(--earth);
		filter: drop-shadow(0 0 3px var(--earth));
	}
	.txt {
		display: grid;
		min-width: 0;
		line-height: 1.25;
	}
	.k {
		font-size: 10.5px;
		color: var(--text-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.v {
		font-size: 15px;
		font-weight: 600;
	}
	.v.sun {
		color: var(--sun-soft);
	}
	.v.earthc {
		color: var(--earth-soft);
	}
	.s {
		font-size: 10.5px;
		color: var(--text-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.s b {
		font-weight: 600;
		color: var(--text-3);
		transition: color var(--dur);
	}
	.s b.on {
		color: var(--sun);
	}
	.s b.e.on {
		color: var(--earth);
	}
</style>
