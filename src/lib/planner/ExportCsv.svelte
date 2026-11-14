<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- CSV export of the selected window (hourly rows, site A and B when comparing). -->
<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app } from '#lib/state.svelte.ts';
	import { fmtNum } from '#lib/i18n.ts';
	import { CSV_COLUMNS, buildCsv, csvFilename, csvHeader, csvRow, downloadText, type CsvInput } from './csv.ts';
	import { UNITS, periodLabel } from './format.ts';

	const T = {
		en: {
			title: 'Hourly data for the selected window',
			rows: 'rows',
			rowsLabel: 'Rows (hourly)',
			sites: 'Sites',
			includeB: 'Include site B columns',
			download: 'Download CSV',
			saved: 'Saved',
			preview: 'Preview',
			columns: 'Columns',
			prefix: 'With two sites, each column appears twice: a_… for site A and b_… for site B.',
			period: 'Period',
			height: 'Panel/antenna height',
			margin: 'Antenna margin',
			header: 'The file starts with # comment lines: sites and coordinates, period, height, margin and data sources (NASA LOLA, NASA/JPL NAIF SPICE).',
			desc: {
				time_utc: 'UTC time',
				sun_el_deg: 'Sun elevation, °',
				sun_az_deg: 'Sun azimuth, °',
				horizon_under_sun_deg: 'Terrain horizon under the Sun, °',
				sun_visible_fraction: 'Visible share of the solar disk, 0–1',
				earth_el_deg: 'Earth elevation, °',
				earth_az_deg: 'Earth azimuth, °',
				earth_visible: 'Earth above horizon + margin, 0/1'
			} as Record<string, string>
		},
		uk: {
			title: 'Погодинні дані за вибране вікно',
			rows: 'рядків',
			rowsLabel: 'Рядків (щогодини)',
			sites: 'Місця',
			includeB: 'Додати стовпці місця B',
			download: 'Завантажити CSV',
			saved: 'Збережено',
			preview: 'Попередній перегляд',
			columns: 'Стовпці',
			prefix: 'Для двох місць кожен стовпець є двічі: a_… для місця A і b_… для місця B.',
			period: 'Період',
			height: 'Висота панелі/антени',
			margin: 'Запас антени',
			header: 'Файл починається з рядків-коментарів #: місця й координати, період, висота, запас і джерела даних (NASA LOLA, NASA/JPL NAIF SPICE).',
			desc: {
				time_utc: 'Час UTC',
				sun_el_deg: 'Висота Сонця, °',
				sun_az_deg: 'Азимут Сонця, °',
				horizon_under_sun_deg: 'Горизонт рельєфу під Сонцем, °',
				sun_visible_fraction: 'Видима частка сонячного диска, 0–1',
				earth_el_deg: 'Висота Землі, °',
				earth_az_deg: 'Азимут Землі, °',
				earth_visible: 'Земля вище горизонту + запасу, 0/1'
			} as Record<string, string>
		}
	};
	const t = $derived(T[app.lang]);

	let includeB = $state(true);
	let savedName = $state<string | null>(null);
	let savedTimer: ReturnType<typeof setTimeout> | undefined;

	const demSource = $derived((app.sites as unknown as { dem?: string } | null)?.dem ?? 'NASA LOLA LDEM_80S_40M (40 m/px), NASA PDS');
	const input = $derived.by<CsvInput | null>(() => {
		if (!app.eph || !app.viewA) return null;
		return {
			eph: app.eph,
			a: app.viewA,
			b: includeB ? app.viewB : null,
			heightM: app.heightM,
			marginDeg: app.earthMarginDeg,
			demSource
		};
	});
	const comparing = $derived(!!(input?.b && input.b.series.n === input.a.series.n));
	const filename = $derived(input ? csvFilename(input) : '');
	const header = $derived(csvHeader(comparing));
	const preview = $derived(input ? [0, 1, 2].filter((k) => k < input.a.series.n).map((k) => csvRow(input, k).split(',')) : []);
	const nRows = $derived(input?.a.series.n ?? 0);
	const period = $derived(app.eph ? periodLabel(app.eph, app.win.i0, app.win.i1) : '');

	function download() {
		if (!input) return;
		downloadText(buildCsv(input), filename);
		savedName = filename;
		clearTimeout(savedTimer);
		savedTimer = setTimeout(() => (savedName = null), 3200);
	}
	$effect(() => () => clearTimeout(savedTimer));
	const dur = $derived(prefersReducedMotion.current ? 0 : 1);
</script>

<div class="export">
	<div class="left">
		<h3>{t.title}</h3>
		<dl class="facts">
			<div><dt>{t.period}</dt><dd>{period}</dd></div>
			<div><dt>{t.height}</dt><dd>{app.heightM} {UNITS[app.lang].m}</dd></div>
			<div><dt>{t.margin}</dt><dd>{fmtNum(app.earthMarginDeg, 1)}°</dd></div>
			<div><dt>{t.rowsLabel}</dt><dd class="num">{fmtNum(nRows)}</dd></div>
		</dl>
		<div class="sites">
			<span class="pill"><span class="tag">A</span>{app.siteA?.name[app.lang]}</span>
			{#if app.siteB}
				<label class="pill toggle" class:off={!includeB}>
					<input type="checkbox" bind:checked={includeB} aria-label={t.includeB} />
					<span class="tag tb">B</span>{app.siteB.name[app.lang]}
				</label>
			{/if}
		</div>
		<div class="actions">
			<button class="dl" onclick={download} disabled={!input}>
				<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"
					><path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg
				>
				{t.download}
			</button>
			<span class="status" aria-live="polite">
				{#key savedName}
					{#if savedName}
						<span class="saved" in:scale={{ start: 0.85, duration: 300 * dur }}>
							<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"
								><path class="tick" d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg
							>
							{t.saved}
						</span>
					{:else}
						<span class="fname mono" title={filename} in:fade={{ duration: 200 * dur }}>{filename}</span>
					{/if}
				{/key}
			</span>
		</div>
		<p class="note">{t.header}</p>
	</div>

	<div class="right">
		<span class="label">{t.preview}</span>
		<!-- focusable so keyboard users can scroll the wide preview horizontally -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="table" role="region" aria-label={t.preview} tabindex="0">
			<table class="mono">
				<thead>
					<tr>
						{#each header as h (h)}
							<th title={t.desc[h.replace(/^[ab]_/, '')] ?? h} class:bcol={h.startsWith('b_')}>{h}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#key filename + header.length}
						{#each preview as row, i (i)}
							<tr in:fade={{ duration: 260 * dur, delay: 50 * i * dur }}>
								{#each row as cell, j (j)}<td class:bcol={header[j]?.startsWith('b_')}>{cell}</td>{/each}
							</tr>
						{/each}
					{/key}
					<tr class="more"><td colspan={header.length}>… {fmtNum(Math.max(0, nRows - 3))} {t.rows}</td></tr>
				</tbody>
			</table>
		</div>
		<span class="label">{t.columns}</span>
		{#if comparing}<p class="pref">{t.prefix}</p>{/if}
		<ul class="cols">
			{#each ['time_utc', ...CSV_COLUMNS] as c (c)}
				<li><code class="mono">{c}</code><span>{t.desc[c]}</span></li>
			{/each}
		</ul>
	</div>
</div>

<style>
	.export {
		display: grid;
		grid-template-columns: minmax(240px, 0.8fr) minmax(0, 1.4fr);
		gap: 20px;
		height: 100%;
		min-height: 0;
	}
	.left {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}
	.facts {
		margin: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 14px;
	}
	.facts div {
		min-width: 0;
	}
	.facts div:first-child {
		grid-column: 1 / -1;
	}
	.facts dt {
		font-size: 10.5px;
		color: var(--text-3);
	}
	.facts dd {
		margin: 0;
		font-size: 12.5px;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sites {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 3px 10px 3px 4px;
		border-radius: var(--radius-pill);
		font-size: 11.5px;
		color: var(--text-2);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--hairline);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition:
			opacity var(--dur) var(--ease-out),
			border-color var(--dur-fast);
	}
	.toggle {
		cursor: pointer;
	}
	.toggle input {
		accent-color: var(--site-b);
		margin: 0 0 0 4px;
	}
	.toggle.off {
		opacity: 0.5;
	}
	.toggle:hover {
		border-color: var(--glass-border-strong);
	}
	.tag {
		flex: none;
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		border-radius: 5px;
		font-size: 10px;
		font-weight: 600;
		background: var(--site-a);
		color: #0a0e16;
	}
	.tag.tb {
		background: var(--site-b);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.dl {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 16px;
		border-radius: var(--radius-sm);
		font-weight: 600;
		font-size: 13px;
		color: #04121b;
		background: linear-gradient(135deg, var(--earth-soft), var(--earth));
		box-shadow: 0 6px 22px rgba(92, 200, 255, 0.2);
		transition:
			transform var(--dur) var(--ease-spring),
			box-shadow var(--dur) var(--ease-out);
	}
	.dl:hover {
		transform: translateY(-1px);
		box-shadow: 0 10px 28px rgba(92, 200, 255, 0.3);
	}
	.dl:hover svg {
		animation: nudge 700ms var(--ease-in-out) infinite alternate;
	}
	@keyframes nudge {
		to {
			transform: translateY(2px);
		}
	}
	.dl:active {
		transform: scale(0.97);
	}
	.fname {
		font-size: 10.5px;
		color: var(--text-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.status {
		display: grid;
		min-width: 0;
	}
	.status > :global(*) {
		grid-area: 1 / 1;
	}
	.saved {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
		color: var(--both);
	}
	.tick {
		stroke-dasharray: 16;
		stroke-dashoffset: 16;
		animation: draw 420ms var(--ease-out) forwards;
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	.note {
		margin: auto 0 0;
		font-size: 10.5px;
		color: var(--text-3);
		line-height: 1.4;
	}
	.right {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}
	.table {
		flex: none;
		overflow-x: auto;
		border-radius: var(--radius-sm);
		border: 1px solid var(--hairline);
		background: rgba(0, 0, 0, 0.25);
		scrollbar-width: thin;
	}
	table {
		border-collapse: collapse;
		font-size: 10.5px;
		white-space: nowrap;
	}
	th,
	td {
		padding: 5px 10px;
		text-align: right;
	}
	th:first-child,
	td:first-child {
		text-align: left;
		position: sticky;
		left: 0;
		background: #0b0f17;
	}
	th {
		font-weight: 500;
		color: var(--text-2);
		border-bottom: 1px solid var(--hairline);
	}
	td {
		color: var(--text-2);
	}
	.bcol {
		color: var(--site-b);
	}
	.more td {
		color: var(--text-3);
		text-align: left;
	}
	.pref {
		margin: 0;
		font-size: 11px;
		color: var(--text-3);
	}
	.cols {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 3px 16px;
	}
	.cols li {
		display: flex;
		gap: 8px;
		align-items: baseline;
		font-size: 11px;
		color: var(--text-3);
		min-width: 0;
	}
	.cols code {
		color: var(--earth-soft);
		font-size: 10.5px;
		flex: none;
	}

	@container planner (max-width: 760px) {
		.export {
			grid-template-columns: 1fr;
			grid-auto-rows: max-content;
			overflow-y: auto;
			gap: 14px;
		}
		.right,
		.left {
			overflow: visible;
		}
		.note {
			margin-top: 0;
		}
	}
</style>
