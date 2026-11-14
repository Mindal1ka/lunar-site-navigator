<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- "How we know these numbers": engine checks against JPL Horizons, the NASA LOLA illumination
     map and published points (static/data/validation.json). Collapsible. -->
<script module lang="ts">
	interface Agree {
		bias_pp: number;
		mae_pp: number;
		r: number;
	}
	export interface Validation {
		horizons: { reference: string; sites: number; epochs_per_site: number; max_diff_arcsec: number };
		lola_map: {
			reference: string;
			points: number;
			at_0m: { sun: Agree; earth: Agree };
			at_2m_control: { sun: Agree; earth: Agree };
		};
		published_points: { site: string; height_m: number; ours_pct: number; published_pct: number; diff_pct: number; source: string }[];
		note_0m: string;
	}
	let cache: Promise<Validation> | null = null;
	function loadValidation(): Promise<Validation> {
		return (cache ??= fetch('/data/validation.json').then((r) => {
			if (!r.ok) throw new Error(String(r.status));
			return r.json() as Promise<Validation>;
		}).catch((e) => {
			cache = null;
			throw e;
		}));
	}
</script>

<script lang="ts">
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app } from '#lib/state.svelte.ts';
	import { COMMON, fmtNum } from '#lib/i18n.ts';
	import { T } from '#lib/card/strings.ts';
	import { signed } from '#lib/card/format.ts';

	interface Props {
		open?: boolean;
	}
	let { open = $bindable(false) }: Props = $props();

	const t = $derived(T[app.lang]);
	const c = $derived(COMMON[app.lang]);
	const mo = (d: number) => (prefersReducedMotion.current ? 0 : d);

	let data = $state.raw<Validation | null>(null);
	let failed = $state(false);
	$effect(() => {
		if (!open || data) return;
		failed = false;
		loadValidation()
			.then((v) => (data = v))
			.catch(() => (failed = true));
	});
	const id = $props.id();
	const pp = $derived(t.pp);
</script>

{#snippet agree(label: string, s: Agree, e: Agree, control: boolean)}
	<div class="agree" class:control>
		<span class="alabel">{label}</span>
		<div class="pair">
			<div class="m sun">
				<span class="mk">{c.sunShort}</span>
				<span class="mv num">{fmtNum(s.mae_pp, 2)} <small>{pp}</small></span>
				<span class="ms">{t.vMae} · {t.vBias} {signed(s.bias_pp, 2)} · r {fmtNum(s.r, 3)}</span>
			</div>
			<div class="m earth">
				<span class="mk">{c.earthShort}</span>
				<span class="mv num">{fmtNum(e.mae_pp, 2)} <small>{pp}</small></span>
				<span class="ms">{t.vMae} · {t.vBias} {signed(e.bias_pp, 2)} · r {fmtNum(e.r, 3)}</span>
			</div>
		</div>
	</div>
{/snippet}

<section class="vp" class:open>
	<button class="toggle" aria-expanded={open} aria-controls={id} onclick={() => (open = !open)}>
		<span class="shield" aria-hidden="true">
			<svg viewBox="0 0 16 16"><path d="M8 1.5 13.5 3.5v4c0 3.2-2.3 5.9-5.5 7-3.2-1.1-5.5-3.8-5.5-7v-4z" /><path d="m5.6 8 1.7 1.7 3.2-3.4" /></svg>
		</span>
		<span class="tt">{t.howWeKnow}</span>
		<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
	</button>

	{#if open}
		<div class="content" {id} transition:slide={{ duration: mo(380), easing: cubicOut }}>
			{#if data}
				<div class="cards">
					<div class="vcard">
						<span class="vt">{t.vHorizonsTitle}</span>
						<span class="big num">{fmtNum(data.horizons.max_diff_arcsec, 2)}″</span>
						<span class="vs">{t.vMaxDiff} · {t.vHorizonsBody(data.horizons.sites, data.horizons.epochs_per_site)}</span>
					</div>
					<div class="vcard">
						<span class="vt">{t.vMapTitle}</span>
						<span class="vs">{t.vMapBody(data.lola_map.points)} · {data.lola_map.reference}</span>
					</div>
				</div>
				{@render agree(t.vAt0, data.lola_map.at_0m.sun, data.lola_map.at_0m.earth, false)}
				{@render agree(t.vAt2, data.lola_map.at_2m_control.sun, data.lola_map.at_2m_control.earth, true)}

				<div class="pub">
					<span class="vt">{t.vPublished}</span>
					<table>
						<thead>
							<tr>
								<th scope="col">{t.vSite}</th>
								<th scope="col" class="r">{t.vOurs}</th>
								<th scope="col" class="r">{t.vPub}</th>
								<th scope="col" class="r">{t.vDiff}</th>
							</tr>
						</thead>
						<tbody>
							{#each data.published_points as p, k (p.site)}
								<tr style:--d="{Math.min(30, Math.abs(p.diff_pct)) / 30}" style:animation-delay="{mo(k * 35)}ms" class:off={Math.abs(p.diff_pct) > 5}>
									<td>
										<span class="pn">{p.site}</span>
										<span class="ps">{p.source}</span>
									</td>
									<td class="r num">{fmtNum(p.ours_pct, 1)}%</td>
									<td class="r num dim">{fmtNum(p.published_pct, 1)}%</td>
									<td class="r num diff">
										<span class="dwrap"><span class="dbar" aria-hidden="true"></span>{signed(p.diff_pct, 1)}</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="note">
					<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M8 7.2v4M8 4.8v.2" /></svg>
					{t.vNote}
				</p>
			{:else if failed}
				<p class="state err">{t.vFailed}</p>
			{:else}
				<div class="skel" aria-label={t.vLoading}>
					<span></span><span></span><span></span>
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.vp {
		border-radius: var(--radius);
		border: 1px solid var(--hairline);
		background: rgba(255, 255, 255, 0.02);
		transition: border-color var(--dur), background var(--dur);
	}
	.vp.open {
		border-color: var(--glass-border);
		background: rgba(255, 255, 255, 0.035);
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 11px 12px;
		text-align: left;
		border-radius: var(--radius);
	}
	.shield svg,
	.chev,
	.note svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.shield {
		display: grid;
		color: var(--both);
	}
	.tt {
		flex: 1;
		font-size: 13px;
		font-weight: 600;
	}
	.chev {
		color: var(--text-3);
		transition: transform var(--dur) var(--ease-spring);
	}
	.open .chev {
		transform: rotate(180deg);
	}
	.content {
		display: grid;
		gap: 10px;
		padding: 0 12px 12px;
	}
	.cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.vcard {
		display: grid;
		align-content: start;
		gap: 3px;
		padding: 10px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--hairline);
	}
	.vt {
		font-size: 11.5px;
		font-weight: 600;
		color: var(--text-2);
	}
	.vs {
		font-size: 10.5px;
		line-height: 1.4;
		color: var(--text-3);
	}
	.big {
		font-size: 22px;
		font-weight: 600;
		color: var(--both);
	}
	.agree {
		display: grid;
		gap: 6px;
	}
	.alabel {
		font-size: 11px;
		color: var(--text-3);
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.m {
		display: grid;
		gap: 1px;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		border-left: 2px solid var(--c);
		background: linear-gradient(90deg, color-mix(in srgb, var(--c) 8%, transparent), transparent);
	}
	.m.sun {
		--c: var(--sun);
	}
	.m.earth {
		--c: var(--earth);
	}
	.control .m {
		opacity: 0.75;
	}
	.mk {
		font-size: 10.5px;
		color: var(--c);
	}
	.mv {
		font-size: 17px;
		font-weight: 600;
	}
	.mv small {
		font-size: 11px;
		color: var(--text-3);
		font-weight: 500;
	}
	.ms {
		font-size: 10px;
		color: var(--text-3);
	}
	.pub {
		display: grid;
		gap: 6px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11.5px;
	}
	th {
		font-weight: 500;
		font-size: 10.5px;
		color: var(--text-3);
		text-align: left;
		padding: 0 4px 4px;
		border-bottom: 1px solid var(--hairline);
	}
	td {
		padding: 6px 4px;
		border-bottom: 1px solid var(--hairline);
		vertical-align: top;
	}
	tbody tr {
		animation: row 420ms var(--ease-out) both;
	}
	@keyframes row {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	.r {
		text-align: right;
		white-space: nowrap;
	}
	.pn {
		display: block;
		color: var(--text-2);
	}
	.ps {
		display: block;
		font-size: 10px;
		color: var(--text-3);
	}
	.dim {
		color: var(--text-3);
	}
	.diff {
		position: relative;
		color: var(--both);
		font-weight: 600;
	}
	.off .diff {
		color: var(--warning);
	}
	.dwrap {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.dbar {
		display: inline-block;
		height: 3px;
		width: calc(3px + var(--d) * 28px);
		border-radius: 2px;
		background: currentColor;
		opacity: 0.6;
	}
	.note {
		display: flex;
		gap: 8px;
		margin: 0;
		padding: 9px 10px;
		border-radius: var(--radius-sm);
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--text-2);
		background: rgba(92, 200, 255, 0.06);
		border: 1px solid rgba(92, 200, 255, 0.18);
	}
	.note svg {
		flex: none;
		color: var(--earth);
		margin-top: 1px;
	}
	.state.err {
		margin: 0;
		font-size: 12px;
		color: var(--danger);
	}
	.skel {
		display: grid;
		gap: 8px;
	}
	.skel span {
		height: 44px;
		border-radius: var(--radius-sm);
		background: linear-gradient(90deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
		background-size: 200% 100%;
		animation: shimmer 1.4s linear infinite;
	}
	@keyframes shimmer {
		to {
			background-position: -200% 0;
		}
	}
	@media (max-width: 420px) {
		.cards,
		.pair {
			grid-template-columns: 1fr;
		}
	}
</style>
