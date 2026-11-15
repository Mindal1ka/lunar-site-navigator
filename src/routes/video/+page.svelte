<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- /video: the 30-second demo video, full screen, in English or Ukrainian (?lang=uk).
     Made for showing it in a call: share this tab with its audio. Keys: Space play/pause,
     F full screen, R restart, L language. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { dataUrl } from '#lib/engine/dataurl.ts';

	type Lang = 'en' | 'uk';
	const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
	let lang = $state<Lang>(params.get('lang') === 'uk' ? 'uk' : 'en');
	let video: HTMLVideoElement | undefined = $state();
	let playing = $state(false);
	let started = $state(false);
	let ended = $state(false);
	let progress = $state(0);
	let idle = $state(false);
	let isFull = $state(false);
	let idleTimer: ReturnType<typeof setTimeout> | undefined;

	const T = {
		en: {
			title: 'Lunar Landing Site Navigator: 30-second video',
			play: 'Play',
			pause: 'Pause',
			replay: 'Play again',
			full: 'Full screen',
			exitFull: 'Exit full screen',
			sound: 'Sound on: share this tab with its audio',
			site: 'Open the app',
			deck: 'Presentation',
			note: 'Real app render · NASA LOLA + JPL/NAIF data · original synthesized music · AI-assisted',
			download: 'Download'
		},
		uk: {
			title: 'Lunar Landing Site Navigator: відео на 30 секунд',
			play: 'Відтворити',
			pause: 'Пауза',
			replay: 'Ще раз',
			full: 'На весь екран',
			exitFull: 'Вийти з повноекранного режиму',
			sound: 'Зі звуком: показуйте цю вкладку разом зі звуком',
			site: 'Відкрити застосунок',
			deck: 'Презентація',
			note: 'Справжній рендер застосунку · дані NASA LOLA + JPL/NAIF · власна синтезована музика · створено з допомогою ШІ',
			download: 'Завантажити'
		}
	};
	const t = $derived(T[lang]);
	const src = $derived(dataUrl(`/video/lunar-landing-site-navigator-30s-${lang}.mp4`));

	function setLang(l: Lang) {
		if (l === lang) return;
		const wasPlaying = playing;
		lang = l;
		const u = new URL(location.href);
		u.searchParams.set('lang', l);
		history.replaceState(null, '', u);
		started = false;
		ended = false;
		progress = 0;
		if (wasPlaying) queueMicrotask(() => video?.play());
	}

	function toggle() {
		if (!video) return;
		if (video.paused || video.ended) {
			if (video.ended) video.currentTime = 0;
			video.play();
		} else video.pause();
	}
	function restart() {
		if (!video) return;
		video.currentTime = 0;
		video.play();
	}
	function fullscreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen?.();
	}
	function seek(e: MouseEvent) {
		if (!video || !video.duration) return;
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		video.currentTime = ((e.clientX - r.left) / r.width) * video.duration;
	}
	function wake() {
		idle = false;
		clearTimeout(idleTimer);
		idleTimer = setTimeout(() => (idle = playing), 1800);
	}
	function onKey(e: KeyboardEvent) {
		if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
		const k = e.key.toLowerCase();
		if (k === ' ' || k === 'k') {
			e.preventDefault();
			toggle();
		} else if (k === 'f') fullscreen();
		else if (k === 'r') restart();
		else if (k === 'l') setLang(lang === 'en' ? 'uk' : 'en');
		else return;
		wake();
	}

	onMount(() => {
		const onFs = () => (isFull = !!document.fullscreenElement);
		document.addEventListener('fullscreenchange', onFs);
		return () => document.removeEventListener('fullscreenchange', onFs);
	});
</script>

<svelte:head>
	<title>{t.title}</title>
	<meta name="description" content="Lunar Landing Site Navigator: 30-second demo video (NASA Space Apps 2026)" />
</svelte:head>

<svelte:window onkeydown={onKey} onmousemove={wake} onpointerdown={wake} />

<main class:idle lang={lang}>
	<!-- svelte-ignore a11y_media_has_caption: captions are burned into the video in both languages -->
	<video
		bind:this={video}
		{src}
		playsinline
		preload="auto"
		onclick={toggle}
		onplay={() => {
			playing = true;
			started = true;
			ended = false;
			wake();
		}}
		onpause={() => {
			playing = false;
			idle = false;
		}}
		onended={() => {
			playing = false;
			ended = true;
			idle = false;
		}}
		ontimeupdate={() => video && video.duration && (progress = video.currentTime / video.duration)}
	></video>

	{#if !playing}
		<button class="big" onclick={toggle} aria-label={ended ? t.replay : t.play}>
			{#if ended}
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4.5h4.5" /></svg>
			{:else}
				<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M8 5.5v13l11-6.5z" /></svg>
			{/if}
			<span>{ended ? t.replay : t.play}</span>
		</button>
		{#if !started}<p class="hint">{t.sound}</p>{/if}
	{/if}

	<header class="bar top">
		<a class="brand" href="/">Lunar Landing Site Navigator</a>
		<nav>
			<a href="/pitch?lang={lang}">{t.deck}</a>
			<a href="/">{t.site}</a>
			<div class="seg" role="group" aria-label="Language">
				<button class:on={lang === 'en'} aria-pressed={lang === 'en'} onclick={() => setLang('en')}>EN</button>
				<button class:on={lang === 'uk'} aria-pressed={lang === 'uk'} onclick={() => setLang('uk')}>UK</button>
			</div>
		</nav>
	</header>

	<footer class="bar bottom">
		<button class="icon" onclick={toggle} aria-label={playing ? t.pause : t.play} title={playing ? t.pause : t.play}>
			{#if playing}
				<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
			{:else}
				<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M8 5.5v13l11-6.5z" /></svg>
			{/if}
		</button>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions: keyboard seeking is R (restart); the bar is a mouse shortcut -->
		<div class="track" onclick={seek}>
			<div class="fillbar" style:transform="scaleX({progress})"></div>
		</div>
		<a class="icon" href={src} download="lunar-landing-site-navigator-30s-{lang}.mp4" aria-label={t.download} title={t.download}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" /></svg>
		</a>
		<button class="icon" onclick={fullscreen} aria-label={isFull ? t.exitFull : t.full} title={isFull ? t.exitFull : t.full}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{#if isFull}<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />{:else}<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />{/if}
			</svg>
		</button>
	</footer>
	<p class="note">{t.note}</p>
</main>

<style>
	:global(body) {
		background: #000;
	}
	main {
		position: fixed;
		inset: 0;
		background: #000;
		color: #fff;
		font-family: var(--font-display, system-ui), sans-serif;
		overflow: hidden;
	}
	main.idle {
		cursor: none;
	}
	video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #000;
		outline: none;
	}
	.big {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 28px 16px 22px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		background: rgba(10, 13, 20, 0.7);
		backdrop-filter: blur(8px);
		color: #fff;
		font: 600 20px var(--font-display, system-ui), sans-serif;
		cursor: pointer;
		transition: transform 0.2s, background 0.2s;
	}
	.big:hover {
		background: rgba(255, 181, 71, 0.22);
		transform: translate(-50%, -50%) scale(1.04);
	}
	.big svg {
		width: 30px;
		height: 30px;
	}
	.hint {
		position: absolute;
		left: 0;
		right: 0;
		top: calc(50% + 48px);
		margin: 0;
		text-align: center;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.65);
	}
	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	svg .fill {
		fill: currentColor;
		stroke: none;
	}
	.bar {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 18px;
		transition: opacity 0.4s;
	}
	main.idle .bar,
	main.idle .note {
		opacity: 0;
		pointer-events: none;
	}
	.top {
		top: 0;
		justify-content: space-between;
		background: linear-gradient(rgba(0, 0, 0, 0.6), transparent);
	}
	.bottom {
		bottom: 18px;
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
	}
	.brand {
		color: #fff;
		text-decoration: none;
		font-weight: 600;
		font-size: 15px;
	}
	nav {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	nav a {
		color: rgba(255, 255, 255, 0.8);
		text-decoration: none;
		font-size: 14px;
	}
	nav a:hover {
		color: #fff;
	}
	.seg {
		display: flex;
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
	.icon {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		flex: none;
		border-radius: 50%;
		border: 0;
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		cursor: pointer;
	}
	.icon:hover {
		background: rgba(255, 255, 255, 0.2);
	}
	.icon svg {
		width: 20px;
		height: 20px;
	}
	.track {
		flex: 1;
		height: 6px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.2);
		overflow: hidden;
		cursor: pointer;
	}
	.fillbar {
		height: 100%;
		background: #ffb547;
		transform-origin: left;
	}
	.note {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 4px;
		margin: 0;
		text-align: center;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
		transition: opacity 0.4s;
	}
	@media (max-width: 600px) {
		.brand {
			display: none;
		}
		.top {
			justify-content: flex-end;
		}
	}
</style>
