<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Start screen: "What would you like to do today?" with three ways in: the app, the pitch deck,
     the 30-second video. Shown only on a plain visit to "/" (no query, i.e. not a shared link to a
     site) and once per browser tab; the app keeps loading behind it. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app } from '#lib/state.svelte.ts';

	const KEY = 'lsn-welcome-seen';
	const plainVisit = typeof location !== 'undefined' && location.pathname === '/' && location.search === '';
	let seen = false;
	try {
		seen = sessionStorage.getItem(KEY) === '1';
	} catch {
		/* storage blocked: show it */
	}
	let open = $state(plainVisit && !seen);
	const mo = (d: number) => (prefersReducedMotion.current ? 0 : d);

	const T = {
		en: {
			kicker: 'Lunar Landing Site Navigator · NASA Space Apps 2026',
			title: 'What would you like to do today?',
			plan: ['Plan a landing', 'Where and when to land at the south pole: sunlight, Earth in view, longest night.'],
			pitch: ['Presentation', '7 slides: the problem, how it works, how we checked it.'],
			video: ['Video', '30 seconds over the lunar south pole.'],
			skip: 'Go straight to the app'
		},
		uk: {
			kicker: 'Lunar Landing Site Navigator · NASA Space Apps 2026',
			title: 'Що ви плануєте робити сьогодні?',
			plan: ['Спланувати посадку', 'Де й коли сідати на південному полюсі: Сонце, видимість Землі, найдовша ніч.'],
			pitch: ['Презентація', '7 слайдів: проблема, як це працює, як ми це перевірили.'],
			video: ['Відео', '30 секунд над південним полюсом Місяця.'],
			skip: 'Одразу до застосунку'
		}
	};
	const t = $derived(T[app.lang]);

	function close() {
		open = false;
		try {
			sessionStorage.setItem(KEY, '1');
		} catch {
			/* ignore */
		}
	}

	let first: HTMLButtonElement | undefined = $state();
	onMount(() => {
		if (open) first?.focus({ preventScroll: true });
	});
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
	<div class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" transition:fade={{ duration: mo(380) }}>
		<div class="inner" in:fly={{ y: 18, duration: mo(600), easing: cubicOut }}>
			<div class="toprow">
				<span class="kicker">{t.kicker}</span>
				<div class="seg" role="group" aria-label="Language">
					<button class:on={app.lang === 'en'} aria-pressed={app.lang === 'en'} onclick={() => (app.lang = 'en')}>EN</button>
					<button class:on={app.lang === 'uk'} aria-pressed={app.lang === 'uk'} onclick={() => (app.lang = 'uk')}>UK</button>
				</div>
			</div>
			<h1 id="welcome-title">{t.title}</h1>

			<div class="cards">
				<button class="card plan" bind:this={first} onclick={close} style:--d="0">
					<span class="ic" aria-hidden="true">
						<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" /><circle class="dot" cx="12" cy="12" r="2.2" /></svg>
					</span>
					<span class="ct">{t.plan[0]}</span>
					<span class="cd">{t.plan[1]}</span>
					<span class="go" aria-hidden="true">→</span>
				</button>
				<a class="card pitch" href="/pitch?lang={app.lang}" onclick={close} style:--d="1">
					<span class="ic" aria-hidden="true">
						<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="11" rx="2" /><path d="M12 15.5v4M8.5 19.5h7M7.5 12l3-3 2.5 2 3.5-3.5" /></svg>
					</span>
					<span class="ct">{t.pitch[0]}</span>
					<span class="cd">{t.pitch[1]}</span>
					<span class="go" aria-hidden="true">→</span>
				</a>
				<a class="card video" href="/video?lang={app.lang}" onclick={close} style:--d="2">
					<span class="ic" aria-hidden="true">
						<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path class="fill" d="M10.5 9.3v5.4l4.5-2.7z" /></svg>
					</span>
					<span class="ct">{t.video[0]}</span>
					<span class="cd">{t.video[1]}</span>
					<span class="go" aria-hidden="true">→</span>
				</a>
			</div>

			<button class="skip" onclick={close}>{t.skip}</button>
		</div>
	</div>
{/if}

<style>
	.welcome {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		overflow-y: auto;
		background:
			radial-gradient(ellipse at 50% 120%, rgba(255, 181, 71, 0.14), transparent 60%),
			rgba(4, 6, 10, 0.86);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		color: #fff;
	}
	.inner {
		width: min(980px, 100%);
	}
	.toprow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.kicker {
		font: 500 12px var(--font-mono, ui-monospace), monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--sun, #ffb547);
	}
	h1 {
		margin: 14px 0 28px;
		font: 600 clamp(30px, 5vw, 52px) / 1.08 var(--font-display, system-ui), sans-serif;
		letter-spacing: -0.02em;
		text-wrap: balance;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}
	.card {
		--c: var(--sun, #ffb547);
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		min-height: 210px;
		padding: 22px 22px 20px;
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background:
			radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--c) 22%, transparent), transparent 55%),
			rgba(14, 18, 27, 0.78);
		color: inherit;
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		overflow: hidden;
		animation: rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both;
		animation-delay: calc(120ms + var(--d) * 90ms);
		transition:
			transform 0.25s cubic-bezier(0.2, 0.7, 0.2, 1),
			border-color 0.25s,
			box-shadow 0.25s;
	}
	.card.pitch {
		--c: var(--earth, #5cc8ff);
	}
	.card.video {
		--c: #a58bff;
	}
	.card:hover,
	.card:focus-visible {
		transform: translateY(-4px);
		border-color: color-mix(in srgb, var(--c) 60%, transparent);
		box-shadow: 0 18px 50px -18px color-mix(in srgb, var(--c) 60%, transparent);
		outline: none;
	}
	.ic {
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--c) 18%, transparent);
		color: var(--c);
	}
	.ic svg {
		width: 26px;
		height: 26px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ic .fill,
	.ic .dot {
		fill: currentColor;
		stroke: none;
	}
	.ct {
		margin-top: 6px;
		font: 600 24px var(--font-display, system-ui), sans-serif;
	}
	.cd {
		font-size: 15px;
		line-height: 1.45;
		color: rgba(255, 255, 255, 0.72);
		text-wrap: pretty;
	}
	.go {
		position: absolute;
		right: 20px;
		top: 22px;
		font-size: 22px;
		color: var(--c);
		opacity: 0.55;
		transition:
			transform 0.25s,
			opacity 0.25s;
	}
	.card:hover .go,
	.card:focus-visible .go {
		transform: translateX(4px);
		opacity: 1;
	}
	.seg {
		display: flex;
		flex: none;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 999px;
		overflow: hidden;
	}
	.seg button {
		background: none;
		border: 0;
		color: rgba(255, 255, 255, 0.7);
		padding: 5px 11px;
		font: 600 12px var(--font-display, system-ui), sans-serif;
		cursor: pointer;
	}
	.seg button.on {
		background: #fff;
		color: #0a0d14;
	}
	.skip {
		display: block;
		margin: 22px auto 0;
		background: none;
		border: 0;
		color: rgba(255, 255, 255, 0.6);
		font: 500 14px var(--font-display, system-ui), sans-serif;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.skip:hover {
		color: #fff;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			animation: none;
		}
	}
	@media (max-width: 760px) {
		.cards {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.card {
			min-height: 0;
			padding: 16px 18px;
			display: grid;
			grid-template-columns: auto 1fr;
			column-gap: 14px;
			row-gap: 2px;
			align-items: center;
		}
		.ic {
			grid-row: span 2;
			width: 42px;
			height: 42px;
		}
		.ct {
			margin: 0;
			font-size: 19px;
		}
		.cd {
			font-size: 13.5px;
		}
		.go {
			top: 16px;
		}
		.kicker {
			font-size: 10px;
		}
		h1 {
			margin: 10px 0 18px;
		}
	}
</style>
