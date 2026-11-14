<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!--
	Top bar: brand, site picker (A / B), compare, view (map / panorama), mode, language, share.
	Below 1024 px wide it collapses to the site picker + a menu (bottom sheet on phones).
	The glass background is a separate layer, so popovers keep their own backdrop blur.
-->
<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { app, type Mode, type View } from '#lib/state.svelte.ts';
	import { c } from '#lib/i18n.ts';
	import type { Lang } from '#lib/engine/data.ts';
	import { shareUrl } from '#lib/url.svelte.ts';
	import Logo from '#lib/topbar/Logo.svelte';
	import Icon from '#lib/topbar/Icon.svelte';
	import Segmented from '#lib/topbar/Segmented.svelte';
	import SitePicker from '#lib/topbar/SitePicker.svelte';
	import MenuSheet from '#lib/topbar/MenuSheet.svelte';
	import Toast from '#lib/topbar/Toast.svelte';
	import { toast } from '#lib/topbar/toast.svelte.ts';

	const T = {
		en: {
			brand: 'Lunar Landing Site Navigator',
			brandSub: 'South pole · NASA LOLA terrain · JPL ephemerides',
			compare: 'Compare',
			compareTip: 'Add a second site (B) to compare side by side',
			stopCompare: 'Stop comparing',
			view: 'View',
			map: 'Map',
			panorama: 'Panorama',
			mapTip: '3D terrain of the south pole from NASA LOLA',
			panoTip: 'Full 360° horizon seen from the site',
			mode: 'Mode',
			simpleTip: 'For everyone: 3D view and three big numbers',
			teacherTip: 'The same, plus short explanations of why',
			plannerTip: 'Charts over time, date window, battery sizing, best windows, CSV export',
			language: 'Language',
			share: 'Share',
			shareTip: 'Copy a link to exactly this view',
			copied: 'Link copied',
			copyFailed: 'Could not copy the link',
			menu: 'Menu',
			openMenu: 'Open menu',
			closeMenu: 'Close menu',
			sites: 'Sites',
			pointFailed: 'Point not available'
		},
		uk: {
			brand: 'Навігатор місць посадки на Місяці',
			brandSub: 'Південний полюс · рельєф NASA LOLA · ефемериди JPL',
			compare: 'Порівняти',
			compareTip: 'Додайте друге місце (B), щоб порівняти поруч',
			stopCompare: 'Без порівняння',
			view: 'Вигляд',
			map: 'Мапа',
			panorama: 'Панорама',
			mapTip: '3D-рельєф південного полюса з NASA LOLA',
			panoTip: 'Повний горизонт 360° з місця посадки',
			mode: 'Режим',
			simpleTip: 'Для всіх: 3D і три великі числа',
			teacherTip: 'Те саме плюс короткі пояснення «чому»',
			plannerTip: 'Графіки в часі, вікно дат, розрахунок батареї, найкращі вікна, експорт CSV',
			language: 'Мова',
			share: 'Поділитися',
			shareTip: 'Скопіювати посилання саме на цей вигляд',
			copied: 'Посилання скопійовано',
			copyFailed: 'Не вдалося скопіювати посилання',
			menu: 'Меню',
			openMenu: 'Відкрити меню',
			closeMenu: 'Закрити меню',
			sites: 'Місця',
			pointFailed: 'Точка недоступна'
		}
	};
	const t = $derived(T[app.lang]);
	const cm = $derived(c());

	// ---- layout tiers (the markup differs, so this is JS, not only CSS)
	let w = $state(typeof window !== 'undefined' ? window.innerWidth : 1440);
	const compact = $derived(w < 1024);
	const phone = $derived(w < 768);
	const comparing = $derived(!!app.siteB || app.pickSlot === 'B');
	const wide = $derived(w >= 1440 && !comparing);
	const roomy = $derived(w >= 1280);

	let picker = $state<ReturnType<typeof SitePicker>>();
	let menuOpen = $state(false);
	let shared = $state(false);
	let mounted = $state(false);

	const viewOptions = $derived<{ value: View; label: string; icon: 'map' | 'panorama'; tip: string }[]>([
		{ value: 'map', label: t.map, icon: 'map', tip: t.mapTip },
		{ value: 'panorama', label: t.panorama, icon: 'panorama', tip: t.panoTip }
	]);
	const modeOptions = $derived<{ value: Mode; label: string; icon?: 'simple' | 'teacher' | 'planner'; tip: string }[]>([
		{ value: 'simple', label: cm.modes.simple, icon: 'simple', tip: t.simpleTip },
		{ value: 'teacher', label: cm.modes.teacher, icon: 'teacher', tip: t.teacherTip },
		{ value: 'planner', label: cm.modes.planner, icon: 'planner', tip: t.plannerTip }
	]);
	const modeOptionsNoIcon = $derived(modeOptions.map(({ icon: _icon, ...o }) => o));
	const langOptions: { value: Lang; label: string; tip: string }[] = [
		{ value: 'en', label: 'EN', tip: 'English' },
		{ value: 'uk', label: 'UK', tip: 'Українська' }
	];

	onMount(() => {
		w = window.innerWidth;
		requestAnimationFrame(() => (mounted = true));
	});

	// document language follows the UI (screen readers, hyphenation)
	$effect(() => {
		document.documentElement.lang = app.lang;
	});

	// errors from custom points (server) surface as a toast
	$effect(() => {
		const err = app.pointError;
		// untrack: switching language must not re-show an old error
		if (err) untrack(() => toast.show(`${t.pointFailed}: ${err}`, 'error', 4200));
	});

	// the menu is for narrow screens only
	$effect(() => {
		if (!compact) menuOpen = false;
	});

	async function toggleCompare() {
		if (comparing) {
			app.siteBId = null;
			app.pickSlot = 'A';
		} else {
			menuOpen = false;
			await tick();
			picker?.openFor('B');
		}
	}

	async function copy(text: string): Promise<boolean> {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// fallback for non-secure contexts
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.setAttribute('readonly', '');
			ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
			document.body.appendChild(ta);
			ta.select();
			let ok = false;
			try {
				ok = document.execCommand('copy');
			} catch {
				ok = false;
			}
			ta.remove();
			return ok;
		}
	}

	async function share() {
		const url = shareUrl();
		if (phone && typeof navigator.share === 'function') {
			try {
				await navigator.share({ title: t.brand, url });
				menuOpen = false;
				return;
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') return;
			}
		}
		const ok = await copy(url);
		if (ok) {
			shared = true;
			toast.show(t.copied);
			setTimeout(() => (shared = false), 1800);
			menuOpen = false;
		} else toast.show(t.copyFailed, 'error');
	}
</script>

<svelte:window bind:innerWidth={w} />

{#snippet compareBtn(full: boolean)}
	<button
		type="button"
		class="btn compare"
		class:on={comparing}
		class:full
		aria-pressed={comparing}
		aria-label={comparing ? t.stopCompare : t.compare}
		data-tip={full ? undefined : comparing ? (roomy ? undefined : t.stopCompare) : t.compareTip}
		onclick={toggleCompare}
	>
		<span class="plus"><Icon name="plus" size={16} /></span>
		{#if full || roomy}<span class="lbl">{comparing ? t.stopCompare : t.compare}</span>{/if}
	</button>
{/snippet}

{#snippet shareBtn(full: boolean)}
	<button
		type="button"
		class="btn share"
		class:done={shared}
		class:full
		aria-label={t.shareTip}
		data-tip={full ? undefined : t.shareTip}
		onclick={share}
	>
		<span class="swap">
			<span class="i link"><Icon name="link" size={17} /></span>
			<span class="i ok"><Icon name="check" size={17} /></span>
		</span>
		{#if full}<span class="lbl">{t.share}</span>{/if}
	</button>
{/snippet}

<div class="root" class:mounted class:compact class:phone>
	<div class="bar">
		<div class="bg glass" aria-hidden="true"></div>

		<div class="brand" class:hide={phone && comparing} title={t.brand}>
			<Logo size={phone ? 30 : 34} />
			{#if wide}
				<span class="name">
					<span class="n1">{t.brand}</span>
					<span class="n2">{t.brandSub}</span>
				</span>
			{:else}
				<span class="sr-only">{t.brand}</span>
			{/if}
		</div>

		<span class="sep" aria-hidden="true"></span>

		<div class="pick">
			<SitePicker bind:this={picker} compact={phone} />
		</div>

		{#if !compact}
			<div class="cluster">
				{@render compareBtn(false)}
			</div>
			<div class="spacer"></div>
			<div class="cluster">
				<Segmented label={t.view} options={viewOptions} value={app.view} onchange={(v) => (app.view = v)} iconOnly={!wide} />
				<Segmented
					label={t.mode}
					options={roomy ? modeOptions : modeOptionsNoIcon}
					value={app.mode}
					onchange={(v) => (app.mode = v)}
				/>
				<Segmented label={t.language} options={langOptions} value={app.lang} onchange={(v) => (app.lang = v)} size="sm" />
				{@render shareBtn(false)}
			</div>
		{:else}
			<div class="spacer"></div>
			{#if !phone}
				{@render compareBtn(false)}
			{/if}
			<button
				type="button"
				class="btn menu"
				class:on={menuOpen}
				aria-label={menuOpen ? t.closeMenu : t.openMenu}
				aria-expanded={menuOpen}
				aria-haspopup="dialog"
				onclick={() => (menuOpen = !menuOpen)}
			>
				<span class="burger" class:x={menuOpen} aria-hidden="true"><i></i><i></i><i></i></span>
			</button>
		{/if}
	</div>

	{#if compact}
		<MenuSheet open={menuOpen} onclose={() => (menuOpen = false)} label={t.menu} {phone}>
			<div class="sheet">
				<header class="sh-head">
					<Logo size={38} />
					<div>
						<div class="n1">{t.brand}</div>
						<div class="n2">{t.brandSub}</div>
					</div>
				</header>

				<section>
					<h3 class="label">{t.sites}</h3>
					{@render compareBtn(true)}
				</section>
				<section>
					<h3 class="label">{t.view}</h3>
					<Segmented label={t.view} options={viewOptions} value={app.view} onchange={(v) => (app.view = v)} stretch stack tipBelow={false} />
				</section>
				<section>
					<h3 class="label">{t.mode}</h3>
					<Segmented label={t.mode} options={modeOptions} value={app.mode} onchange={(v) => (app.mode = v)} stretch stack tipBelow={false} />
					{#key app.mode}
						<p class="hint">
							{app.mode === 'simple' ? t.simpleTip : app.mode === 'teacher' ? t.teacherTip : t.plannerTip}
						</p>
					{/key}
				</section>
				<section class="row">
					<div>
						<h3 class="label">{t.language}</h3>
						<Segmented label={t.language} options={langOptions} value={app.lang} onchange={(v) => (app.lang = v)} />
					</div>
					{@render shareBtn(true)}
				</section>
			</div>
		</MenuSheet>
	{/if}

	<Toast />
</div>

<style>
	.root {
		position: relative;
	}
	.bar {
		position: relative;
		isolation: isolate;
		display: flex;
		align-items: center;
		gap: 10px;
		height: var(--topbar-h);
		padding: 0 8px 0 10px;
	}
	/* glass lives on its own layer: children can use their own backdrop blur and position: fixed */
	.bg {
		position: absolute;
		inset: 0;
		border-radius: 18px;
		z-index: -1;
		pointer-events: none;
	}

	/* entrance: the bar settles in, then its parts follow in sequence */
	.bar > :not(.bg) {
		opacity: 0;
		transform: translateY(-6px);
		transition:
			opacity 520ms var(--ease-out),
			transform 620ms var(--ease-out);
	}
	.bg {
		opacity: 0;
		transform: translateY(-10px) scale(0.985);
		transition:
			opacity 520ms var(--ease-out),
			transform 720ms var(--ease-out);
	}
	.mounted .bar > *,
	.mounted .bg {
		opacity: 1;
		transform: none;
	}
	.mounted .bar > :nth-child(2) {
		transition-delay: 60ms;
	}
	.mounted .bar > :nth-child(4) {
		transition-delay: 120ms;
	}
	.mounted .bar > :nth-child(5) {
		transition-delay: 180ms;
	}
	.mounted .bar > :nth-child(7) {
		transition-delay: 240ms;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 11px;
		color: inherit;
		text-decoration: none;
		border-radius: 12px;
		flex: none;
	}
	.name {
		display: grid;
		line-height: 1.15;
	}
	.n1 {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 15px;
		letter-spacing: -0.01em;
		white-space: nowrap;
	}
	.n2 {
		font-size: 10.5px;
		color: var(--text-3);
		white-space: nowrap;
		letter-spacing: 0.01em;
	}
	.sep {
		width: 1px;
		height: 26px;
		background: var(--hairline);
		flex: none;
	}
	.pick {
		min-width: 0;
		flex: 0 1 auto;
	}
	.cluster {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: none;
	}
	.spacer {
		flex: 1 1 0;
		min-width: 0;
	}

	/* ---- buttons */
	.btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 38px;
		min-width: 38px;
		padding: 0 11px;
		border-radius: var(--radius-pill);
		font-size: 13px;
		font-weight: 520;
		white-space: nowrap;
		color: var(--text-2);
		background: rgba(255, 255, 255, 0.035);
		box-shadow: inset 0 0 0 1px var(--hairline);
		transition:
			background var(--dur) var(--ease-out),
			color var(--dur) var(--ease-out),
			box-shadow var(--dur) var(--ease-out),
			transform var(--dur-fast) var(--ease-out);
	}
	.btn:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.08);
	}
	.btn:active {
		transform: scale(0.94);
	}
	.btn:focus-visible {
		border-radius: var(--radius-pill);
	}
	.btn.full {
		width: 100%;
		height: 48px;
		font-size: 14px;
		justify-content: flex-start;
		padding: 0 16px;
		border-radius: 14px;
	}

	.compare .plus {
		display: grid;
		transition: transform 480ms var(--ease-spring);
	}
	.compare.on {
		color: var(--site-b);
		background: rgba(196, 155, 255, 0.1);
		box-shadow: inset 0 0 0 1px rgba(196, 155, 255, 0.35);
	}
	.compare.on .plus {
		transform: rotate(135deg);
	}

	.share .swap {
		position: relative;
		display: grid;
		width: 17px;
		height: 17px;
	}
	.share .i {
		position: absolute;
		inset: 0;
		display: grid;
		transition:
			transform 420ms var(--ease-spring),
			opacity var(--dur-fast);
	}
	.share .ok {
		opacity: 0;
		transform: scale(0.3) rotate(-30deg);
		color: var(--both);
	}
	.share.done .link {
		opacity: 0;
		transform: scale(0.3) rotate(30deg);
	}
	.share.done .ok {
		opacity: 1;
		transform: none;
	}
	.share.done {
		box-shadow:
			inset 0 0 0 1px rgba(155, 231, 168, 0.4),
			0 0 0 6px rgba(155, 231, 168, 0);
		animation: ping 700ms var(--ease-out);
	}
	@keyframes ping {
		from {
			box-shadow:
				inset 0 0 0 1px rgba(155, 231, 168, 0.6),
				0 0 0 0 rgba(155, 231, 168, 0.45);
		}
	}

	.menu {
		width: 42px;
		padding: 0;
	}
	.menu.on {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text);
	}
	.burger {
		position: relative;
		width: 18px;
		height: 14px;
	}
	.burger i {
		position: absolute;
		left: 0;
		height: 1.8px;
		border-radius: 2px;
		background: currentColor;
		transition:
			transform 420ms var(--ease-spring),
			opacity var(--dur-fast),
			width var(--dur) var(--ease-out);
	}
	.burger i:nth-child(1) {
		top: 0;
		width: 18px;
	}
	.burger i:nth-child(2) {
		top: 6px;
		width: 18px;
	}
	.burger i:nth-child(3) {
		top: 12px;
		width: 11px;
	}
	.burger.x i:nth-child(1) {
		transform: translateY(6px) rotate(45deg);
	}
	.burger.x i:nth-child(2) {
		opacity: 0;
		transform: scaleX(0.2);
	}
	.burger.x i:nth-child(3) {
		width: 18px;
		transform: translateY(-6px) rotate(-45deg);
	}

	/* tooltips for icon buttons */
	.btn[data-tip]::after {
		content: attr(data-tip);
		position: absolute;
		top: calc(100% + 12px);
		right: 0;
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
		transform: translateY(-4px);
		transition:
			opacity var(--dur-fast) var(--ease-out),
			transform var(--dur) var(--ease-out);
		z-index: 30;
	}
	.compare[data-tip]::after {
		right: auto;
		left: 0;
	}
	.btn[data-tip]:hover::after,
	.btn[data-tip]:focus-visible::after {
		opacity: 1;
		transform: none;
		transition-delay: 380ms;
	}
	@media (hover: none) {
		.btn[data-tip]::after {
			display: none;
		}
	}

	/* ---- menu sheet content */
	.sheet {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 20px;
	}
	.sh-head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-bottom: 4px;
	}
	.sh-head .n1 {
		white-space: normal;
	}
	.sh-head .n2 {
		white-space: normal;
		margin-top: 2px;
	}
	.sheet section {
		display: grid;
		gap: 9px;
		min-width: 0;
	}
	.sh-head > div {
		min-width: 0;
	}
	.sheet h3 {
		margin: 0;
		font-weight: 500;
	}
	.sheet .row {
		grid-template-columns: auto 1fr;
		align-items: end;
		gap: 14px;
	}
	.sheet .row > div {
		display: grid;
		gap: 9px;
	}
	.sheet .row .btn.full {
		justify-content: center;
	}
	.hint {
		margin: 0;
		font-size: 12.5px;
		color: var(--text-3);
		animation: hint-in 360ms var(--ease-out);
	}
	@keyframes hint-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	/* ---- narrow */
	.compact .bar {
		gap: 8px;
	}
	.phone .bar {
		padding: 0 6px 0 7px;
		gap: 7px;
	}
	.phone .bg {
		border-radius: 16px;
	}
	.phone .pick {
		flex: 1 1 auto;
	}
	.phone .sep,
	.brand.hide {
		display: none;
	}
	.compact .pick {
		flex: 1 1 auto;
	}

	@media (prefers-reduced-motion: reduce) {
		.bar > :not(.bg),
		.bg {
			transform: none;
		}
		.share.done {
			animation: none;
		}
	}
</style>
