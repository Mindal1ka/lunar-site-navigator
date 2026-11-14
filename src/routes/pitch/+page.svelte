<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Pitch deck as a page of the site: 7 slides at 1920 x 1080 scaled to the window, entrance
     motion per slide, EN/UK, keyboard / click / swipe navigation, full screen, and downloads of
     the same deck as PDF or PowerPoint in either language (files rendered from this page with
     ?print=1, see scripts/pitch_export.mjs). -->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { PITCH, type PitchLang } from '#lib/pitch/content.ts';
	import { dataUrl } from '#lib/engine/dataurl.ts';

	const N = 7;
	const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
	const print = params.get('print') === '1';
	let lang = $state<PitchLang>(params.get('lang') === 'uk' ? 'uk' : 'en');
	let cur = $state(Math.min(N - 1, Math.max(0, Number(params.get('s') ?? 1) - 1 || 0)));
	let scale = $state(1);
	let idle = $state(false);
	let menu = $state(false);
	let isFull = $state(false);
	let host: HTMLDivElement | undefined = $state();

	const T = $derived(PITCH[lang]);
	const img = (n: string) => dataUrl(`/pitch/${lang}/${n}.jpg`);
	const num = (v: number, d = 1) => v.toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
	const files = (l: PitchLang, ext: 'pdf' | 'pptx') => dataUrl(`/pitch/lunar-landing-site-navigator-${l}.${ext}`);

	// Gläser et al. 2018 / EPSC 2014 vs ours (static/data/validation.json)
	const TABLE = [
		[88.0, 86.4, -1.6],
		[78.1, 78.0, -0.1],
		[85.5, 85.5, 0.0],
		[82.1, 75.4, -6.7],
		[92.5, 92.5, 0.0]
	];

	function go(i: number) {
		const n = Math.min(N - 1, Math.max(0, i));
		if (n === cur) return;
		cur = n;
		menu = false;
	}
	const next = () => go(cur + 1);
	const prev = () => go(cur - 1);

	function fit() {
		scale = print ? 1 : Math.min(innerWidth / 1920, innerHeight / 1080);
	}

	// keep ?lang= and ?s= in the address bar so a link opens the same slide
	$effect(() => {
		if (print) return;
		const q = new URLSearchParams(location.search);
		if (lang === 'uk') q.set('lang', 'uk');
		else q.delete('lang');
		if (cur > 0) q.set('s', String(cur + 1));
		else q.delete('s');
		const s = q.toString();
		history.replaceState(history.state, '', location.pathname + (s ? `?${s}` : ''));
		document.documentElement.lang = lang;
	});

	// count-up numbers on the slide that just appeared
	$effect(() => {
		const i = cur;
		lang;
		if (print || !host) return;
		let raf = 0;
		tick().then(() => {
			const els = [...(host?.querySelectorAll<HTMLElement>(`.slide[data-i="${i}"] [data-to]`) ?? [])];
			const t0 = performance.now() + 350;
			const step = (now: number) => {
				const k = Math.min(1, Math.max(0, (now - t0) / 1300));
				const e = 1 - Math.pow(1 - k, 4);
				for (const el of els) {
					const to = Number(el.dataset.to);
					const d = Number(el.dataset.d ?? 1);
					el.textContent = num(to * e, d);
				}
				if (k < 1) raf = requestAnimationFrame(step);
			};
			raf = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(raf);
	});

	let idleT: ReturnType<typeof setTimeout> | undefined;
	let overBar = false;
	function wake() {
		idle = false;
		clearTimeout(idleT);
		idleT = setTimeout(() => (idle = !menu && !overBar), 2600);
	}

	function onKey(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement) return;
		if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
			e.preventDefault();
			next();
		} else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
			e.preventDefault();
			prev();
		} else if (e.key === 'Home') go(0);
		else if (e.key === 'End') go(N - 1);
		else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') toggleFull();
		else if (e.key === 'Escape') menu = false;
		wake();
	}

	let lastPointer = 'mouse';
	function onStageClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('a, button, .bar')) return;
		if (menu) {
			menu = false;
			return;
		}
		// on touch screens the first tap shows the hidden controls instead of turning the page
		if (idle && lastPointer === 'touch') {
			wake();
			return;
		}
		if (e.clientX > innerWidth * 0.35) next();
		else prev();
	}

	let sx = 0;
	let sy = 0;
	function touchStart(e: TouchEvent) {
		sx = e.touches[0].clientX;
		sy = e.touches[0].clientY;
	}
	function touchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - sx;
		const dy = e.changedTouches[0].clientY - sy;
		if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : prev)();
	}

	function toggleFull() {
		if (document.fullscreenElement) document.exitFullscreen?.();
		else document.documentElement.requestFullscreen?.().catch(() => {});
	}

	onMount(() => {
		fit();
		wake();
		if (print) {
			// the app shell locks html/body to the viewport; the print view is a long page of slides
			for (const el of [document.documentElement, document.body]) {
				el.style.overflow = 'visible';
				el.style.height = 'auto';
			}
		}
		const onFs = () => (isFull = !!document.fullscreenElement);
		document.addEventListener('fullscreenchange', onFs);
		return () => document.removeEventListener('fullscreenchange', onFs);
	});
</script>

<svelte:head>
	<title>{T.ui.title}</title>
	<meta name="description" content="Lunar Landing Site Navigator: NASA Space Apps 2026 pitch" />
</svelte:head>

<svelte:window onresize={fit} onkeydown={onKey} onmousemove={wake} onpointerdown={(e) => (lastPointer = e.pointerType)} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="viewer"
	class:print
	class:idle={idle && !print}
	onclick={print ? undefined : onStageClick}
	ontouchstart={touchStart}
	ontouchend={touchEnd}
>
	<div class="stage" bind:this={host} style:--s={scale}>
		<!-- 1 · title -->
		<section class="slide s1" class:on={print || cur === 0} data-i="0" aria-hidden={!print && cur !== 0}>
			<img class="bgshot" src={img('hero')} alt="" />
			<div class="veil"></div>
			<svg class="sky" viewBox="0 0 1920 1080" aria-hidden="true">
				{#each Array.from({ length: 70 }, (_, k) => k) as k (k)}
					<circle
						cx={(k * 977) % 1920}
						cy={(k * 613) % 640}
						r={k % 7 === 0 ? 1.8 : 1.1}
						style:animation-delay={`${(k % 13) * 0.37}s`}
						class="star"
					/>
				{/each}
			</svg>
			<div class="horizon" aria-hidden="true">
				<div class="sunpath"><div class="sun"></div></div>
			</div>
			<div class="in">
				<div class="kicker a" style:--d="0">{T.s1.kicker}</div>
				<h1>
					<span class="line"><span class="a up" style:--d="1">{T.s1.title[0]}</span></span>
					<span class="line"><span class="a up" style:--d="2">{T.s1.title[1]}</span></span>
				</h1>
				<p class="lead a" style:--d="4">
					{T.s1.lead[0]}<span class="sun-c">{T.s1.lead[1]}</span>{T.s1.lead[2]}<span class="earth-c">{T.s1.lead[3]}</span
					>{T.s1.lead[4]}<span class="night-c">{T.s1.lead[5]}</span>{T.s1.lead[6]}
				</p>
				<div class="team a" style:--d="6">✦ IT STEP Poltava × Mindal1ka.com ✦</div>
				<div class="url a" style:--d="7">space.mindal1ka.com</div>
			</div>
		</section>

		<!-- 2 · problem -->
		<section class="slide s2" class:on={print || cur === 1} data-i="1" aria-hidden={!print && cur !== 1}>
			<div class="kicker a" style:--d="0">{T.s2.kicker}</div>
			<h2 class="a" style:--d="1">{T.s2.title}</h2>
			<div class="grid">
				<div>
					<div class="qs">
						{#each T.s2.q as [h, t], k (h)}
							<div class="card q a left" style:--d={3 + k}>
								<b class={['sun-c', 'night-c', 'earth-c'][k]}
									><span class="dot" style:background={['var(--sun)', 'var(--night)', 'var(--earth)'][k]}></span>{h}</b
								><span>{t}</span>
							</div>
						{/each}
					</div>
					<p class="callout a" style:--d="7">
						{T.s2.callout[0]}<b class="sun-c"><span data-to="38.5">{num(38.5)}</span>&nbsp;%</b>{T.s2.callout[1]}<b class="sun-c"
							><span data-to="87">{num(87)}</span>&nbsp;%</b
						>{T.s2.callout[2]}<b class="night-c"><span data-to="7" data-d="0">7</span></b>{T.s2.callout[3]}<b class="night-c"
							><span data-to="27" data-d="0">27</span></b
						>{T.s2.callout[4]}
					</p>
				</div>
				<div class="a right" style:--d="2">
					<div class="frame"><img class="shot" src={img('pano_crop')} alt={T.s2.caption} /></div>
					<p class="small cap">{T.s2.caption}</p>
				</div>
			</div>
			<div class="num">2 / 7</div>
		</section>

		<!-- 3 · product -->
		<section class="slide s3" class:on={print || cur === 2} data-i="2" aria-hidden={!print && cur !== 2}>
			<div class="kicker a" style:--d="0">{T.s3.kicker}</div>
			<h2 class="a" style:--d="1">{T.s3.title}</h2>
			<div class="frame shotwrap a zoom" style:--d="2"><img class="shot" src={img('compare')} alt="" /></div>
			<div class="side">
				{#each T.s3.f as [h, t], k (h)}
					<div class="card a right" style:--d={3 + k}><b>{h}</b><span>{t}</span></div>
				{/each}
			</div>
			<div class="num">3 / 7</div>
		</section>

		<!-- 4 · method -->
		<section class="slide s4" class:on={print || cur === 3} data-i="3" aria-hidden={!print && cur !== 3}>
			<div class="kicker a" style:--d="0">{T.s4.kicker}</div>
			<h2 class="a" style:--d="1">{T.s4.title}</h2>
			<div class="flow">
				{#each T.s4.steps as [tag, h, t], k (tag)}
					<div class="card step a up2" style:--d={2 + k * 1.6}>
						<div class="tag">{tag}</div>
						<b>{h}</b><span>{t}</span>
					</div>
					{#if k < 3}<div class="arrow a draw" style:--d={3 + k * 1.6} aria-hidden="true"><i></i></div>{/if}
				{/each}
			</div>
			<div class="row">
				<div class="stats">
					<div class="card a up2" style:--d="8">
						<div class="big sun-c"><span data-to="17.6">{num(17.6)}</span> M</div>
						<span>{T.s4.stat1}</span>
					</div>
					<div class="card a up2" style:--d="9">
						<div class="big earth-c">~<span data-to="2" data-d="0">2</span> {T.s4.min}</div>
						<span>{T.s4.stat2}</span>
					</div>
				</div>
				<div class="frame a zoom" style:--d="10"><img class="shot" src={img('heat_crop')} alt="" /></div>
			</div>
			<div class="num">4 / 7</div>
		</section>

		<!-- 5 · validation -->
		<section class="slide s5" class:on={print || cur === 4} data-i="4" aria-hidden={!print && cur !== 4}>
			<div class="kicker a" style:--d="0">{T.s5.kicker}</div>
			<h2 class="a" style:--d="1">{T.s5.title}</h2>
			<div class="grid">
				<div>
					<div class="res">
						<div class="card a up2" style:--d="2">
							<div class="big ok-c"><span data-to="0.1">{num(0.1)}</span>″</div>
							<p class="small">{T.s5.r1[0]}<b>{T.s5.r1[1]}</b>{T.s5.r1[2]}</p>
						</div>
						<div class="card a up2" style:--d="3">
							<div class="big ok-c"><span data-to="1.0">{num(1.0)}</span>&nbsp;{T.s5.pp}</div>
							<p class="small">{T.s5.r2[0]}<b>{T.s5.r2[1]}</b>{T.s5.r2[2]}</p>
						</div>
					</div>
					<p class="note a" style:--d="5">{T.s5.note}</p>
				</div>
				<div class="card a right" style:--d="3">
					<h3>{T.s5.tTitle}</h3>
					<p class="small sub">{T.s5.tSub}</p>
					<table>
						<thead><tr>{#each T.s5.th as h (h)}<th>{h}</th>{/each}</tr></thead>
						<tbody>
							{#each TABLE as [p, o, d], k (k)}
								<tr class="a row-in" style:--d={4 + k * 0.7}>
									<td>{T.s5.rows[k]}</td>
									<td>{num(p)}</td>
									<td>{num(o)}</td>
									<td class:warn={d < -3}>{d === 0 ? num(0) : (d > 0 ? '+' : '−') + num(Math.abs(d))}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
			<div class="num">5 / 7</div>
		</section>

		<!-- 6 · planning -->
		<section class="slide s6" class:on={print || cur === 5} data-i="5" aria-hidden={!print && cur !== 5}>
			<div class="left">
				<div class="kicker a" style:--d="0">{T.s6.kicker}</div>
				<h2 class="a" style:--d="1">{T.s6.title}</h2>
				<div class="feat">
					{#each T.s6.f as [h, t], k (h)}
						<div class="card a left" style:--d={3 + k}><b>{h}</b><span>{t}</span></div>
					{/each}
				</div>
			</div>
			<div class="frame p1 a right" style:--d="2"><img class="shot" src={img('planner_crop')} alt="" /></div>
			<div class="frame p2 a right" style:--d="4"><img class="shot" src={img('slope')} alt="" /></div>
			<div class="num">6 / 7</div>
		</section>

		<!-- 7 · sources -->
		<section class="slide s7" class:on={print || cur === 6} data-i="6" aria-hidden={!print && cur !== 6}>
			<div class="kicker a" style:--d="0">{T.s7.kicker}</div>
			<h2 class="a" style:--d="1">{T.s7.title}</h2>
			<div class="grid">
				<div class="a up2" style:--d="2">
					<h3>{T.s7.data}</h3>
					<ul>{#each T.s7.dataList as [b, t] (t)}<li><b>{b}</b>{t}</li>{/each}</ul>
				</div>
				<div class="a up2" style:--d="3">
					<h3>{T.s7.code}</h3>
					<ul>
						{#each T.s7.codeList as [b, t] (t)}<li>{b}<b>{t}</b></li>{/each}
						<li class="mono">github.com/Mindal1ka/lunar-site-navigator</li>
					</ul>
				</div>
				<div class="try a pop" style:--d="4">
					<div class="qr"><img src="/pitch/qr.svg" alt="QR: space.mindal1ka.com" /></div>
					<div class="url">space.mindal1ka.com</div>
					<p class="small">{T.s7.try}</p>
				</div>
			</div>
			<p class="ai a" style:--d="6">{T.s7.ai}</p>
			<div class="num">7 / 7</div>
		</section>
	</div>

	{#if !print}
		<div class="progress" aria-hidden="true"><i style:width={`${((cur + 1) / N) * 100}%`}></i></div>
		<a class="back ctl" href="/" title={T.ui.back}>
			<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
			{T.ui.back}
		</a>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="bar ctl" onpointerenter={() => (overBar = true)} onpointerleave={() => (overBar = false)}>
			<button onclick={prev} disabled={cur === 0} aria-label={T.ui.prev}>
				<svg viewBox="0 0 16 16" width="18" height="18"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</button>
			<div class="dots">
				{#each Array.from({ length: N }, (_, k) => k) as k (k)}
					<button class="dotb" class:act={k === cur} onclick={() => go(k)} aria-label={`${k + 1} / ${N}`}></button>
				{/each}
			</div>
			<button onclick={next} disabled={cur === N - 1} aria-label={T.ui.next}>
				<svg viewBox="0 0 16 16" width="18" height="18"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</button>
			<span class="sep"></span>
			<div class="seg" role="group" aria-label="Language">
				<button class:act={lang === 'en'} onclick={() => (lang = 'en')}>EN</button>
				<button class:act={lang === 'uk'} onclick={() => (lang = 'uk')}>UK</button>
			</div>
			<button onclick={toggleFull} aria-label={T.ui.fullscreen} title={T.ui.fullscreen}>
				{#if isFull}
					<svg viewBox="0 0 16 16" width="17" height="17"><path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
				{:else}
					<svg viewBox="0 0 16 16" width="17" height="17"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
				{/if}
			</button>
			<div class="exp">
				<button class="primary" onclick={() => (menu = !menu)} aria-expanded={menu}>
					<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 2v8m-3.5-3.5L8 10l3.5-3.5M3 13h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
					{T.ui.export}
				</button>
				{#if menu}
					<div class="menu" role="menu">
						{#each ['pdf', 'pptx'] as const as ext (ext)}
							<div class="mh">{ext === 'pdf' ? T.ui.pdf : T.ui.pptx}</div>
							{#each ['en', 'uk'] as const as l (l)}
								<a role="menuitem" href={files(l, ext)} download onclick={() => (menu = false)}>
									<span>{T.ui.langName[l]}</span><em>.{ext}</em>
								</a>
							{/each}
						{/each}
					</div>
				{/if}
			</div>
		</div>
		<div class="hint ctl">{T.ui.hint}</div>
	{/if}
</div>

<style>
	.viewer {
		--bgc: #070a11;
		--panel: rgba(20, 26, 38, 0.78);
		--line: rgba(255, 255, 255, 0.09);
		--text: #eef1f6;
		--muted: #9aa3b2;
		--dim: #6b7486;
		--sun: #ffb547;
		--earth: #4cc2ff;
		--night: #9b8cff;
		--ok: #5fe0a8;
		--ease: cubic-bezier(0.16, 1, 0.3, 1);
		position: fixed;
		inset: 0;
		background: #03050a;
		color: var(--text);
		font-family: var(--font-ui);
		overflow: hidden;
		user-select: none;
	}
	.viewer.print {
		position: static;
		overflow: visible;
		background: var(--bgc);
		user-select: auto;
	}
	.stage {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 1920px;
		height: 1080px;
		transform: translate(-50%, -50%) scale(var(--s));
	}
	.print .stage {
		position: static;
		transform: none;
		height: auto;
	}

	/* ---------------- slides ---------------- */
	.slide {
		position: absolute;
		inset: 0;
		overflow: hidden;
		padding: 84px 96px;
		background:
			radial-gradient(1200px 700px at 85% -10%, rgba(255, 181, 71, 0.1), transparent 60%),
			radial-gradient(900px 600px at -10% 110%, rgba(76, 194, 255, 0.08), transparent 60%),
			var(--bgc);
		opacity: 0;
		visibility: hidden;
		transform: scale(1.015);
		transition:
			opacity 600ms var(--ease),
			transform 900ms var(--ease),
			visibility 0s 600ms;
	}
	.slide.on {
		opacity: 1;
		visibility: visible;
		transform: none;
		transition:
			opacity 600ms var(--ease),
			transform 900ms var(--ease);
	}
	.print .slide {
		position: relative;
		width: 1920px;
		height: 1080px;
		break-after: page;
		transition: none;
	}

	/* entrance motion: elements with .a animate when their slide is on */
	.a {
		opacity: 0;
	}
	.on .a {
		animation: fadeUp 900ms var(--ease) calc(120ms + var(--d, 0) * 110ms) both;
	}
	.on .a.left {
		animation-name: fromLeft;
	}
	.on .a.right {
		animation-name: fromRight;
	}
	.on .a.zoom {
		animation-name: zoomIn;
		animation-duration: 1200ms;
	}
	.on .a.up2 {
		animation-name: rise;
	}
	.on .a.pop {
		animation-name: pop;
		animation-duration: 1000ms;
	}
	.on .a.row-in {
		animation-name: fromRight;
		animation-duration: 700ms;
	}
	.line {
		display: block;
		overflow: hidden;
		padding-bottom: 0.08em;
	}
	.line .a {
		display: inline-block;
	}
	.on .a.up {
		animation-name: lineUp;
		animation-duration: 1100ms;
	}
	@keyframes fadeUp {
		from { opacity: 0; transform: translateY(24px); filter: blur(6px); }
		to { opacity: 1; transform: none; filter: none; }
	}
	@keyframes lineUp {
		from { opacity: 0; transform: translateY(105%); }
		to { opacity: 1; transform: none; }
	}
	@keyframes fromLeft {
		from { opacity: 0; transform: translateX(-48px); }
		to { opacity: 1; transform: none; }
	}
	@keyframes fromRight {
		from { opacity: 0; transform: translateX(56px); }
		to { opacity: 1; transform: none; }
	}
	@keyframes zoomIn {
		from { opacity: 0; transform: translateY(24px); filter: blur(6px); }
		to { opacity: 1; transform: none; filter: none; }
	}
	@keyframes rise {
		from { opacity: 0; transform: translateY(40px) scale(0.97); }
		to { opacity: 1; transform: none; }
	}
	@keyframes pop {
		0% { opacity: 0; transform: scale(0.6) rotate(-6deg); }
		60% { opacity: 1; transform: scale(1.04) rotate(1deg); }
		100% { opacity: 1; transform: none; }
	}
	.print .a,
	.print .star,
	.print .sun,
	.print .arrow i {
		animation: none !important;
		opacity: 1;
	}
	.print .arrow i {
		transform: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.on .a {
			animation-duration: 1ms !important;
			animation-delay: 0ms !important;
		}
	}

	h1,
	h2,
	h3 {
		font-family: var(--font-display);
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	h1 {
		font-size: 112px;
		line-height: 1;
		margin: 0 0 40px;
	}
	h2 {
		font-size: 62px;
		line-height: 1.08;
		max-width: 1540px;
		margin: 0;
	}
	.kicker {
		font-family: var(--font-mono);
		font-size: 22px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--sun);
		margin-bottom: 24px;
	}
	.lead {
		font-size: 34px;
		line-height: 1.4;
		color: #c9d0db;
		margin: 0;
	}
	.small {
		font-size: 22px;
		color: var(--muted);
		line-height: 1.45;
		margin: 0;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.card {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 22px;
		padding: 28px 32px;
	}
	.card > b {
		display: block;
		font-family: var(--font-display);
		font-weight: 600;
	}
	.frame {
		border-radius: 22px;
		border: 1px solid var(--line);
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
		overflow: hidden;
	}
	.shot {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transform-origin: 50% 50%;
	}
	.num {
		position: absolute;
		right: 96px;
		bottom: 48px;
		font-family: var(--font-mono);
		font-size: 20px;
		color: var(--dim);
	}
	.sun-c { color: var(--sun); }
	.earth-c { color: var(--earth); }
	.night-c { color: var(--night); }
	.ok-c { color: var(--ok); }
	.dot {
		display: inline-block;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		margin-right: 14px;
		vertical-align: 3px;
	}
	.big {
		font-family: var(--font-display);
		font-size: 84px;
		font-weight: 600;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	/* 1 */
	.s1 {
		padding: 0;
	}
	.s1 .bgshot {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.5;
	}
	.s1 .veil {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(7, 10, 17, 0.97) 0%, rgba(7, 10, 17, 0.86) 42%, rgba(7, 10, 17, 0.15) 75%, rgba(7, 10, 17, 0.4) 100%);
	}
	.sky {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.star {
		fill: #fff;
		opacity: 0.25;
		animation: tw 3.4s ease-in-out infinite;
	}
	@keyframes tw {
		50% { opacity: 0.9; }
	}
	.horizon {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 150px;
		height: 2px;
		background: linear-gradient(90deg, transparent, rgba(255, 181, 71, 0.55) 30%, rgba(255, 181, 71, 0.55) 70%, transparent);
		opacity: 0.6;
	}
	.sunpath {
		position: absolute;
		inset: 0;
	}
	.sun {
		position: absolute;
		top: -14px;
		left: 0;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #fff3d6;
		box-shadow: 0 0 30px 12px rgba(255, 181, 71, 0.75), 0 0 120px 50px rgba(255, 181, 71, 0.25);
		animation: glide 26s linear infinite;
	}
	/* the polar Sun: a full circle around the sky, never climbing more than a little */
	@keyframes glide {
		0% { transform: translate(-60px, 0); }
		25% { transform: translate(480px, -26px); }
		50% { transform: translate(960px, -40px); }
		75% { transform: translate(1440px, -22px); }
		100% { transform: translate(1980px, 0); }
	}
	.print .sun {
		transform: translate(1380px, -26px);
	}
	.s1 .in {
		position: relative;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		max-width: 1140px;
		padding: 0 96px;
	}
	.s1 .team {
		margin-top: 60px;
		font-size: 30px;
	}
	.s1 .url,
	.try .url {
		font-family: var(--font-mono);
		color: var(--sun);
	}
	.s1 .url {
		margin-top: 30px;
		font-size: 30px;
	}

	/* 2 */
	.s2 .grid {
		display: grid;
		grid-template-columns: 760px 1fr;
		gap: 64px;
		margin-top: 54px;
	}
	.qs {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.q b {
		font-size: 34px;
		margin-bottom: 8px;
	}
	.q span {
		font-size: 25px;
		color: var(--muted);
		line-height: 1.4;
	}
	.callout {
		margin: 26px 0 0;
		font-size: 28px;
		line-height: 1.45;
		color: #c9d0db;
	}
	.callout b {
		font-variant-numeric: tabular-nums;
	}
	.s2 .frame {
		height: 560px;
	}
	.cap {
		margin-top: 16px;
	}

	/* 3 */
	.s3 h2 {
		font-size: 54px;
	}
	.s3 .shotwrap {
		position: absolute;
		left: 96px;
		top: 250px;
		width: 1250px;
		height: 703px;
	}
	.s3 .side {
		position: absolute;
		right: 96px;
		top: 250px;
		width: 440px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.s3 .side .card {
		padding: 18px 24px;
	}
	.s3 .side b {
		font-size: 26px;
		margin-bottom: 6px;
	}
	.s3 .side span {
		font-size: 20px;
		color: var(--muted);
		line-height: 1.4;
	}

	/* 4 */
	.flow {
		display: grid;
		grid-template-columns: 1fr 34px 1fr 34px 1fr 34px 1fr;
		align-items: stretch;
		margin-top: 44px;
	}
	.step {
		min-height: 270px;
	}
	.step .tag {
		font-family: var(--font-mono);
		font-size: 18px;
		color: var(--dim);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.step b {
		font-size: 31px;
		margin: 14px 0 12px;
		line-height: 1.15;
	}
	.step span {
		font-size: 22px;
		color: var(--muted);
		line-height: 1.45;
	}
	.arrow {
		position: relative;
		align-self: center;
		height: 2px;
		margin: 0 4px;
	}
	.arrow i {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(255, 181, 71, 0.2), var(--sun));
		transform-origin: left;
		transform: scaleX(0);
	}
	.on .arrow i {
		animation: draw 700ms var(--ease) calc(200ms + var(--d, 0) * 110ms) forwards;
	}
	.arrow::after {
		content: '';
		position: absolute;
		right: -2px;
		top: -5px;
		border: 6px solid transparent;
		border-left-color: var(--sun);
		border-right: 0;
	}
	@keyframes draw {
		to { transform: scaleX(1); }
	}
	.s4 .row {
		display: grid;
		grid-template-columns: 1fr 760px;
		gap: 48px;
		margin-top: 32px;
	}
	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
	}
	.stats .card {
		min-height: 330px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.stats .card > span {
		display: block;
		font-size: 24px;
		color: var(--muted);
		margin-top: 14px;
		line-height: 1.4;
	}
	.s4 .frame {
		height: 330px;
	}

	/* 5 */
	.s5 .grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 40px;
		margin-top: 64px;
	}
	.res {
		display: flex;
		gap: 22px;
	}
	.res .card {
		flex: 1;
		padding: 34px 30px;
		min-height: 290px;
	}
	.res .big {
		font-size: 76px;
		margin-bottom: 14px;
	}
	.note {
		margin: 40px 0 0;
		font-size: 25px;
		color: var(--muted);
		line-height: 1.5;
		border-left: 3px solid var(--sun);
		padding-left: 18px;
	}
	.s5 h3 {
		font-size: 30px;
		margin: 0 0 6px;
	}
	.sub {
		margin-bottom: 18px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 28px;
		font-variant-numeric: tabular-nums;
	}
	td,
	th {
		padding: 18px 6px;
		border-bottom: 1px solid var(--line);
		text-align: right;
	}
	th {
		font-weight: 500;
		color: var(--dim);
		font-size: 18px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	td:first-child,
	th:first-child {
		text-align: left;
	}
	td.warn {
		color: var(--sun);
	}

	/* 6 */
	.s6 .left {
		width: 600px;
	}
	.s6 h2 {
		font-size: 58px;
	}
	.feat {
		margin-top: 36px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.feat .card {
		padding: 22px 26px;
	}
	.feat b {
		font-size: 27px;
		margin-bottom: 6px;
	}
	.feat span {
		font-size: 21px;
		color: var(--muted);
		line-height: 1.4;
	}
	.s6 .p1 {
		position: absolute;
		right: 96px;
		top: 96px;
		width: 1060px;
		height: 470px;
	}
	.s6 .p2 {
		position: absolute;
		right: 96px;
		top: 596px;
		width: 1060px;
		height: 384px;
	}
	.s6 .p2 .shot {
		object-position: 50% 32%;
	}

	/* 7 */
	.s7 .grid {
		display: grid;
		grid-template-columns: 1fr 1fr 420px;
		gap: 36px;
		margin-top: 80px;
	}
	.s7 h3 {
		font-size: 34px;
		margin: 0 0 18px;
	}
	.s7 ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 22px;
		font-size: 28px;
		line-height: 1.4;
		color: #c9d0db;
	}
	.s7 li b {
		color: var(--text);
		font-weight: 600;
	}
	.s7 li.mono {
		font-size: 22px;
	}
	.try {
		text-align: center;
	}
	.qr {
		background: #fff;
		padding: 26px;
		border-radius: 22px;
		width: 360px;
		height: 360px;
		margin: 0 auto;
	}
	.qr img {
		width: 100%;
		height: 100%;
		display: block;
	}
	.try .url {
		font-size: 26px;
		margin-top: 22px;
	}
	.try .small {
		margin-top: 8px;
	}
	.ai {
		position: absolute;
		left: 96px;
		right: 96px;
		bottom: 100px;
		font-size: 22px;
		color: var(--muted);
		line-height: 1.5;
		margin: 0;
	}

	/* ---------------- controls ---------------- */
	.ctl {
		transition: opacity 400ms var(--ease), transform 400ms var(--ease);
	}
	.idle .ctl {
		opacity: 0;
		pointer-events: none;
	}
	.idle {
		cursor: none;
	}
	.progress {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 3px;
		background: rgba(255, 255, 255, 0.06);
	}
	.progress i {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--sun), #ffd58a);
		transition: width 600ms var(--ease);
	}
	.back {
		position: absolute;
		left: 18px;
		top: 16px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px 8px 10px;
		border-radius: 999px;
		background: rgba(14, 18, 28, 0.8);
		border: 1px solid var(--line);
		color: var(--muted);
		font-size: 13px;
		text-decoration: none;
	}
	.back:hover {
		color: var(--text);
	}
	.bar {
		position: absolute;
		left: 50%;
		bottom: 18px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px;
		border-radius: 999px;
		background: rgba(14, 18, 28, 0.88);
		border: 1px solid rgba(255, 255, 255, 0.12);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(12px);
	}
	.idle .bar {
		transform: translate(-50%, 12px);
	}
	.bar button {
		display: inline-grid;
		place-items: center;
		min-width: 36px;
		height: 36px;
		padding: 0 8px;
		border-radius: 999px;
		color: var(--text);
		background: transparent;
		border: 0;
		cursor: pointer;
		font: 500 13px var(--font-ui);
	}
	.bar button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
	}
	.bar button:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.dots {
		display: flex;
		gap: 2px;
	}
	.bar .dotb {
		min-width: 0;
		width: 18px;
		height: 24px;
		padding: 0;
		position: relative;
	}
	.dotb::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 6px;
		height: 6px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.3);
		transform: translate(-50%, -50%);
		transition: width 300ms var(--ease), background 300ms;
	}
	.dotb.act::after {
		width: 16px;
		background: var(--sun);
	}
	.sep {
		width: 1px;
		height: 22px;
		background: var(--line);
		margin: 0 4px;
	}
	.seg {
		display: flex;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 999px;
		padding: 2px;
	}
	.seg button {
		height: 32px;
		color: var(--muted);
	}
	.seg button.act {
		background: rgba(255, 255, 255, 0.12);
		color: var(--text);
	}
	.exp {
		position: relative;
	}
	.bar .primary {
		display: inline-flex;
		gap: 6px;
		padding: 0 14px;
		background: var(--sun);
		color: #1a1206;
		font-weight: 600;
	}
	.bar .primary:hover {
		background: #ffc66e;
	}
	.menu {
		position: absolute;
		right: 0;
		bottom: 48px;
		min-width: 220px;
		padding: 8px;
		border-radius: 16px;
		background: rgba(14, 18, 28, 0.97);
		border: 1px solid rgba(255, 255, 255, 0.12);
		box-shadow: 0 16px 50px rgba(0, 0, 0, 0.6);
		animation: menuIn 220ms var(--ease) both;
	}
	@keyframes menuIn {
		from { opacity: 0; transform: translateY(8px) scale(0.98); }
	}
	.mh {
		padding: 8px 10px 4px;
		font: 500 11px var(--font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.menu a {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 9px 10px;
		border-radius: 10px;
		color: var(--text);
		text-decoration: none;
		font-size: 14px;
	}
	.menu a:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	.menu em {
		font-style: normal;
		font: 12px var(--font-mono);
		color: var(--dim);
	}
	.hint {
		position: absolute;
		right: 18px;
		bottom: 26px;
		font-size: 12px;
		color: var(--dim);
	}
	@media (max-width: 760px) {
		.hint {
			display: none;
		}
		.back {
			font-size: 0;
			padding: 8px;
		}
	}
</style>
