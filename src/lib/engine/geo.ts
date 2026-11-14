// AI-assisted: written with Claude, reviewed by the team.
// Geometry shared by the engine and the 3D scene. Mirrors pipeline/lola.py and
// pipeline/horizon.py (validated against JPL Horizons and NASA LOLA maps).

export const MOON_R_M = 1737400;
export const SUN_R_KM = 695700;
export const AU_KM = 149597870.7;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export type Vec3 = [number, number, number];

/** LOLA south polar stereographic: lat/lon (deg) -> map X, Y (m). */
export function latLonToXY(lat: number, lon: number): [number, number] {
	const r = 2 * MOON_R_M * Math.tan(0.5 * (90 + lat) * D2R);
	return [r * Math.sin(lon * D2R), r * Math.cos(lon * D2R)];
}

export function xyToLatLon(x: number, y: number): [number, number] {
	const r = Math.hypot(x, y);
	const lat = -90 + 2 * Math.atan((0.5 * r) / MOON_R_M) * R2D;
	const lon = ((Math.atan2(x, y) * R2D) % 360 + 360) % 360;
	return [lat, lon];
}

export function unitFromLatLon(lat: number, lon: number): Vec3 {
	const la = lat * D2R;
	const lo = lon * D2R;
	return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

export interface LocalFrame {
	up: Vec3;
	east: Vec3;
	north: Vec3;
}

/** up = radial, east = z x up, north = up x east (azimuth from north, clockwise). */
export function localFrame(lat: number, lon: number): LocalFrame {
	const up = unitFromLatLon(lat, lon);
	let east: Vec3 = [-up[1], up[0], 0];
	const n = Math.hypot(east[0], east[1]);
	east = [east[0] / n, east[1] / n, 0];
	const north: Vec3 = [
		up[1] * east[2] - up[2] * east[1],
		up[2] * east[0] - up[0] * east[2],
		up[0] * east[1] - up[1] * east[0]
	];
	return { up, east, north };
}

export const dot = (a: Vec3 | Float64Array, b: Vec3 | Float64Array) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Elevation (deg) and azimuth (deg from north, clockwise) of a unit direction. */
export function elAz(d: ArrayLike<number>, f: LocalFrame): [number, number] {
	const u = d[0] * f.up[0] + d[1] * f.up[1] + d[2] * f.up[2];
	const e = d[0] * f.east[0] + d[1] * f.east[1] + d[2] * f.east[2];
	const n = d[0] * f.north[0] + d[1] * f.north[1] + d[2] * f.north[2];
	const el = Math.asin(Math.max(-1, Math.min(1, u))) * R2D;
	const az = ((Math.atan2(e, n) * R2D) % 360 + 360) % 360;
	return [el, az];
}
