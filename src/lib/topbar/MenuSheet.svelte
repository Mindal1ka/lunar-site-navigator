<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!--
	Menu for narrow screens: a bottom sheet on phones (drag down to dismiss),
	a panel under the menu button on tablets. Modal dialog with a focus trap; Escape closes.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { pop, reducedMotion, sheet } from './motion';

	let {
		open,
		onclose,
		label,
		phone,
		children
	}: { open: boolean; onclose: () => void; label: string; phone: boolean; children: Snippet } = $props();

	let panel = $state<HTMLDivElement>();
	let dragY = $state(0);
	let dragging = $state(false);
	let startY = 0;
	let startT = 0;

	const enter = (node: Element) => (phone ? sheet(node) : pop(node, { origin: 'top right' }));

	$effect(() => {
		if (!open || !panel) return;
		const prev = document.activeElement as HTMLElement | null;
		const first = panel.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
		first?.focus({ preventScroll: true });
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onclose();
			} else if (e.key === 'Tab' && panel) {
				const f = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])')].filter(
					(el) => el.offsetParent !== null
				);
				if (!f.length) return;
				const a = f[0];
				const z = f[f.length - 1];
				if (e.shiftKey && document.activeElement === a) {
					e.preventDefault();
					z.focus();
				} else if (!e.shiftKey && document.activeElement === z) {
					e.preventDefault();
					a.focus();
				}
			}
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			prev?.focus?.({ preventScroll: true });
		};
	});

	// drag-to-dismiss (phones): only from the grab area, so controls inside stay usable
	function down(e: PointerEvent) {
		if (!phone) return;
		dragging = true;
		startY = e.clientY;
		startT = performance.now();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!dragging) return;
		const d = e.clientY - startY;
		dragY = d > 0 ? d : d / 6; // rubber-band upward
	}
	function up() {
		if (!dragging) return;
		dragging = false;
		const v = dragY / Math.max(1, performance.now() - startT);
		const h = panel?.offsetHeight ?? 400;
		if (dragY > h * 0.3 || v > 0.6) onclose();
		dragY = 0;
	}
</script>

{#if open}
	<div class="scrim" class:phone transition:fade={{ duration: reducedMotion() ? 0 : 260 }} onclick={onclose} aria-hidden="true"></div>
	<div
		bind:this={panel}
		class="panel"
		class:phone
		class:dragging
		role="dialog"
		aria-modal="true"
		aria-label={label}
		tabindex="-1"
		style:--drag="{dragY}px"
		transition:enter
	>
		{#if phone}
			<div
				class="grab"
				role="presentation"
				onpointerdown={down}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={up}
			>
				<span></span>
			</div>
		{/if}
		<div class="content">
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 45;
		background: rgba(2, 4, 8, 0.35);
	}
	.scrim.phone {
		background: rgba(2, 4, 8, 0.55);
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
	}
	.panel {
		position: fixed;
		z-index: 46;
		top: calc(var(--topbar-h) + var(--gutter) * 2);
		right: var(--gutter);
		width: 360px;
		max-height: calc(100dvh - var(--topbar-h) - var(--gutter) * 4);
		overflow: auto;
		background: var(--glass-strong);
		backdrop-filter: blur(24px) saturate(150%);
		-webkit-backdrop-filter: blur(24px) saturate(150%);
		border: 1px solid var(--glass-border);
		border-radius: 18px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
		outline: none;
	}
	.panel.phone {
		top: auto;
		left: 0;
		right: 0;
		bottom: 0;
		width: auto;
		max-height: 86dvh;
		border-radius: 22px 22px 0 0;
		border-bottom: 0;
		padding-bottom: env(safe-area-inset-bottom);
		translate: 0 var(--drag);
		transition: translate 380ms var(--ease-out);
	}
	.panel.phone.dragging {
		transition: none;
	}
	.grab {
		display: grid;
		place-items: center;
		height: 26px;
		cursor: grab;
		touch-action: none;
	}
	.grab span {
		width: 40px;
		height: 5px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.22);
	}
	.content {
		padding: 18px;
	}
	.phone .content {
		padding: 4px 18px 22px;
	}
</style>
