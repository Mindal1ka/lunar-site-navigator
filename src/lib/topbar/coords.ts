// AI-assisted: written with Claude, reviewed by the team.
// Coordinate helpers shared by the site picker and the URL state.
// Frame: Moon Mean-Earth, planetocentric, east-positive longitude 0..360 (same as sites.json).

import type { Lang } from '#lib/engine/data.ts';

/** "86.790° S · 12.300° E" (EN) / "86.790° пд. ш. · 12.300° сх. д." (UK) */
export function fmtLatLon(lat: number, lon: number, lang: Lang, digits = 3): string {
	const lo = ((lon % 360) + 360) % 360;
	const ns = lat < 0 ? (lang === 'uk' ? 'пд. ш.' : 'S') : lang === 'uk' ? 'пн. ш.' : 'N';
	const ew = lang === 'uk' ? 'сх. д.' : 'E';
	return `${Math.abs(lat).toFixed(digits)}° ${ns} · ${lo.toFixed(digits)}° ${ew}`;
}

/**
 * Parse "−86.8, 12.5", "-86.8 12.5", "86.8S 12.5E", "86.8 S, 347.5 W".
 * The app only covers the south pole, so a latitude without a sign or hemisphere is read as south.
 * Returns east-positive longitude in 0..360, or null if the text is not a coordinate pair.
 */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
	const s = text.trim().replace(/−/g, '-').replace(/°/g, ' ').toUpperCase();
	const m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*([NS])?\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*([EW])?$/);
	if (!m) return null;
	let lat = parseFloat(m[1].replace(',', '.'));
	let lon = parseFloat(m[3].replace(',', '.'));
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	if (m[2] === 'N') lat = Math.abs(lat);
	else if (m[2] === 'S' || lat > 0) lat = -Math.abs(lat);
	if (m[4] === 'W') lon = -Math.abs(lon);
	if (lat < -90 || lat > 90 || lon < -360 || lon > 360) return null;
	return { lat, lon: ((lon % 360) + 360) % 360 };
}
