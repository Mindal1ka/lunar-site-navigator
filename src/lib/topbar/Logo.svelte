<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!--
	Logo mark: at the lunar south pole the Sun never climbs high; it skims the horizon.
	The mark shows exactly that: a ridge line, a low Sun gliding along it, and a small Earth above.
-->
<script lang="ts">
	let { size = 34 }: { size?: number } = $props();
	// unique ids: the mark can appear twice (bar and menu)
	const id = `ll${Math.random().toString(36).slice(2, 8)}`;
</script>

<span class="mark" style:--s="{size}px" aria-hidden="true">
	<svg viewBox="0 0 40 40" width={size} height={size}>
		<defs>
			<radialGradient id="{id}-sun" cx="50%" cy="50%" r="50%">
				<stop offset="0" stop-color="#fff3d6" />
				<stop offset="0.45" stop-color="#ffb547" />
				<stop offset="1" stop-color="#ffb547" stop-opacity="0" />
			</radialGradient>
			<linearGradient id="{id}-ground" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#9aa3b5" />
				<stop offset="1" stop-color="#2a303c" />
			</linearGradient>
			<clipPath id="{id}-clip"><rect x="0" y="0" width="40" height="40" rx="11" /></clipPath>
		</defs>
		<g clip-path="url(#{id}-clip)">
			<rect width="40" height="40" fill="#0b1120" />
			<g class="sun"><circle cx="0" cy="25.5" r="7" fill="url(#{id}-sun)" /><circle cx="0" cy="25.5" r="2.4" fill="#fff1cc" /></g>
			<circle class="earth" cx="29" cy="11" r="2.6" fill="#5cc8ff" />
			<path d="M0 30 L7 26.5 L12 28 L19 22.5 L25 26 L31 24 L40 27.5 V40 H0 Z" fill="url(#{id}-ground)" />
			<path d="M0 30 L7 26.5 L12 28 L19 22.5 L25 26 L31 24 L40 27.5" fill="none" stroke="#dfe5ef" stroke-width="0.9" stroke-opacity="0.8" />
		</g>
		<rect x="0.5" y="0.5" width="39" height="39" rx="10.5" fill="none" stroke="rgba(255,255,255,0.14)" />
	</svg>
</span>

<style>
	.mark {
		display: block;
		width: var(--s);
		height: var(--s);
		flex: none;
		border-radius: 11px;
		box-shadow: 0 0 0 0 rgba(255, 181, 71, 0);
		transition: box-shadow var(--dur-slow) var(--ease-out);
	}
	svg {
		display: block;
	}
	.sun {
		animation: skim 14s var(--ease-in-out) infinite alternate;
	}
	.earth {
		filter: drop-shadow(0 0 2px rgba(92, 200, 255, 0.9));
		animation: twinkle 5s ease-in-out infinite;
	}
		:global(:hover) > .mark {
		box-shadow: 0 0 22px 0 rgba(255, 181, 71, 0.25);
	}
	@keyframes skim {
		from {
			transform: translate(4px, 0);
		}
		50% {
			transform: translate(20px, -3px);
		}
		to {
			transform: translate(36px, 0);
		}
	}
	@keyframes twinkle {
		50% {
			opacity: 0.65;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sun {
			animation: none;
			transform: translate(20px, -3px);
		}
		.earth {
			animation: none;
		}
	}
</style>
