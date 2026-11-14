<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Card shell. Desktop: right glass panel that scrolls as a whole (head included), with a
     'more below' hint while content is hidden.
     Mobile (<768 px): bottom sheet with a drag handle, flick velocity and two or three snap points. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';

	interface Props {
		head: Snippet;
		children: Snippet;
		label: string;
		/** collapse request counter (bump to collapse the sheet to its peek height) */
		collapse?: number;
		expandLabel: string;
		collapseLabel: string;
		moreLabel?: string;
	}
	let { head, children, label, collapse = 0, expandLabel, collapseLabel, moreLabel = 'More below' }: Props = $props();

	const mobile = new MediaQuery('max-width: 767px');
	const HANDLE = 26;

	let sheetH = $state(0);
	let headH = $state(0);
	/** 0 = peek, 1 = middle, 2 = full */
	let snap = $state(0);
	let drag = $state<number | null>(null);
	let body: HTMLDivElement | undefined = $state();
	let scrolled = $state(false);
	let atEnd = $state(true);

	const peekOff = $derived(Math.max(0, sheetH - (headH + HANDLE)));
	const hasMid = $derived(peekOff > 300);
	const snaps = $derived(hasMid ? [peekOff, Math.round(peekOff * 0.45), 0] : [peekOff, 0]);
	const restOff = $derived(snaps[Math.min(snap, snaps.length - 1)] ?? 0);
	const offset = $derived(mobile.current ? (drag ?? restOff) : 0);
	const expanded = $derived(mobile.current ? restOff < peekOff - 1 : true);

	$effect(() => {
		// collapse when asked (e.g. while picking a site on the map)
		if (collapse > 0) snap = 0;
	});
	$effect(() => {
		if (!mobile.current) drag = null;
	});
	// no slide animation until the first measurement, so the sheet does not fly down on load
	let measured = $state(false);
	$effect(() => {
		if (measured || !sheetH || !headH) return;
		const id = requestAnimationFrame(() => requestAnimationFrame(() => (measured = true)));
		return () => cancelAnimationFrame(id);
	});

	let startY = 0;
	let startOff = 0;
	let moved = false;
	let samples: { y: number; t: number }[] = [];
	let fromHandle = false;
	let justDragged = false;

	function down(e: PointerEvent) {
		if (!mobile.current || e.button !== 0) return;
		const target = e.target as HTMLElement;
		fromHandle = !!target.closest('.handle');
		if (!fromHandle && target.closest('button, a, input, select, [role="slider"], [role="button"]')) return;
		startY = e.clientY;
		startOff = restOff;
		moved = false;
		samples = [{ y: e.clientY, t: e.timeStamp }];
	}
	function move(e: PointerEvent) {
		if (!samples.length) return;
		const dy = e.clientY - startY;
		if (!moved && Math.abs(dy) < 5) return;
		if (!moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		moved = true;
		let o = startOff + dy;
		// rubber band beyond the ends
		if (o < 0) o = -Math.pow(-o, 0.7);
		if (o > peekOff) o = peekOff + Math.pow(o - peekOff, 0.7);
		drag = o;
		samples.push({ y: e.clientY, t: e.timeStamp });
		if (samples.length > 6) samples.shift();
	}
	function up(e: PointerEvent) {
		if (!samples.length) return;
		const s = samples;
		samples = [];
		if (!moved) {
			drag = null;
			return;
		}
		justDragged = true;
		setTimeout(() => (justDragged = false), 0);
		const a = s[0];
		const b = s[s.length - 1];
		const v = (b.y - a.y) / Math.max(1, b.t - a.t); // px/ms
		const projected = (drag ?? restOff) + v * 220;
		let best = 0;
		snaps.forEach((p, k) => {
			if (Math.abs(p - projected) < Math.abs(snaps[best] - projected)) best = k;
		});
		snap = best;
		drag = null;
		(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
	}
	function toggle() {
		snap = expanded ? 0 : snaps.length - 1;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && mobile.current && expanded) {
			snap = 0;
		}
	}
	function onScroll() {
		if (!body) return;
		scrolled = body.scrollTop > 4;
		atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
	}
	$effect(() => {
		if (!body) return;
		const ro = new ResizeObserver(onScroll);
		ro.observe(body);
		return () => ro.disconnect();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	class="card glass"
	class:mobile={mobile.current}
	class:dragging={drag !== null}
	class:still={!measured}
	class:expanded
	aria-label={label}
	bind:offsetHeight={sheetH}
	style:transform={mobile.current ? `translate3d(0, ${offset}px, 0)` : undefined}
	onkeydown={onKey}
	onfocusin={(e) => {
		if (mobile.current && !expanded && body?.contains(e.target as Node)) snap = snaps.length - 1;
	}}
>
	{#if mobile.current}
		<div
			class="grab"
			role="presentation"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		>
			<button class="handle" onclick={() => !justDragged && toggle()} aria-expanded={expanded} aria-label={expanded ? collapseLabel : expandLabel}>
				<span></span>
			</button>
			<div class="head" bind:offsetHeight={headH}>{@render head()}</div>
		</div>
	{/if}
	<div
		class="body"
		class:scrolled
		class:at-end={atEnd}
		bind:this={body}
		onscroll={onScroll}
		inert={mobile.current && !expanded}
	>
		{#if !mobile.current}
			<div class="head" bind:offsetHeight={headH}>{@render head()}</div>
		{/if}
		{@render children()}
	</div>
	{#if !mobile.current && !atEnd}
		<button
			class="more"
			onclick={() => body?.scrollBy({ top: body.clientHeight * 0.7, behavior: 'smooth' })}
			aria-label={moreLabel}
		>
			{moreLabel}
			<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</button>
	{/if}
</section>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		animation: enter var(--dur-slow) var(--ease-out) both;
	}
	@keyframes enter {
		from {
			opacity: 0;
			transform: translate3d(24px, 0, 0) scale(0.985);
		}
	}
	.head {
		flex: none;
		position: relative;
		z-index: 1;
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.32) transparent;
		mask-image: linear-gradient(180deg, transparent 0, #000 0, #000 calc(100% - 28px), transparent 100%);
		transition: mask-image var(--dur);
	}
	.body.scrolled {
		mask-image: linear-gradient(180deg, transparent 0, #000 22px, #000 calc(100% - 28px), transparent 100%);
	}
	.body.at-end {
		mask-image: linear-gradient(180deg, transparent 0, #000 0, #000 100%);
	}
	.body.scrolled.at-end {
		mask-image: linear-gradient(180deg, transparent 0, #000 22px, #000 100%);
	}

	.body::-webkit-scrollbar {
		width: 8px;
	}
	.body::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.3);
		border-radius: 4px;
	}
	.more {
		position: absolute;
		left: 50%;
		bottom: 10px;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		transform: translateX(-50%);
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(20, 26, 38, 0.92);
		color: rgba(255, 255, 255, 0.85);
		font-size: 12px;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
		cursor: pointer;
		animation: bob 1.8s ease-in-out infinite;
	}
	.more:hover {
		background: rgba(32, 40, 56, 0.96);
		color: #fff;
	}
	@keyframes bob {
		50% {
			transform: translate(-50%, 3px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.more {
			animation: none;
		}
	}

	/* ---------- mobile bottom sheet ---------- */
	.card.mobile {
		flex: none;
		height: 86vh;
		border-radius: 20px 20px 0 0;
		border-bottom: 0;
		background: var(--glass-strong);
		box-shadow: 0 -12px 50px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
		transition: transform 480ms var(--ease-out);
		will-change: transform;
		animation: rise var(--dur-slow) var(--ease-out) both;
	}
	@keyframes rise {
		from {
			opacity: 0;
			translate: 0 40px;
		}
	}
	.card.mobile.dragging,
	.card.mobile.still {
		transition: none;
	}
	.grab {
		flex: none;
		touch-action: none;
		cursor: grab;
	}
	.dragging .grab {
		cursor: grabbing;
	}
	.handle {
		display: grid;
		place-content: center;
		width: 100%;
		height: 26px;
	}
	.handle span {
		display: block;
		width: 40px;
		height: 5px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.22);
		transition: width var(--dur) var(--ease-spring), background var(--dur-fast);
	}
	.handle:hover span,
	.dragging .handle span {
		width: 56px;
		background: rgba(255, 255, 255, 0.4);
	}
	.mobile .body {
		padding-bottom: env(safe-area-inset-bottom, 0);
	}
</style>
