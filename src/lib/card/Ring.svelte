<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Circular gauge with a spring-driven arc and a soft glow. Optional second arc (site B). -->
<script lang="ts">
	import { Spring, prefersReducedMotion } from 'svelte/motion';
	import type { Snippet } from 'svelte';

	interface Props {
		/** 0..1 */
		frac: number;
		color: string;
		size?: number;
		stroke?: number;
		delay?: number;
		children?: Snippet;
	}
	let { frac, color, size = 92, stroke = 5, delay = 0, children }: Props = $props();

	const sp = new Spring(0, { stiffness: 0.09, damping: 0.62 });
	let started = false;

	$effect(() => {
		const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
		if (prefersReducedMotion.current) {
			sp.set(f, { instant: true });
			return;
		}
		if (!started && delay > 0) {
			started = true;
			const id = setTimeout(() => (sp.target = f), delay);
			return () => clearTimeout(id);
		}
		started = true;
		sp.target = f;
	});

	const r = $derived((size - stroke) / 2 - 2);
	const c = $derived(size / 2);
	const shown = $derived(Math.max(0, Math.min(1.02, sp.current)));
	// head of the arc, for a bright dot
	const head = $derived.by(() => {
		const a = -Math.PI / 2 + Math.min(1, shown) * 2 * Math.PI;
		return [c + r * Math.cos(a), c + r * Math.sin(a)];
	});
</script>

<div class="ring" style:width="{size}px" style:height="{size}px" style:--c={color}>
	<svg viewBox="0 0 {size} {size}" aria-hidden="true">
		<circle class="track" cx={c} cy={c} {r} stroke-width={stroke} />
		<circle
			class="glow"
			cx={c}
			cy={c}
			{r}
			stroke-width={stroke + 4}
			pathLength="100"
			stroke-dasharray="{shown * 100} 200"
			transform="rotate(-90 {c} {c})"
		/>
		<circle
			class="arc"
			cx={c}
			cy={c}
			{r}
			stroke-width={stroke}
			pathLength="100"
			stroke-dasharray="{shown * 100} 200"
			transform="rotate(-90 {c} {c})"
		/>
		{#if shown > 0.005}
			<circle class="head" cx={head[0]} cy={head[1]} r={stroke * 0.62} />
		{/if}
	</svg>
	<div class="inner">{@render children?.()}</div>
</div>

<style>
	.ring {
		position: relative;
		flex: none;
	}
	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}
	circle {
		fill: none;
	}
	.track {
		stroke: rgba(255, 255, 255, 0.07);
	}
	.arc {
		stroke: var(--c);
		stroke-linecap: round;
	}
	.glow {
		stroke: var(--c);
		stroke-linecap: round;
		opacity: 0.22;
		filter: blur(4px);
	}
	.head {
		fill: #fff;
		filter: drop-shadow(0 0 4px var(--c));
	}
	.inner {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		text-align: center;
	}
</style>
