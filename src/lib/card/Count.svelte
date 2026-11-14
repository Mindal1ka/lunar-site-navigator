<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Count-up number: tweens from the previous value (or 0 on first show) to the new one. -->
<script lang="ts">
	import { Tween, prefersReducedMotion } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { fmtNum } from '#lib/i18n.ts';
	import type { Snippet } from 'svelte';

	interface Props {
		value: number;
		digits?: number;
		/** custom formatter; receives the animated value */
		format?: (v: number) => string;
		duration?: number;
		delay?: number;
		/** render the animated value yourself (e.g. value + unit that switches with it) */
		render?: Snippet<[number]>;
	}
	let { value, digits = 0, format, duration = 900, delay = 0, render }: Props = $props();

	const tw = new Tween(0, { easing: cubicOut });
	let first = true;

	$effect(() => {
		const v = Number.isFinite(value) ? value : 0;
		const reduce = prefersReducedMotion.current;
		const d = first ? delay : 0;
		first = false;
		tw.set(v, { duration: reduce ? 0 : duration, delay: reduce ? 0 : d });
	});

	const text = $derived(format ? format(tw.current) : fmtNum(tw.current, digits));
</script>

{#if render}{@render render(tw.current)}{:else}<span class="count">{text}</span>{/if}

<style>
	.count {
		font-variant-numeric: tabular-nums;
	}
</style>
