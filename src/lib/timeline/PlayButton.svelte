<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Play / pause: the icon morphs (two clip-path halves), a ring shows progress through the period. -->
<script lang="ts">
	let {
		playing,
		progress,
		label,
		size = 46,
		ontoggle
	}: { playing: boolean; progress: number; label: string; size?: number; ontoggle: () => void } = $props();

	const R = 20;
	const C = 2 * Math.PI * R;
	const dash = $derived(C * (1 - Math.max(0, Math.min(1, progress))));
</script>

<button
	type="button"
	class="play"
	class:playing
	style:--s="{size}px"
	aria-label={label}
	aria-pressed={playing}
	title={label}
	onclick={ontoggle}
>
	<svg viewBox="0 0 48 48" aria-hidden="true">
		<circle class="track" cx="24" cy="24" r={R} />
		<circle class="prog" cx="24" cy="24" r={R} stroke-dasharray={C} stroke-dashoffset={dash} />
	</svg>
	<span class="icon" aria-hidden="true"><i class="a"></i><i class="b"></i></span>
</button>

<style>
	.play {
		position: relative;
		width: var(--s);
		height: var(--s);
		flex: none;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04) 70%);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.14),
			0 6px 22px rgba(0, 0, 0, 0.4);
		transition:
			transform var(--dur) var(--ease-spring),
			box-shadow var(--dur) var(--ease-out),
			background var(--dur) var(--ease-out);
	}
	.play:hover {
		transform: scale(1.06);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.2),
			0 0 0 6px rgba(255, 181, 71, 0.08),
			0 8px 26px rgba(0, 0, 0, 0.45);
	}
	.play:active {
		transform: scale(0.94);
		transition-duration: 90ms;
	}
	.play:focus-visible {
		border-radius: 50%;
	}
	.playing {
		background: radial-gradient(circle at 50% 30%, rgba(255, 181, 71, 0.26), rgba(255, 181, 71, 0.06) 70%);
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}
	circle {
		fill: none;
		stroke-width: 2;
	}
	.track {
		stroke: rgba(255, 255, 255, 0.08);
	}
	.prog {
		stroke: var(--sun);
		stroke-linecap: round;
		filter: drop-shadow(0 0 3px rgba(255, 181, 71, 0.7));
	}
	.icon {
		position: relative;
		width: 14px;
		height: 16px;
		transform: translateX(1.5px);
		transition: transform var(--dur) var(--ease-out);
	}
	.playing .icon {
		transform: translateX(0);
	}
	.icon i {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 50%;
		background: var(--text);
		transition: clip-path 380ms var(--ease-out);
	}
	.a {
		left: 0;
		clip-path: polygon(0 0, 100% 25%, 100% 75%, 0 100%);
	}
	.b {
		right: 0;
		clip-path: polygon(0 25%, 100% 50%, 100% 50%, 0 75%);
	}
	.playing .a {
		clip-path: polygon(0 0, 66% 0, 66% 100%, 0 100%);
	}
	.playing .b {
		clip-path: polygon(34% 0, 100% 0, 100% 100%, 34% 100%);
	}
</style>
