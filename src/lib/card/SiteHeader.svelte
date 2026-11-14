<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Site name, category, coordinates and elevation (fixed head of the card). -->
<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app } from '#lib/state.svelte.ts';
	import { COMMON } from '#lib/i18n.ts';
	import type { Site } from '#lib/engine/data.ts';
	import { T } from './strings.ts';
	import { coordText, metres } from './format.ts';

	interface Props {
		site: Site;
	}
	let { site }: Props = $props();

	const t = $derived(T[app.lang]);
	const c = $derived(COMMON[app.lang]);
	const mo = (d: number) => (prefersReducedMotion.current ? 0 : d);
	const CAT_COLOR: Record<string, string> = {
		artemis: 'var(--earth-soft)',
		mission: 'var(--sun-soft)',
		sunny: 'var(--sun)',
		shadow: 'var(--night)',
		custom: 'var(--site-b)'
	};
</script>

<header class="sh">
	<div class="row">
		<span class="slot" aria-label={t.slotA}>A</span>
		<span class="cat" style:--c={CAT_COLOR[site.category] ?? 'var(--text-2)'}><i></i>{c.categories[site.category]}</span>
		{#if site.category === 'custom'}
			<span class="cat lola">{t.computed}</span>
		{/if}
		{#if site.edge_warning}
			<span class="warn" title={t.edgeWarning} aria-label={t.edgeWarning}>
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" /><path d="M8 6v3.6M8 11.6v.2" /></svg>
			</span>
		{/if}
	</div>
	<div class="namewrap">
		{#key site.id + app.lang}
			<h2 class="name" in:fly={{ y: 12, duration: mo(480), easing: cubicOut }} out:fade={{ duration: mo(120) }}>
				{site.name[app.lang]}
			</h2>
		{/key}
	</div>
	<p class="coords mono">
		<span class="sr-only">{t.coords}:</span>{coordText(site)}
		<span class="sep" aria-hidden="true">·</span>
		<span class="sr-only">{t.elevation}:</span>{metres(site.elevation_m)}
	</p>
</header>

<style>
	.sh {
		display: grid;
		gap: 4px;
	}
	.row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}
	.slot {
		display: grid;
		place-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		font-size: 11px;
		font-weight: 700;
		background: var(--site-a);
		color: #0a0e16;
		box-shadow: 0 0 12px rgba(255, 255, 255, 0.35);
	}
	.cat {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 9px 2px 8px;
		border-radius: var(--radius-pill);
		font-size: 11px;
		font-weight: 500;
		color: var(--text-2);
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--hairline);
	}
	.cat i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--c);
		box-shadow: 0 0 6px var(--c);
	}
	.cat.lola {
		color: var(--site-b);
		border-color: rgba(196, 155, 255, 0.3);
	}
	.warn {
		display: inline-grid;
		place-content: center;
		color: var(--warning);
	}
	.warn svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.namewrap {
		display: grid;
		min-height: 1.25em;
		font-size: 22px;
	}
	.name {
		grid-area: 1 / 1;
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.01em;
		text-wrap: balance;
	}
	.coords {
		margin: 0;
		font-size: 11.5px;
		color: var(--text-3);
	}
	.sep {
		margin: 0 4px;
	}
	@media (max-width: 767px) {
		.name,
		.namewrap {
			font-size: 18px;
		}
		.row .cat:not(.lola) {
			display: none;
		}
		.sh {
			grid-template-columns: auto 1fr;
			column-gap: 8px;
			row-gap: 0;
			align-items: center;
		}
		.row {
			grid-row: 1 / 3;
		}
		.coords {
			grid-column: 2;
		}
	}
</style>
