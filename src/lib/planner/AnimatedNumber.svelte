<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- A number that glides to its new value (tween), instant under reduced motion. -->
<script lang="ts">
	import { Tween, prefersReducedMotion } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { fmtNum } from '#lib/i18n.ts';

	let { value, digits = 0, duration = 650 }: { value: number; digits?: number; duration?: number } = $props();

	const tw = new Tween(0, { easing: cubicOut });
	$effect(() => {
		const v = Number.isFinite(value) ? value : 0;
		tw.set(v, { duration: prefersReducedMotion.current ? 0 : duration });
	});
</script>

<span class="num">{fmtNum(tw.current, digits)}</span>
