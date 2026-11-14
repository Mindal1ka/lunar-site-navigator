<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!--
	Site picker: chip for site A (and site B when comparing) + a searchable combobox.
	The highlighted chip is the active slot: picking from the list or clicking the map sets that site.
	Combobox pattern: input[role=combobox] + listbox with grouped options + aria-activedescendant.
	Typing a coordinate pair ("-86.8, 12.5") offers to analyse that exact point.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { app } from '#lib/state.svelte.ts';
	import { c } from '#lib/i18n.ts';
	import type { Site, SiteCategory } from '#lib/engine/data.ts';
	import Icon from './Icon.svelte';
	import { pop, reveal, swap } from './motion';
	import { CATEGORY_COLOR, CATEGORY_ORDER } from './categories';
	import { fmtLatLon, parseLatLon } from './coords';

	let { compact = false }: { compact?: boolean } = $props();

	const T = {
		en: {
			siteA: 'Site A',
			siteB: 'Site B',
			chooseB: 'Choose site B',
			change: 'Change site',
			search: 'Search sites or type coordinates',
			searchShort: 'Search sites',
			sites: 'Landing sites',
			mapHint: 'or click anywhere on the map',
			mapHintB: 'or click the map to place site B',
			none: 'No sites match',
			coordHint: 'Tip: type coordinates such as −86.8, 12.5',
			analyse: 'Analyse this point',
			analyseSub: 'Horizon from NASA LOLA, computed on the server',
			removeB: 'Remove site B',
			activeSlot: 'Map clicks set this site',
			loadingPoint: 'Computing horizon…',
			select: 'select',
			results: (n: number) => `${n} ${n === 1 ? 'site' : 'sites'}`
		},
		uk: {
			siteA: 'Місце A',
			siteB: 'Місце B',
			chooseB: 'Оберіть місце B',
			change: 'Змінити місце',
			search: 'Пошук місць або координати',
			searchShort: 'Пошук місць',
			sites: 'Місця посадки',
			mapHint: 'або клацніть будь-де на мапі',
			mapHintB: 'або клацніть на мапі, щоб поставити місце B',
			none: 'Немає місць за запитом',
			coordHint: 'Порада: введіть координати, наприклад −86.8, 12.5',
			analyse: 'Проаналізувати цю точку',
			analyseSub: 'Горизонт із NASA LOLA, обчислюється на сервері',
			removeB: 'Прибрати місце B',
			activeSlot: 'Клік на мапі змінює це місце',
			loadingPoint: 'Обчислюємо горизонт…',
			select: 'обрати',
			results: (n: number) => {
				const m10 = n % 10;
				const m100 = n % 100;
				const w = m10 === 1 && m100 !== 11 ? 'місце' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'місця' : 'місць';
				return `${n} ${w}`;
			}
		}
	};
	const t = $derived(T[app.lang]);
	const cm = $derived(c());

	const uid = `sp-${Math.random().toString(36).slice(2, 8)}`;

	let open = $state(false);
	let slot = $state<'A' | 'B'>('A');
	let query = $state('');
	let active = $state(0);
	let root = $state<HTMLDivElement>();
	let input = $state<HTMLInputElement>();
	let listEl = $state<HTMLDivElement>();
	let triggerA = $state<HTMLButtonElement>();
	let triggerB = $state<HTMLButtonElement>();
	const optionEls: (HTMLElement | undefined)[] = $state([]);
	let hl = $state({ y: 0, h: 0, shown: false });
	let pointerNav = $state(false);

	const norm = (s: string) =>
		s
			.normalize('NFD')
			.replace(/\p{M}/gu, '')
			.toLowerCase()
			.trim();

	const coord = $derived(parseLatLon(query));

	type Item = { kind: 'site'; site: Site } | { kind: 'point'; lat: number; lon: number };

	const groups = $derived.by(() => {
		const q = norm(query);
		const matches = (s: Site) =>
			!q ||
			norm(s.name.en).includes(q) ||
			norm(s.name.uk).includes(q) ||
			s.id.includes(q) ||
			norm(cm.categories[s.category]).includes(q);
		const out: { cat: SiteCategory; sites: Site[] }[] = [];
		for (const cat of CATEGORY_ORDER) {
			const sites = app.allSites.filter((s) => s.category === cat && (coord ? false : matches(s)));
			if (sites.length) out.push({ cat, sites });
		}
		return out;
	});

	const items = $derived<Item[]>([
		...(coord ? [{ kind: 'point', lat: coord.lat, lon: coord.lon } as Item] : []),
		...groups.flatMap((g) => g.sites.map((site) => ({ kind: 'site', site }) as Item))
	]);
	const siteCount = $derived(groups.reduce((n, g) => n + g.sites.length, 0));

	const indexOfSite = (id: string) => items.findIndex((it) => it.kind === 'site' && it.site.id === id);
	const optId = (i: number) => `${uid}-opt-${i}`;

	// ---- open / close

	export async function openFor(s: 'A' | 'B') {
		slot = s;
		app.pickSlot = s;
		query = '';
		open = true;
		const current = s === 'A' ? app.siteAId : app.siteBId;
		active = Math.max(0, current ? indexOfSite(current) : 0);
		hl.shown = false;
		await tick();
		input?.focus({ preventScroll: true });
		scrollActive('center');
	}

	function close(returnFocus = true) {
		if (!open) return;
		open = false;
		if (returnFocus) (slot === 'B' ? (triggerB ?? triggerA) : triggerA)?.focus({ preventScroll: true });
	}

	function toggle(s: 'A' | 'B') {
		if (open && slot === s) close();
		else openFor(s);
	}

	function choose(i: number) {
		const it = items[i];
		if (!it) return;
		if (it.kind === 'site') app.selectSite(it.site.id, slot);
		else app.addCustomPoint(it.lat, it.lon, slot);
		close();
	}

	function clearB(e?: Event) {
		e?.stopPropagation();
		app.siteBId = null;
		app.pickSlot = 'A';
		if (open && slot === 'B') close(false);
		triggerA?.focus({ preventScroll: true });
	}

	// ---- keyboard

	function onkeydown(e: KeyboardEvent) {
		const n = items.length;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			pointerNav = false;
			if (n) active = (active + 1) % n;
			scrollActive();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			pointerNav = false;
			if (n) active = (active - 1 + n) % n;
			scrollActive();
		} else if (e.key === 'Home' && !query) {
			e.preventDefault();
			active = 0;
			scrollActive();
		} else if (e.key === 'End' && !query) {
			e.preventDefault();
			active = Math.max(0, n - 1);
			scrollActive();
		} else if (e.key === 'PageDown' || e.key === 'PageUp') {
			e.preventDefault();
			active = Math.max(0, Math.min(n - 1, active + (e.key === 'PageDown' ? 6 : -6)));
			scrollActive();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			choose(active);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			if (query) query = '';
			else close();
		} else if (e.key === 'Tab') {
			close(false);
		}
	}

	async function scrollActive(block: ScrollLogicalPosition = 'nearest') {
		await tick();
		optionEls[active]?.scrollIntoView({ block, behavior: 'auto' });
	}

	// keep the active option valid while filtering
	$effect(() => {
		if (active >= items.length) active = Math.max(0, items.length - 1);
	});

	// sliding highlight follows the active option
	$effect(() => {
		const el = optionEls[active];
		void items.length;
		if (!open || !el) {
			hl.shown = false;
			return;
		}
		hl = { y: el.offsetTop, h: el.offsetHeight, shown: true };
	});

	// close on outside pointer
	$effect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (root && !root.contains(e.target as Node)) close(false);
		};
		window.addEventListener('pointerdown', onDown, true);
		return () => window.removeEventListener('pointerdown', onDown, true);
	});

	// "/" focuses the search from anywhere
	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
			const el = document.activeElement as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
			e.preventDefault();
			openFor(app.pickSlot);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// ---- highlight helper: split a name around the query
	function parts(name: string): { s: string; hit: boolean }[] {
		const q = norm(query);
		if (!q || coord) return [{ s: name, hit: false }];
		const i = norm(name).indexOf(q);
		if (i < 0) return [{ s: name, hit: false }];
		return [
			{ s: name.slice(0, i), hit: false },
			{ s: name.slice(i, i + q.length), hit: true },
			{ s: name.slice(i + q.length), hit: false }
		];
	}

	const showB = $derived(!!app.siteB || app.pickSlot === 'B');
	// shorter coordinates while two chips share the bar
	const chipDigits = $derived(showB ? 1 : 2);
	const coordsA = $derived(app.siteA ? fmtLatLon(app.siteA.lat, app.siteA.lon, app.lang, chipDigits) : '');
	const coordsB = $derived(app.siteB ? fmtLatLon(app.siteB.lat, app.siteB.lon, app.lang, chipDigits) : '');

	// flat index of each site in `items` (for ids and refs inside the grouped markup)
	const offset = $derived(coord ? 1 : 0);
	const groupStart = $derived.by(() => {
		const starts: number[] = [];
		let k = offset;
		for (const g of groups) {
			starts.push(k);
			k += g.sites.length;
		}
		return starts;
	});
</script>

<div class="picker" class:compact class:open bind:this={root}>
	<div class="chips">
		<!-- site A -->
		<div class="chip-wrap" class:active={app.pickSlot === 'A' && showB}>
			<button
				bind:this={triggerA}
				type="button"
				class="chip a"
				class:active={app.pickSlot === 'A' && showB}
				aria-haspopup="listbox"
				aria-expanded={open && slot === 'A'}
				aria-controls="{uid}-list"
				aria-label="{t.siteA}: {app.siteA?.name[app.lang] ?? ''}, {coordsA}. {t.change}"
				onclick={() => toggle('A')}
			>
				<span class="slot a" aria-hidden="true">A</span>
				<span class="body">
					{#key app.siteA?.id}
						<span class="name" in:swap>{app.siteA?.name[app.lang] ?? '—'}</span>
					{/key}
					{#if !compact}
						<span class="coords mono">{coordsA}</span>
					{/if}
				</span>
				{#if app.pointBusy && app.pickSlot === 'A'}
					<span class="spin" aria-label={t.loadingPoint}></span>
				{:else}
					<span class="chev" class:up={open && slot === 'A'}><Icon name="chevron" size={15} /></span>
				{/if}
			</button>
		</div>

		<!-- site B -->
		{#if showB}
			<div class="chip-wrap b" class:active={app.pickSlot === 'B'} transition:reveal>
				<button
					bind:this={triggerB}
					type="button"
					class="chip b"
					class:empty={!app.siteB}
					class:active={app.pickSlot === 'B'}
					aria-haspopup="listbox"
					aria-expanded={open && slot === 'B'}
					aria-controls="{uid}-list"
					aria-label={app.siteB ? `${t.siteB}: ${app.siteB.name[app.lang]}, ${coordsB}. ${t.change}` : t.chooseB}
					onclick={() => toggle('B')}
				>
					<span class="slot b" aria-hidden="true">B</span>
					<span class="body">
						{#key app.siteB?.id ?? 'none'}
							<span class="name" class:placeholder={!app.siteB} in:swap>
								{app.siteB ? app.siteB.name[app.lang] : t.chooseB}
							</span>
						{/key}
						{#if !compact}
							<span class="coords mono">{app.siteB ? coordsB : t.mapHintB}</span>
						{/if}
					</span>
					{#if app.pointBusy && app.pickSlot === 'B'}
						<span class="spin" aria-label={t.loadingPoint}></span>
					{/if}
				</button>
				<button type="button" class="x" aria-label={t.removeB} title={t.removeB} onclick={clearB}>
					<Icon name="close" size={13} />
				</button>
			</div>
		{/if}
	</div>

	{#if open}
		<div class="pop" class:b={slot === 'B'} transition:pop>
			<div class="search">
				<span class="lens"><Icon name="search" size={17} /></span>
				<input
					bind:this={input}
					bind:value={query}
					type="text"
					role="combobox"
					aria-expanded="true"
					aria-controls="{uid}-list"
					aria-autocomplete="list"
					aria-activedescendant={items.length ? optId(active) : undefined}
					aria-label="{slot === 'A' ? t.siteA : t.siteB}: {t.search}"
					placeholder={compact ? t.searchShort : t.search}
					autocomplete="off"
					spellcheck="false"
					oninput={() => {
						active = 0;
						listEl?.scrollTo({ top: 0 });
					}}
					{onkeydown}
				/>
				<span class="for slot {slot === 'A' ? 'a' : 'b'}" aria-hidden="true">{slot}</span>
			</div>

			<div
				class="list"
				id="{uid}-list"
				role="listbox"
				aria-label={t.sites}
				tabindex="-1"
				bind:this={listEl}
				onpointermove={() => (pointerNav = true)}
			>
				<span
					class="hl"
					class:shown={hl.shown}
					class:instant={pointerNav}
					style:transform="translateY({hl.y}px)"
					style:height="{hl.h}px"
					aria-hidden="true"
				></span>

				{#if coord}
					<div
						bind:this={optionEls[0]}
						id={optId(0)}
						class="opt point"
						role="option"
						aria-selected={active === 0}
						tabindex="-1"
						onpointerenter={() => (active = 0)}
						onclick={() => choose(0)}
						onkeydown={() => {}}
					>
						<span class="pin"><Icon name="pin" size={16} /></span>
						<span class="main">
							<span class="nm">{t.analyse}</span>
							<span class="sub mono">{fmtLatLon(coord.lat, coord.lon, app.lang)}</span>
						</span>
						<span class="note">{t.analyseSub}</span>
					</div>
				{/if}

				{#each groups as g, gi (g.cat)}
					<div class="group" role="group" aria-labelledby="{uid}-g-{g.cat}">
						<div class="ghead" id="{uid}-g-{g.cat}">
							<span class="gdot" style:--dot={CATEGORY_COLOR[g.cat]}></span>
							{cm.categories[g.cat]}
							<span class="gcount mono">{g.sites.length}</span>
						</div>
						{#each g.sites as s, si (s.id)}
							{@const i = groupStart[gi] + si}
							{@const isA = s.id === app.siteAId}
							{@const isB = s.id === app.siteBId}
							<div
								bind:this={optionEls[i]}
								id={optId(i)}
								class="opt"
								class:current={(slot === 'A' && isA) || (slot === 'B' && isB)}
								role="option"
								aria-selected={active === i}
								tabindex="-1"
								style:--dot={CATEGORY_COLOR[s.category]}
								style:--i={Math.min(i, 14)}
								onpointerenter={() => (active = i)}
								onclick={() => choose(i)}
								onkeydown={() => {}}
							>
								<span class="dot" aria-hidden="true"></span>
								<span class="main">
									<span class="nm"
										>{#each parts(s.name[app.lang]) as p, pi (pi)}{#if p.hit}<mark>{p.s}</mark>{:else}{p.s}{/if}{/each}</span
									>
									<span class="sub mono">{fmtLatLon(s.lat, s.lon, app.lang, 2)}</span>
								</span>
								{#if isA || isB}
									<span class="tags" aria-hidden="true">
										{#if isA}<span class="slot a sm">A</span>{/if}
										{#if isB}<span class="slot b sm">B</span>{/if}
									</span>
								{/if}
								{#if isA}<span class="sr-only">({t.siteA})</span>{/if}
								{#if isB}<span class="sr-only">({t.siteB})</span>{/if}
							</div>
						{/each}
					</div>
				{/each}

				{#if !items.length}
					<div class="empty">
						<p>{t.none} “{query}”</p>
						<p class="hint">{t.coordHint}</p>
					</div>
				{/if}
			</div>

			<div class="foot">
				<span class="maphint"><Icon name="cursor" size={14} />{slot === 'B' ? t.mapHintB : t.mapHint}</span>
				{#if !compact}
					<span class="keys" aria-hidden="true">
						<span><kbd>↑</kbd><kbd>↓</kbd></span>
						<span><kbd>↵</kbd> {t.select}</span>
						<span><kbd>esc</kbd></span>
					</span>
				{:else}
					<span class="count mono" aria-live="polite">{t.results(siteCount)}</span>
				{/if}
			</div>
			<span class="sr-only" aria-live="polite">{t.results(siteCount)}</span>
		</div>
	{/if}
</div>

<style>
	.picker {
		position: relative;
		min-width: 0;
	}
	.chips {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.chip-wrap {
		position: relative;
		display: flex;
		align-items: center;
		min-width: 150px;
		border-radius: 12px;
		flex: 0 1 auto;
	}
	.chip {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		height: 44px;
		min-width: 0;
		max-width: 270px;
		padding: 0 10px 0 6px;
		border-radius: 12px;
		text-align: left;
		background: rgba(255, 255, 255, 0.04);
		box-shadow: inset 0 0 0 1px var(--hairline);
		transition:
			background var(--dur) var(--ease-out),
			box-shadow var(--dur) var(--ease-out),
			transform var(--dur-fast) var(--ease-out);
	}
	.chip:hover {
		background: rgba(255, 255, 255, 0.07);
	}
	.chip:active {
		transform: scale(0.98);
	}
	.chip[aria-expanded='true'] {
		background: rgba(255, 255, 255, 0.09);
		box-shadow: inset 0 0 0 1px var(--glass-border-strong);
	}
	.chip.active.a {
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.35),
			0 0 0 3px rgba(255, 255, 255, 0.06);
	}
	.chip.active.b {
		box-shadow:
			inset 0 0 0 1px rgba(196, 155, 255, 0.55),
			0 0 0 3px rgba(196, 155, 255, 0.1);
	}
	.chip.b {
		padding-right: 34px;
	}
	.chip.b.empty {
		background: rgba(196, 155, 255, 0.05);
		box-shadow: inset 0 0 0 1px rgba(196, 155, 255, 0.35);
		border: 0;
		background-image: linear-gradient(90deg, rgba(196, 155, 255, 0.0), rgba(196, 155, 255, 0.12), rgba(196, 155, 255, 0));
		background-size: 200% 100%;
		animation: shimmer 2.6s var(--ease-in-out) infinite;
	}
	@keyframes shimmer {
		from {
			background-position: 150% 0;
		}
		to {
			background-position: -50% 0;
		}
	}

	.slot {
		display: grid;
		place-items: center;
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		font-family: var(--font-display);
		font-weight: 650;
		font-size: 14px;
	}
	.slot.a {
		color: #0b0f18;
		background: var(--site-a);
		box-shadow: 0 0 14px rgba(255, 255, 255, 0.25);
	}
	.slot.b {
		color: #170b2a;
		background: var(--site-b);
		box-shadow: 0 0 14px rgba(196, 155, 255, 0.35);
	}
	.slot.sm {
		width: 20px;
		height: 20px;
		border-radius: 6px;
		font-size: 11px;
		box-shadow: none;
	}
	.body {
		display: grid;
		min-width: 0;
		line-height: 1.2;
	}
	.body > * {
		grid-area: 1 / 1;
	}
	.body .coords {
		grid-area: 2 / 1;
	}
	.name {
		font-weight: 600;
		font-size: 14px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name.placeholder {
		color: var(--site-b);
	}
	.coords {
		font-size: 10.5px;
		color: var(--text-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 2px;
	}
	.chev {
		display: grid;
		color: var(--text-3);
		margin-left: auto;
		transition: transform var(--dur) var(--ease-spring);
	}
	.chev.up {
		transform: rotate(180deg);
	}
	.x {
		position: absolute;
		right: 6px;
		top: 50%;
		translate: 0 -50%;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 7px;
		color: var(--text-3);
		transition:
			background var(--dur-fast),
			color var(--dur-fast),
			transform var(--dur-fast) var(--ease-out);
	}
	.x:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text);
		transform: rotate(90deg);
	}
	.spin {
		width: 16px;
		height: 16px;
		margin-left: auto;
		flex: none;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.15);
		border-top-color: var(--earth);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ---- popover */
	.pop {
		position: absolute;
		top: calc(100% + 14px);
		left: -6px;
		width: 420px;
		max-height: min(560px, calc(100dvh - var(--topbar-h) - var(--gutter) * 4));
		display: flex;
		flex-direction: column;
		z-index: 40;
		background: var(--glass-strong);
		backdrop-filter: blur(24px) saturate(150%);
		-webkit-backdrop-filter: blur(24px) saturate(150%);
		border: 1px solid var(--glass-border);
		border-radius: 16px;
		box-shadow:
			0 24px 60px rgba(0, 0, 0, 0.55),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		overflow: hidden;
	}
	.search {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px 0 14px;
		height: 54px;
		border-bottom: 1px solid var(--hairline);
		flex: none;
	}
	.lens {
		color: var(--text-3);
		display: grid;
	}
	input {
		flex: 1;
		min-width: 0;
		height: 100%;
		background: none;
		border: 0;
		outline: none;
		color: var(--text);
		font: inherit;
		font-size: 15px;
	}
	input::placeholder {
		color: var(--text-3);
	}
	.for {
		width: 24px;
		height: 24px;
		border-radius: 7px;
		font-size: 12px;
	}

	.list {
		position: relative;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 6px;
		flex: 1 1 auto;
		min-height: 0;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
		outline: none;
	}
	.hl {
		position: absolute;
		left: 6px;
		right: 6px;
		top: 0;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.07);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
		pointer-events: none;
		opacity: 0;
		transition:
			transform 220ms var(--ease-out),
			height 220ms var(--ease-out),
			opacity var(--dur-fast);
	}
	.hl.instant {
		transition-duration: 120ms;
	}
	.hl.shown {
		opacity: 1;
	}
	.group + .group {
		margin-top: 6px;
	}
	.ghead {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 10px 6px;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.gdot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--dot);
	}
	.gcount {
		margin-left: auto;
		letter-spacing: 0;
		opacity: 0.7;
	}
	.opt {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 10px;
		border-radius: 10px;
		cursor: pointer;
		animation: rise 360ms var(--ease-out) both;
		animation-delay: calc(var(--i, 0) * 14ms);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	.dot {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--dot);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--dot) 18%, transparent);
		transition: box-shadow var(--dur) var(--ease-out), transform var(--dur) var(--ease-spring);
	}
	.opt[aria-selected='true'] .dot {
		transform: scale(1.15);
		box-shadow:
			0 0 0 4px color-mix(in srgb, var(--dot) 22%, transparent),
			0 0 12px var(--dot);
	}
	.main {
		display: grid;
		min-width: 0;
		gap: 1px;
	}
	.nm {
		font-size: 14px;
		font-weight: 520;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.opt.current .nm {
		font-weight: 650;
	}
	mark {
		background: none;
		color: var(--earth-soft);
		text-decoration: underline;
		text-decoration-color: rgba(92, 200, 255, 0.5);
		text-underline-offset: 3px;
	}
	.sub {
		font-size: 11px;
		color: var(--text-3);
	}
	.tags {
		margin-left: auto;
		display: flex;
		gap: 4px;
	}
	.opt.point {
		margin-bottom: 4px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.pin {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		color: var(--earth);
		background: var(--earth-dim);
		flex: none;
	}
	.note {
		flex-basis: 100%;
		padding-left: 42px;
		font-size: 11.5px;
		color: var(--text-3);
		margin-top: -4px;
	}
	.empty {
		padding: 26px 16px;
		text-align: center;
		color: var(--text-2);
	}
	.empty p {
		margin: 0;
	}
	.empty .hint {
		margin-top: 6px;
		font-size: 12.5px;
		color: var(--text-3);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		border-top: 1px solid var(--hairline);
		font-size: 12px;
		color: var(--text-3);
		flex: none;
	}
	.maphint {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 7px;
		color: var(--text-2);
	}
	.maphint :global(svg) {
		color: var(--earth);
	}
	.keys {
		display: flex;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
	}
	kbd {
		font-family: var(--font-mono);
		font-size: 10.5px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		display: inline-grid;
		place-items: center;
		border-radius: 5px;
		color: var(--text-2);
		background: rgba(255, 255, 255, 0.06);
		box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.08);
	}
	kbd + kbd {
		margin-left: 2px;
	}
	.keys {
		gap: 10px;
	}

	/* ---- compact (phones) */
	.compact .chip {
		height: 40px;
		max-width: none;
		gap: 8px;
		padding: 0 8px 0 5px;
	}
	.compact .chip-wrap {
		flex: 1 1 0;
		min-width: 0;
	}
	/* two chips on a phone: drop the chevron, the chip itself is the affordance */
	.compact .chips:has(.chip-wrap.b) .chev {
		display: none;
	}
	.compact .chip-wrap .chip {
		width: 100%;
	}
	.compact .chip.b {
		padding-right: 30px;
	}
	.compact .slot:not(.sm) {
		width: 26px;
		height: 26px;
		font-size: 13px;
		border-radius: 8px;
	}
	.compact .name {
		font-size: 13.5px;
	}
	.compact .pop {
		position: fixed;
		top: calc(var(--topbar-h) + var(--gutter) * 2);
		left: var(--gutter);
		right: var(--gutter);
		width: auto;
		max-height: calc(100dvh - var(--topbar-h) - var(--gutter) * 3 - env(safe-area-inset-bottom));
	}
	@media (min-width: 768px) {
		.compact .pop {
			right: auto;
			width: 440px;
		}
	}
	.compact .opt {
		padding: 11px 10px;
	}
	.compact input {
		font-size: 16px; /* avoids iOS zoom on focus */
	}
	@media (max-width: 1279px) {
		.picker:not(.compact) .chip {
			max-width: 220px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chip.b.empty,
		.spin {
			animation: none;
		}
		.opt {
			animation: none;
		}
	}
</style>
