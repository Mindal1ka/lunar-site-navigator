<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!--
	Segmented control with a sliding, stretching indicator.
	Toggle buttons (aria-pressed) in a labelled group; arrow keys move focus, Enter/Space selects.
	The indicator's leading edge moves first and the trailing edge follows, so it "stretches" toward the target.
-->
<script lang="ts" generics="V extends string">
	import Icon, { type IconName } from './Icon.svelte';

	interface Option {
		value: V;
		label: string;
		icon?: IconName;
		/** short description shown as a tooltip and read by screen readers */
		tip?: string;
	}

	let {
		options,
		value,
		onchange,
		label,
		size = 'md',
		iconOnly = false,
		stretch = false,
		stack = false,
		tipBelow = true
	}: {
		options: Option[];
		value: V;
		onchange: (v: V) => void;
		label: string;
		size?: 'sm' | 'md' | 'lg';
		iconOnly?: boolean;
		stretch?: boolean;
		/** icon above the label (tab-bar style, for phones) */
		stack?: boolean;
		tipBelow?: boolean;
	} = $props();

	let group = $state<HTMLDivElement>();
	const buttons: HTMLButtonElement[] = $state([]);
	let left = $state(0);
	let right = $state(0);
	let measured = $state(false);
	let animate = $state(false);
	let dir = $state(1);
	let prevIndex = -1;

	const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));

	function measure() {
		const g = group;
		const b = buttons[index];
		if (!g || !b) return;
		const gw = g.clientWidth;
		left = b.offsetLeft;
		right = gw - (b.offsetLeft + b.offsetWidth);
		if (!measured) {
			measured = true;
			// enable transitions only after the first paint, so the indicator does not fly in
			requestAnimationFrame(() => requestAnimationFrame(() => (animate = true)));
		}
	}

	$effect(() => {
		const i = index;
		dir = prevIndex < 0 || i >= prevIndex ? 1 : -1;
		prevIndex = i;
		// re-measure when the selection, labels or language change
		void options.map((o) => o.label).join();
		void iconOnly;
		measure();
	});

	$effect(() => {
		if (!group) return;
		const ro = new ResizeObserver(() => measure());
		ro.observe(group);
		for (const b of buttons) if (b) ro.observe(b);
		document.fonts?.ready.then(measure);
		return () => ro.disconnect();
	});

	function onkey(e: KeyboardEvent, i: number) {
		const n = options.length;
		let j = -1;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
		else if (e.key === 'Home') j = 0;
		else if (e.key === 'End') j = n - 1;
		if (j < 0) return;
		e.preventDefault();
		buttons[j]?.focus();
		onchange(options[j].value);
	}
</script>

<div
	bind:this={group}
	class="seg {size}"
	class:stretch
	class:stack
	class:icon-only={iconOnly}
	class:animate
	class:fwd={dir > 0}
	role="group"
	aria-label={label}
	style:--l="{left}px"
	style:--r="{right}px"
>
	<span class="ind" class:shown={measured} aria-hidden="true"></span>
	{#each options as o, i (o.value)}
		<button
			bind:this={buttons[i]}
			type="button"
			class="opt"
			class:on={o.value === value}
			class:tip-up={!tipBelow}
			aria-pressed={o.value === value}
			aria-label={iconOnly ? o.label : undefined}
			title={iconOnly && !o.tip ? o.label : undefined}
			data-tip={o.tip ?? (iconOnly ? o.label : undefined)}
			tabindex={o.value === value ? 0 : -1}
			onclick={() => onchange(o.value)}
			onkeydown={(e) => onkey(e, i)}
		>
			{#if o.icon}<span class="ic"><Icon name={o.icon} size={size === 'sm' ? 15 : 17} /></span>{/if}
			{#if !iconOnly}<span class="txt">{o.label}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.seg {
		--h: 38px;
		--pad: 3px;
		position: relative;
		display: inline-flex;
		align-items: stretch;
		height: var(--h);
		padding: var(--pad);
		border-radius: var(--radius-pill);
		background: rgba(255, 255, 255, 0.035);
		box-shadow: inset 0 0 0 1px var(--hairline);
		isolation: isolate;
	}
	.seg.sm {
		--h: 32px;
	}
	.seg.lg {
		--h: 46px;
		--pad: 4px;
	}
	.seg.stretch {
		display: flex;
		width: 100%;
	}
	.seg.stretch .opt {
		flex: 1 1 0;
		min-width: 0;
	}
	.seg.stack {
		--h: 60px;
		border-radius: 16px;
	}
	.seg.stack .ind,
	.seg.stack .opt {
		border-radius: 13px;
	}
	.seg.stack .opt {
		flex-direction: column;
		gap: 4px;
		padding: 0 4px;
		font-size: 12.5px;
	}
	.seg.stack .txt {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ind {
		position: absolute;
		z-index: -1;
		top: var(--pad);
		bottom: var(--pad);
		left: var(--l);
		right: var(--r);
		border-radius: var(--radius-pill);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.17), rgba(255, 255, 255, 0.08));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.22),
			inset 0 0 0 1px rgba(255, 255, 255, 0.1),
			0 4px 14px rgba(0, 0, 0, 0.35);
		opacity: 0;
	}
	.ind.shown {
		opacity: 1;
	}
	/* leading edge first, trailing edge follows: a short stretch toward the target */
	.animate .ind {
		transition:
			left 420ms var(--ease-out),
			right 420ms var(--ease-out),
			opacity var(--dur-fast);
	}
	.animate.fwd .ind {
		transition-duration: 460ms, 300ms, 160ms;
	}
	.animate:not(.fwd) .ind {
		transition-duration: 300ms, 460ms, 160ms;
	}

	.opt {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		padding: 0 14px;
		border-radius: var(--radius-pill);
		font-size: 13px;
		font-weight: 520;
		letter-spacing: 0.005em;
		white-space: nowrap;
		color: var(--text-3);
		transition:
			color var(--dur) var(--ease-out),
			transform var(--dur-fast) var(--ease-out);
	}
	.sm .opt {
		padding: 0 11px;
		font-size: 12px;
	}
	.lg .opt {
		font-size: 14px;
		padding: 0 16px;
	}
	.icon-only .opt {
		padding: 0;
		width: calc(var(--h) - var(--pad) * 2 + 4px);
	}
	.opt:hover {
		color: var(--text-2);
	}
	.opt.on {
		color: var(--text);
	}
	.opt:active {
		transform: scale(0.95);
	}
	.opt .ic {
		display: grid;
		transition: transform var(--dur) var(--ease-spring);
	}
	.opt.on .ic {
		transform: scale(1.08);
	}
	.opt:focus-visible {
		outline-offset: 0;
		border-radius: var(--radius-pill);
	}

	/* tooltip */
	.opt[data-tip]::after {
		content: attr(data-tip);
		position: absolute;
		top: calc(100% + 12px);
		left: 50%;
		transform: translate(-50%, -4px);
		width: max-content;
		max-width: 240px;
		padding: 7px 10px;
		border-radius: 8px;
		background: var(--glass-strong);
		border: 1px solid var(--glass-border);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
		color: var(--text-2);
		font-size: 12px;
		font-weight: 400;
		line-height: 1.35;
		white-space: normal;
		text-align: left;
		pointer-events: none;
		opacity: 0;
		transition:
			opacity var(--dur-fast) var(--ease-out),
			transform var(--dur) var(--ease-out);
		z-index: 30;
	}
	.opt.tip-up[data-tip]::after {
		top: auto;
		bottom: calc(100% + 12px);
		transform: translate(-50%, 4px);
	}
	.opt[data-tip]:hover::after,
	.opt[data-tip]:focus-visible::after {
		opacity: 1;
		transform: translate(-50%, 0);
		transition-delay: 380ms, 380ms;
	}
	@media (hover: none) {
		.opt[data-tip]::after {
			display: none;
		}
	}
</style>
