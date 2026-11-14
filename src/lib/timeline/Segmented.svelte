<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Segmented control (radio group) with a sliding glass indicator. -->
<script lang="ts" generics="V extends string | number">
	import { untrack } from 'svelte';
	interface Option {
		value: V;
		label: string;
		title?: string;
	}
	let {
		options,
		value,
		onchange,
		label,
		accent = 'var(--text)'
	}: { options: Option[]; value: V | null; onchange: (v: V) => void; label: string; accent?: string } = $props();

	let root: HTMLDivElement | undefined = $state();
	let btns: HTMLButtonElement[] = $state([]);
	let ind = $state({ x: 0, w: 0, on: false });
	let ready = $state(false);

	function measure() {
		const i = options.findIndex((o) => o.value === value);
		const b = btns[i];
		// write only on change: this runs inside an effect, and a fresh object every time
		// would re-trigger it (endless loop when no option matches, e.g. a non-preset speed)
		const prev = untrack(() => ind);
		const next = b ? { x: b.offsetLeft, w: b.offsetWidth, on: true } : { x: prev.x, w: prev.w, on: false };
		if (prev.x !== next.x || prev.w !== next.w || prev.on !== next.on) ind = next;
	}

	$effect(() => {
		void value;
		void options.length;
		void options.map((o) => o.label).join();
		measure();
	});

	$effect(() => {
		if (!root) return;
		const ro = new ResizeObserver(() => measure());
		ro.observe(root);
		// enable the slide animation only after the first placement
		requestAnimationFrame(() => (ready = true));
		return () => ro.disconnect();
	});

	function key(e: KeyboardEvent, i: number) {
		let j = -1;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % options.length;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + options.length) % options.length;
		else if (e.key === 'Home') j = 0;
		else if (e.key === 'End') j = options.length - 1;
		if (j < 0) return;
		e.preventDefault();
		e.stopPropagation();
		onchange(options[j].value);
		btns[j]?.focus();
	}
</script>

<div class="seg" role="radiogroup" aria-label={label} bind:this={root} style:--accent={accent}>
	<span
		class="ind"
		class:ready
		class:on={ind.on}
		style:transform="translateX({ind.x}px)"
		style:width="{ind.w}px"
		aria-hidden="true"
	></span>
	{#each options as o, i (o.value)}
		{@const active = o.value === value}
		<button
			bind:this={btns[i]}
			type="button"
			role="radio"
			aria-checked={active}
			tabindex={active || (value === null && i === 0) ? 0 : -1}
			class:active
			title={o.title}
			aria-label={o.title}
			onclick={() => onchange(o.value)}
			onkeydown={(e) => key(e, i)}>{o.label}</button
		>
	{/each}
</div>

<style>
	.seg {
		position: relative;
		display: inline-flex;
		align-items: stretch;
		padding: 2px;
		border-radius: var(--radius-pill);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--hairline);
		isolation: isolate;
		flex: none;
	}
	.ind {
		position: absolute;
		top: 2px;
		bottom: 2px;
		left: 0;
		border-radius: var(--radius-pill);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.08));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.16),
			0 4px 14px rgba(0, 0, 0, 0.35);
		opacity: 0;
		z-index: -1;
		will-change: transform, width;
	}
	.ind.on {
		opacity: 1;
	}
	.ind.ready {
		transition:
			transform 420ms var(--ease-spring),
			width 420ms var(--ease-spring),
			opacity var(--dur) var(--ease-out);
	}
	button {
		position: relative;
		padding: 0 11px;
		min-height: 26px;
		border-radius: var(--radius-pill);
		font-size: 12px;
		font-weight: 500;
		color: var(--text-3);
		white-space: nowrap;
		transition: color var(--dur) var(--ease-out);
	}
	button:hover {
		color: var(--text-2);
	}
	button.active {
		color: var(--accent);
	}
	@media (pointer: coarse) {
		button {
			min-height: 30px;
		}
	}
</style>
