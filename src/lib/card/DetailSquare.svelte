<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- What the 100 m detail square around site A adds to the card: the spread of the three numbers
     within 500 m (head), the best landing spot within 5 km under a slope limit and the status of
     a custom point's detailed map (body). Every number states its height and period. -->
<script lang="ts">
	import { fly, slide, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { app } from '#lib/state.svelte.ts';
	import { fmtDate, fmtMonthYear, fmtNum } from '#lib/i18n.ts';
	import { bestSpot, compass, nearestHeight, squareWindow, type Range, type Square } from '#lib/engine/squares.ts';
	import { periodLabel } from './format.ts';
	import { timeOf } from '#lib/engine/visibility.ts';

	interface Props {
		part: 'head' | 'body';
	}
	let { part }: Props = $props();

	const T = {
		en: {
			within: (m: number) => `Within ${m} m`,
			sun: 'Sun',
			earth: 'Earth',
			night: 'longest night',
			d: 'd',
			dark: 'no sunlight',
			cells: '100 m cells',
			fast: 'fast map method (provisional)',
			h: (m: number) => `Panel/antenna height: ${m} m`,
			margin: (m: number) => `margin ${m}°`,
			differs: (parts: string) => `Detail square computed for ${parts}.`,
			cardIs: (v: string) => `card: ${v}`,
			never: 'never lit',
			whySpread:
				'Why a range? At the pole the Sun skims the horizon, so light changes over just a few hundred metres: moving a lander one ridge over can change the numbers a lot.',
			bestHead: (lim: number) => `Best spot within 5 km, slope ≤ ${lim}°`,
			bestSun: 'Sun',
			bestEarth: 'Earth',
			bestNight: 'night',
			slope: 'slope',
			away: (km: string, dir: string) => `${km} km ${dir}`,
			here: 'this is the site itself',
			analyse: 'Analyse this spot',
			none: (lim: number) => `No 100 m cell within 5 km is flat enough (≤ ${lim}°).`,
			limit: 'Lander slope limit',
			limitAria: 'Lander slope limit in degrees',
			brightest: (sun: string, slope: string) => `Brightest cell: ${sun} Sun, but slope ${slope}`,
			whyBest:
				'Why not the brightest point? The sunniest cells are usually sharp ridge crests and peaks. They are too steep or too narrow for a lander, so the best landing spot trades a little sunlight for level ground.',
			method: 'Same method as the card: LOLA 40 m horizon from each 100 m cell; slope = steepest 80 m plane within each 100 m cell (LOLA 40 m).',
			methodFast: 'Fast map method: LOLA 80 m, 720 azimuths, rays to 150 km (provisional until the exact map arrives).',
			job: {
				queued: (pos: number, eta: string) => `Detailed 10 km map: queued (#${pos}), ${eta}`,
				running: (eta: string) => `Detailed 10 km map: computing, ${eta}`,
				busy: (s: number) => `The detail server is busy. Trying again in about ${s} s.`,
				error: (m: string) =>
					`Detailed map unavailable: ${m === 'size' ? 'the server sent an unexpected file' : m === 'invalid' ? 'this point is outside the map' : 'the service is not available right now'}`,
				cancelled: 'Detailed 10 km map not requested.'
			},
			about: (s: number) => (s < 90 ? `about ${Math.max(5, Math.round(s / 5) * 5)} s` : `about ${Math.round(s / 60)} min`),
			soon: 'almost done',
			hide: 'Hide',
			cancel: 'Cancel',
			retry: 'Request again',
			jobAria: 'Detailed map status'
		},
		uk: {
			within: (m: number) => `У межах ${m} м`,
			sun: 'Сонце',
			earth: 'Земля',
			night: 'найдовша ніч',
			d: 'д',
			dark: 'без Сонця',
			cells: 'комірки 100 м',
			fast: 'швидкий метод карти (попередньо)',
			h: (m: number) => `Висота панелі/антени: ${m} м`,
			margin: (m: number) => `запас ${m}°`,
			differs: (parts: string) => `Детальний квадрат пораховано для ${parts}.`,
			cardIs: (v: string) => `картка: ${v}`,
			never: 'ніколи не освітлено',
			whySpread:
				'Чому діапазон? На полюсі Сонце ковзає над горизонтом, тож освітленість змінюється вже за кілька сотень метрів: зсув апарата на сусідній гребінь може сильно змінити числа.',
			bestHead: (lim: number) => `Найкраще місце в межах 5 км, нахил ≤ ${lim}°`,
			bestSun: 'Сонце',
			bestEarth: 'Земля',
			bestNight: 'ніч',
			slope: 'нахил',
			away: (km: string, dir: string) => `${km} км на ${dir}`,
			here: 'це саме вибране місце',
			analyse: 'Проаналізувати це місце',
			none: (lim: number) => `У межах 5 км немає достатньо рівної комірки 100 м (≤ ${lim}°).`,
			limit: 'Межа нахилу для посадки',
			limitAria: 'Межа нахилу для посадки, градуси',
			brightest: (sun: string, slope: string) => `Найосвітленіша комірка: Сонце ${sun}, але нахил ${slope}`,
			whyBest:
				'Чому не найосвітленіша точка? Найсонячніші комірки — зазвичай гострі гребені й піки. Вони надто круті або вузькі для апарата, тож найкраще місце посадки міняє трохи світла на рівний ґрунт.',
			method: 'Той самий метод, що й у картці: горизонт LOLA 40 м з кожної комірки 100 м; нахил — найкрутіша площина 80 м у межах кожної комірки 100 м (LOLA 40 м).',
			methodFast: 'Швидкий метод карти: LOLA 80 м, 720 азимутів, промені до 150 км (попередньо, доки не готова точна карта).',
			job: {
				queued: (pos: number, eta: string) => `Детальна карта 10 км: у черзі (№${pos}), ${eta}`,
				running: (eta: string) => `Детальна карта 10 км: рахуємо, ${eta}`,
				busy: (s: number) => `Сервер деталізації зайнятий. Спробуємо ще раз приблизно за ${s} с.`,
				error: (m: string) =>
					`Детальна карта недоступна: ${m === 'size' ? 'сервер надіслав неочікуваний файл' : m === 'invalid' ? 'ця точка поза мапою' : 'сервіс зараз недоступний'}`,
				cancelled: 'Детальну карту 10 км не запитано.'
			},
			about: (s: number) => (s < 90 ? `приблизно ${Math.max(5, Math.round(s / 5) * 5)} с` : `приблизно ${Math.round(s / 60)} хв`),
			soon: 'майже готово',
			hide: 'Сховати',
			cancel: 'Скасувати',
			retry: 'Запитати знову',
			jobAria: 'Стан детальної карти'
		}
	};
	const t = $derived(T[app.lang]);
	const mo = (d: number) => (prefersReducedMotion.current ? 0 : d);
	const teacher = $derived(app.mode === 'teacher');

	const site = $derived(app.siteA);
	const sq = $derived<Square | null>(app.squareA);
	const shownH = $derived(sq ? nearestHeight(sq, app.heightM) : app.heightM);
	const sp = $derived(app.spreadA);
	const best = $derived(app.bestA);
	const brightest = $derived(sq ? bestSpot(sq, app.heightM, 90) : null);
	const job = $derived(site ? app.squareJobs[site.id] ?? null : null);

	/** what the square was computed for vs what the card shows */
	const sqWin = $derived(sq && app.eph ? squareWindow(sq, app.eph) : null);
	const sameWin = $derived(!!sqWin && sqWin.i0 === app.win.i0 && sqWin.i1 === app.win.i1);
	const sameH = $derived(shownH === app.heightM);
	const sameM = $derived(!!sq && Math.abs(sq.marginDeg - app.earthMarginDeg) < 1e-6);
	// a different time window is not a warning: the line always states its own fixed 12-month period;
	// a different height or Earth margin changes the numbers themselves, so that is flagged
	const matches = $derived(sameH && sameM);

	function sqPeriodText(s: Square, exact = false): string {
		const a = new Date(s.startUnix * 1000);
		// last hour of the period (same convention as the card's period label)
		const b = new Date((s.startUnix + (s.hours - 1) * 3600) * 1000);
		return exact ? `${fmtDate(a)} – ${fmtDate(b)}` : `${fmtMonthYear(a)} – ${fmtMonthYear(b)}`;
	}
	const cardPeriodExact = $derived(
		app.eph ? `${fmtDate(timeOf(app.eph, app.win.i0))} – ${fmtDate(timeOf(app.eph, app.win.i1 - 1))}` : periodLabel()
	);
	const mUnit = $derived(app.lang === 'uk' ? 'м' : 'm');
	/** only what differs from the card, each with the card's value */
	const diffText = $derived.by(() => {
		if (!sq) return '';
		const parts: string[] = [];
		if (!sameWin && !(sameH && sameM)) parts.push(`${sqPeriodText(sq, true)} (${t.cardIs(cardPeriodExact)})`);
		if (!sameH) parts.push(`${fmtNum(shownH)} ${mUnit} (${t.cardIs(`${fmtNum(app.heightM)} ${mUnit}`)})`);
		if (!sameM) parts.push(`${t.margin(sq.marginDeg)} (${t.cardIs(t.margin(app.earthMarginDeg))})`);
		return t.differs(parts.join(', '));
	});

	const pct = (r: Range) => (r.min === r.max ? `${fmtNum(r.min, 1)}` : `${fmtNum(r.min, 1)}–${fmtNum(r.max, 1)}`) + ' %';
	const days = (v: number, capped = false) =>
		v === Infinity ? t.dark : `${capped && v >= 253 ? '≥' : ''}${fmtNum(v)}`;
	function nightRange(r: Range, capped: boolean): string {
		if (r.min === Infinity) return t.dark;
		if (r.max === Infinity) return r.min === Infinity ? t.dark : `${days(r.min)} ${t.d} – ${t.never}`;
		const hi = `${days(r.max, capped)} ${t.d}`;
		return r.min === r.max ? hi : `${days(r.min)}–${hi}`;
	}
	const eta = (s: number) => (s <= 3 ? t.soon : t.about(s));
</script>

{#if part === 'head'}
	{#if sq && sp}
		<div class="spread" class:off={!matches} in:fly={{ y: 6, duration: mo(420), easing: cubicOut }}>
			<p class="sl">
				<span class="k">{t.within(sp.radiusM)}:</span>
				<span class="v"><i class="dot sun"></i>{t.sun} <b class="num">{pct(sp.sun)}</b></span>
				<span class="v"><i class="dot earth"></i>{t.earth} <b class="num">{pct(sp.earth)}</b></span>
				<span class="v"><i class="dot night"></i>{t.night} <b class="num">{nightRange(sp.night, sp.nightCapped)}</b></span>
			</p>
			{#if matches}
				<p class="meta">
					{sq.kind === 'fast' ? t.fast : t.cells} · {t.h(shownH)} · {sqPeriodText(sq)}
				</p>
			{:else}
				<p class="meta warn">
					{sq.kind === 'fast' ? `${t.fast} · ` : `${t.cells} · `}{diffText}
				</p>
			{/if}
			{#if teacher}
				<p class="why" transition:slide={{ duration: mo(260) }}>{t.whySpread}</p>
			{/if}
		</div>
	{/if}
{:else}
	{#if job && (!job.hidden || job.state === 'error') && site?.category === 'custom'}
		<div class="job {job.state}" role="status" aria-label={t.jobAria} transition:slide={{ duration: mo(280), easing: cubicOut }}>
			{#if job.state === 'queued' || job.state === 'running'}
				<span class="spin" aria-hidden="true"></span>
				<span class="jt">{job.state === 'queued' ? t.job.queued(Math.max(1, job.position), eta(job.etaS)) : t.job.running(eta(job.etaS))}</span>
				<button class="ghost" onclick={() => app.hideSquareJob(site.id)}>{t.hide}</button>
				<button class="ghost" onclick={() => app.cancelSquare(site.id)}>{t.cancel}</button>
			{:else if job.state === 'busy'}
				<span class="pause" aria-hidden="true"></span>
				<span class="jt">{t.job.busy(job.retryS)}</span>
				<button class="ghost" onclick={() => app.hideSquareJob(site.id)}>{t.hide}</button>
			{:else if job.state === 'error'}
				<span class="bang" aria-hidden="true">!</span>
				<span class="jt">{t.job.error(job.message)}</span>
				<button class="ghost" onclick={() => app.retrySquare(site)}>{t.retry}</button>
				<button class="ghost" onclick={() => app.hideSquareJob(site.id)}>{t.hide}</button>
			{/if}
		</div>
	{:else if job?.state === 'cancelled' && site?.category === 'custom' && sq?.kind !== 'exact'}
		<div class="job cancelled" transition:slide={{ duration: mo(280) }}>
			<span class="jt">{t.job.cancelled}</span>
			<button class="ghost" onclick={() => app.retrySquare(site)}>{t.retry}</button>
		</div>
	{/if}

	{#if sq}
		<section class="bestbox" in:fly={{ y: 8, duration: mo(460), easing: cubicOut }}>
			<div class="bh">
				<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 17l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z" /></svg>
				<span class="bt">{t.bestHead(app.maxSlopeDeg)}</span>
			</div>
			{#key best ? `${best.r},${best.c}` : 'none'}
				<div class="bv" in:fade={{ duration: mo(260) }}>
					{#if best}
						<p class="bnums">
							<b class="num big">{fmtNum(best.sunPct, 1)} %</b> {t.bestSun}
							<span class="sep">·</span>
							{best.distM < 1 ? t.here : t.away(fmtNum(best.distM / 1000, 1), compass(best.bearingDeg, app.lang))}
							<span class="sep">·</span>
							{t.slope} <b class="num">{fmtNum(best.slopeDeg, 1)}°</b>
						</p>
						<p class="bsub">
							{t.bestEarth} <b class="num">{fmtNum(best.earthPct, 1)} %</b>
							<span class="sep">·</span>
							{t.bestNight} <b class="num">{best.nightDays === Infinity ? t.dark : `${days(best.nightDays, true)} ${t.d}`}</b>
						</p>
					{:else}
						<p class="bsub">{t.none(app.maxSlopeDeg)}</p>
					{/if}
				</div>
			{/key}
			<label class="lim">
				<span class="lk">{t.limit}</span>
				<input
					type="range"
					min="5"
					max="20"
					step="1"
					bind:value={app.maxSlopeDeg}
					aria-label={t.limitAria}
					style="--p: {((app.maxSlopeDeg - 5) / 15) * 100}%"
				/>
				<b class="num lv">{app.maxSlopeDeg}°</b>
			</label>
			<p class="meta">
				{sq.kind === 'fast' ? t.fast : t.cells} · {t.h(shownH)} · {sqPeriodText(sq)}{#if !matches}<span class="warn"> · {diffText}</span>{/if}
			</p>
			{#if best && best.distM >= 1}
				<button class="analyse" disabled={app.pointBusy} onclick={() => best && app.addCustomPoint(best.lat, best.lon, 'A')}>
					<span>{t.analyse}</span>
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" /></svg>
				</button>
			{/if}
			{#if teacher}
				<div class="why" transition:slide={{ duration: mo(260) }}>
					{#if brightest && best && (brightest.r !== best.r || brightest.c !== best.c)}
						<b>{t.brightest(`${fmtNum(brightest.sunPct, 1)} %`, `${fmtNum(brightest.slopeDeg, 1)}°`)}.</b>
					{/if}
					{t.whyBest}
					<span class="mth">{sq.kind === 'fast' ? t.methodFast : t.method}</span>
				</div>
			{/if}
		</section>
	{/if}
{/if}

<style>
	.spread {
		display: grid;
		gap: 3px;
		padding: 9px 11px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--hairline);
	}
	.sl {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 2px 10px;
		font-size: 12px;
		color: var(--text-2);
	}
	.sl .k {
		color: var(--text-3);
	}
	.sl b {
		color: var(--text);
		font-weight: 600;
	}
	.dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		margin-right: 5px;
		vertical-align: 1px;
	}
	.dot.sun {
		background: var(--sun);
	}
	.dot.earth {
		background: var(--earth);
	}
	.dot.night {
		background: #8f8ac9;
	}
	.meta {
		margin: 0;
		font-size: 10.5px;
		color: var(--text-3);
	}
	.warn {
		color: var(--warning);
	}
	.spread.off .sl b {
		color: var(--text-2);
	}
	.spread .why {
		margin: 3px 0 0;
		padding: 2px 0 0 9px;
		font-size: 11.5px;
		line-height: 1.45;
		background: none;
		border: 0;
		border-left: 2px solid rgba(92, 200, 255, 0.35);
		border-radius: 0;
	}
	.why {
		margin: 4px 0 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-2);
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: rgba(92, 200, 255, 0.06);
		border: 1px solid rgba(92, 200, 255, 0.14);
	}
	.why b {
		color: var(--text);
		font-weight: 600;
	}
	.why .mth {
		display: block;
		margin-top: 4px;
		font-size: 11px;
		color: var(--text-3);
	}

	/* ---- custom point job chip */
	.job {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px 8px;
		padding: 8px 8px 8px 12px;
		border-radius: var(--radius-pill);
		background: rgba(196, 155, 255, 0.08);
		border: 1px solid rgba(196, 155, 255, 0.25);
		font-size: 12px;
		color: var(--text-2);
	}
	.job.busy,
	.job.error {
		border-radius: var(--radius-sm);
		background: rgba(255, 207, 92, 0.07);
		border-color: rgba(255, 207, 92, 0.25);
	}
	.job.cancelled {
		background: rgba(255, 255, 255, 0.03);
		border-color: var(--hairline);
	}
	.jt {
		flex: 1;
		min-width: 150px;
	}
	.spin {
		flex: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.14);
		border-top-color: var(--site-b);
		animation: spin 0.9s linear infinite;
	}
	.pause,
	.bang {
		flex: none;
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: rgba(255, 207, 92, 0.2);
		color: var(--warning);
		font: 700 11px/1 var(--font-display);
	}
	.pause::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--warning);
		animation: breathe 1.6s var(--ease-in-out) infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes breathe {
		50% {
			transform: scale(0.5);
			opacity: 0.5;
		}
	}
	.ghost {
		flex: none;
		height: 26px;
		padding: 0 10px;
		border-radius: var(--radius-pill);
		font-size: 11.5px;
		color: var(--text-2);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--hairline);
		transition:
			color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}
	.ghost:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.09);
	}

	/* ---- best spot */
	.bestbox {
		display: grid;
		gap: 6px;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: linear-gradient(135deg, rgba(127, 224, 176, 0.08), rgba(255, 255, 255, 0.02));
		border: 1px solid rgba(127, 224, 176, 0.22);
	}
	.bh {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.star {
		width: 15px;
		height: 15px;
		flex: none;
		fill: #9fffc8;
		filter: drop-shadow(0 0 5px rgba(120, 255, 180, 0.6));
	}
	.bt {
		font: 600 12.5px/1.3 var(--font-display);
		color: var(--text);
	}
	.bv p {
		margin: 0;
	}
	.bnums {
		font-size: 12.5px;
		color: var(--text-2);
	}
	.bnums b {
		color: var(--text);
	}
	.big {
		font-size: 17px;
		font-weight: 650;
		color: #c9ffe1 !important;
	}
	.bsub {
		font-size: 11.5px;
		color: var(--text-3);
	}
	.bsub b {
		color: var(--text-2);
		font-weight: 600;
	}
	.sep {
		margin: 0 3px;
		color: var(--text-3);
	}
	.lim {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 11.5px;
		color: var(--text-2);
	}
	.lk {
		flex: none;
	}
	.lv {
		flex: none;
		min-width: 28px;
		text-align: right;
		color: var(--text);
	}
	input[type='range'] {
		flex: 1;
		min-width: 0;
		height: 22px;
		margin: 0;
		background: transparent;
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(90deg, #7fe0b0 var(--p), rgba(255, 255, 255, 0.12) var(--p));
	}
	input[type='range']::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(90deg, #7fe0b0 var(--p), rgba(255, 255, 255, 0.12) var(--p));
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		margin-top: -6px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0 0 3px rgba(127, 224, 176, 0.35);
		transition: transform var(--dur-fast) var(--ease-spring);
	}
	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border: 0;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0 0 3px rgba(127, 224, 176, 0.35);
	}
	input[type='range']:active::-webkit-slider-thumb {
		transform: scale(1.2);
	}
	input[type='range']:focus-visible {
		outline: 2px solid var(--earth);
		outline-offset: 2px;
		border-radius: 4px;
	}
	.analyse {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 14px;
		border-radius: var(--radius-pill);
		font-size: 12.5px;
		font-weight: 600;
		color: #05140c;
		background: linear-gradient(135deg, #9fffc8, #7fe0b0);
		box-shadow: 0 4px 18px rgba(127, 224, 176, 0.25);
		transition:
			transform var(--dur) var(--ease-spring),
			box-shadow var(--dur) var(--ease-out),
			opacity var(--dur) var(--ease-out);
	}
	.analyse:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 6px 24px rgba(127, 224, 176, 0.4);
	}
	.analyse:active:not(:disabled) {
		transform: scale(0.96);
	}
	.analyse:disabled {
		opacity: 0.5;
		cursor: progress;
	}
	.analyse svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform var(--dur) var(--ease-spring);
	}
	.analyse:hover svg {
		transform: translateX(2px);
	}
	@media (prefers-reduced-motion: reduce) {
		.spin,
		.pause::before {
			animation: none;
		}
	}
</style>
