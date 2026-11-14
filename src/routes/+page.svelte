<!-- AI-assisted: written with Claude, reviewed by the team. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { app } from '#lib/state.svelte.ts';
	import Scene3D from '#lib/components/Scene3D.svelte';
	import Panorama from '#lib/components/Panorama.svelte';
	import Timeline from '#lib/components/Timeline.svelte';
	import SiteCard from '#lib/components/SiteCard.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import PlannerPanel from '#lib/components/PlannerPanel.svelte';
	import { initUrlState } from '#lib/url.svelte.ts';
	import { perf } from '#lib/perf.svelte.ts';

	const T = {
		en: { loading: 'Loading NASA LOLA terrain and JPL ephemerides', failed: 'Could not load data' },
		uk: { loading: 'Завантажуємо рельєф NASA LOLA та ефемериди JPL', failed: 'Не вдалося завантажити дані' }
	};
	const t = $derived(T[app.lang]);

	onMount(() => {
		perf.init();
		app.load();
		const stopUrl = initUrlState();
		const stopSquares = app.startSquares();
		// playback: advance the time cursor in real time while playing
		let raf = 0;
		let last = performance.now();
		const tick = (now: number) => {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			if (app.playing && app.eph) {
				const stepH = app.eph.step_s / 3600;
				let next = app.t + (app.speed * dt) / stepH;
				if (next >= app.win.i1 - 1) next = app.win.i0;
				app.t = next;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			stopUrl();
			stopSquares();
		};
	});
</script>

<svelte:head>
	<title>Lunar Landing Site Navigator</title>
	<meta
		name="description"
		content="Compare lunar south pole landing sites by sunlight and Earth visibility over the real horizon, computed from NASA LOLA topography and JPL ephemerides."
	/>
</svelte:head>

<div class="app" class:mode-planner={app.mode === 'planner'} class:view-panorama={app.view === 'panorama'}>
	<div class="stage">
		{#if app.ready}
			<div class="layer" class:hidden={app.view !== 'map'}><Scene3D /></div>
			{#if app.view === 'panorama'}
				<div class="layer" transition:fade={{ duration: 450 }}><Panorama /></div>
			{/if}
		{/if}
	</div>

	{#if app.ready}
		<header class="top"><TopBar /></header>
		<aside class="panel"><SiteCard /></aside>
		{#if app.mode === 'planner'}
			<section class="planner" transition:fade={{ duration: 250 }}><PlannerPanel /></section>
		{/if}
		<footer class="timeline"><Timeline /></footer>
	{:else}
		<div class="loading" out:fade={{ duration: 600 }}>
			{#if app.loadError}
				<p class="err">{t.failed}: {app.loadError}</p>
			{:else}
				<div class="orbit" aria-hidden="true"><span class="moon"></span><span class="sun"></span></div>
				<p>{t.loading}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.app {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: radial-gradient(120% 90% at 50% 0%, #0b1220 0%, var(--bg) 60%);
	}
	.stage,
	.layer {
		position: absolute;
		inset: 0;
	}
	.layer.hidden {
		visibility: hidden;
	}
	.top {
		position: absolute;
		top: var(--gutter);
		left: var(--gutter);
		right: var(--gutter);
		z-index: 20;
		pointer-events: none;
	}
	.top > :global(*) {
		pointer-events: auto;
	}
	.panel {
		position: absolute;
		top: calc(var(--topbar-h) + var(--gutter) * 2);
		right: var(--gutter);
		bottom: calc(var(--timeline-h) + var(--gutter) * 2);
		width: var(--panel-w);
		z-index: 10;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.planner {
		position: absolute;
		left: var(--gutter);
		right: calc(var(--panel-w) + var(--gutter) * 2);
		bottom: calc(var(--timeline-h) + var(--gutter) * 2);
		height: min(300px, 34vh);
		z-index: 9;
	}
	.timeline {
		position: absolute;
		left: var(--gutter);
		right: var(--gutter);
		bottom: var(--gutter);
		height: var(--timeline-h);
		z-index: 15;
	}
	.loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 22px;
		color: var(--text-2);
		font-size: 13px;
		letter-spacing: 0.02em;
		z-index: 50;
	}
	.err {
		color: var(--danger);
	}
	.orbit {
		position: relative;
		width: 84px;
		height: 84px;
	}
	.moon {
		position: absolute;
		inset: 22px;
		border-radius: 50%;
		background: radial-gradient(circle at 35% 35%, #c9ccd4, #4a4f5c 70%);
		box-shadow: inset -8px -6px 14px rgba(0, 0, 0, 0.6);
	}
	.sun {
		position: absolute;
		width: 10px;
		height: 10px;
		top: 0;
		left: 37px;
		border-radius: 50%;
		background: var(--sun);
		box-shadow: 0 0 18px 4px rgba(255, 181, 71, 0.6);
		transform-origin: 5px 42px;
		animation: orbit 2.4s linear infinite;
	}
	@keyframes orbit {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 767px) {
		.panel {
			top: auto;
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			max-height: none;
			z-index: 16;
		}
		.timeline {
			left: var(--gutter);
			right: var(--gutter);
			bottom: auto;
			top: calc(var(--topbar-h) + var(--gutter) * 2);
			height: var(--timeline-h);
		}
		.planner {
			left: var(--gutter);
			right: var(--gutter);
			top: calc(var(--topbar-h) + var(--timeline-h) + var(--gutter) * 3);
			bottom: auto;
			height: min(320px, 40vh);
		}
	}
</style>
