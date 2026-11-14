<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Source link, note and custom-point warnings for one site. -->
<script lang="ts">
	import { app } from '#lib/state.svelte.ts';
	import type { Site } from '#lib/engine/data.ts';
	import { T } from './strings.ts';

	interface Props {
		site: Site;
	}
	let { site }: Props = $props();
	const t = $derived(T[app.lang]);
	let open = $state(false);
	const host = $derived.by(() => {
		try {
			return site.source ? new URL(site.source).hostname.replace(/^www\./, '') : '';
		} catch {
			return site.source;
		}
	});
	const long = $derived(site.note.length > 120);
</script>

<div class="sd">
	{#if site.edge_warning}
		<div class="alert" role="note">
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" /><path d="M8 6v3.6M8 11.6v.2" /></svg>
			<span>{t.edgeWarning}</span>
		</div>
	{/if}
	{#if site.note}
		<div class="note-wrap">
			<p class="note" class:clamp={long && !open}>
				{#if site.category === 'custom'}<b>{t.computed}.</b>{/if}
				{site.note}
			</p>
			{#if long}
				<button class="more" onclick={() => (open = !open)} aria-expanded={open}>{open ? t.less : t.more}</button>
			{/if}
		</div>
	{/if}
	{#if site.source}
		<a class="src" href={site.source} target="_blank" rel="noopener noreferrer" aria-label="{t.openSource}: {host}">
			<span class="k">{t.source}</span>
			<span class="host">{host}</span>
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2 7 9" /></svg>
		</a>
	{/if}
</div>

<style>
	.sd {
		display: grid;
		gap: 8px;
	}
	.alert {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		font-size: 12px;
		color: #ffe3a0;
		background: rgba(255, 207, 92, 0.08);
		border: 1px solid rgba(255, 207, 92, 0.25);
		animation: in var(--dur) var(--ease-out);
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.alert svg,
	.src svg {
		flex: none;
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.alert svg {
		color: var(--warning);
		margin-top: 1px;
	}
	.note-wrap {
		display: grid;
		justify-items: start;
		gap: 2px;
	}
	.note {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-3);
	}
	.note b {
		color: var(--site-b);
		font-weight: 600;
	}
	.note.clamp {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.more {
		font-size: 11.5px;
		color: var(--earth);
		padding: 2px 0;
	}
	.more:hover {
		text-decoration: underline;
	}
	.src {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		justify-self: start;
		max-width: 100%;
		padding: 5px 10px;
		border-radius: var(--radius-pill);
		font-size: 11.5px;
		color: var(--text-2);
		text-decoration: none;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--hairline);
		transition: border-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast) var(--ease-spring);
	}
	.src:hover {
		color: var(--text);
		border-color: var(--glass-border-strong);
		transform: translateY(-1px);
	}
	.src .k {
		color: var(--text-3);
	}
	.host {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
