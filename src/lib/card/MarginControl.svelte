<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Antenna margin slider, 0–5° in 0.5° steps (Earth must clear the terrain by this much). -->
<script lang="ts">
	import { app } from '#lib/state.svelte.ts';
	import { COMMON } from '#lib/i18n.ts';
	import { T } from './strings.ts';
	import { marginText } from './format.ts';

	const t = $derived(T[app.lang]);
	const fill = $derived((app.earthMarginDeg / 5) * 100);
</script>

<div class="mc">
	<label class="head" for="margin-range">
		<span class="lbl">{COMMON[app.lang].marginLabel}</span>
		<span class="val num">{marginText(app.earthMarginDeg)}</span>
	</label>
	<div class="track" style:--p="{fill}%">
		<input
			id="margin-range"
			type="range"
			min="0"
			max="5"
			step="0.5"
			bind:value={app.earthMarginDeg}
			aria-label={t.marginAria}
			aria-valuetext={marginText(app.earthMarginDeg)}
		/>
		<div class="ticks" aria-hidden="true">
			{#each Array.from({ length: 11 }, (_, i) => i / 2) as v (v)}
				<span class:major={v % 1 === 0} class:passed={v <= app.earthMarginDeg}></span>
			{/each}
		</div>
	</div>
	<p class="help">{t.marginHelp}</p>
</div>

<style>
	.mc {
		display: grid;
		gap: 6px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		cursor: pointer;
	}
	.lbl {
		font-size: 13px;
		color: var(--text-2);
	}
	.val {
		font-size: 17px;
		font-weight: 600;
		color: var(--earth-soft);
	}
	.track {
		position: relative;
		height: 28px;
	}
	input {
		-webkit-appearance: none;
		appearance: none;
		position: absolute;
		inset: 0;
		width: 100%;
		margin: 0;
		background: transparent;
		cursor: pointer;
		z-index: 1;
	}
	input::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 4px;
		background: linear-gradient(90deg, var(--earth) var(--p), rgba(255, 255, 255, 0.1) var(--p));
	}
	input::-moz-range-track {
		height: 4px;
		border-radius: 4px;
		background: linear-gradient(90deg, var(--earth) var(--p), rgba(255, 255, 255, 0.1) var(--p));
	}
	input::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 18px;
		height: 18px;
		margin-top: -7px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0 0 4px rgba(92, 200, 255, 0.25), 0 2px 8px rgba(0, 0, 0, 0.5);
		transition: transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast);
	}
	input::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border: 0;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0 0 4px rgba(92, 200, 255, 0.25), 0 2px 8px rgba(0, 0, 0, 0.5);
	}
	input:hover::-webkit-slider-thumb,
	input:active::-webkit-slider-thumb {
		transform: scale(1.18);
		box-shadow: 0 0 0 7px rgba(92, 200, 255, 0.22), 0 2px 8px rgba(0, 0, 0, 0.5);
	}
	input:focus-visible {
		outline: none;
	}
	input:focus-visible::-webkit-slider-thumb {
		box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--earth);
	}
	input:focus-visible::-moz-range-thumb {
		box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--earth);
	}
	.ticks {
		position: absolute;
		left: 9px;
		right: 9px;
		top: 19px;
		display: flex;
		justify-content: space-between;
		pointer-events: none;
	}
	.ticks span {
		width: 1px;
		height: 3px;
		background: rgba(255, 255, 255, 0.14);
		transition: background var(--dur);
	}
	.ticks span.major {
		height: 5px;
	}
	.ticks span.passed {
		background: rgba(92, 200, 255, 0.55);
	}
	.help {
		margin: 0;
		font-size: 11.5px;
		color: var(--text-3);
	}
</style>
