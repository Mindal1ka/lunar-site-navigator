// AI-assisted: written with Claude, reviewed by the team.
// Scene frame for the 3D view. Units are km. The origin sits on the sphere at
// the south pole and local "up" there is +Y, which keeps float32 precise:
//   scene (x, y, z) = (ME_y, -ME_z - R, -ME_x)
// so map +X (lon 90°) -> scene +X and map +Y (lon 0°) -> scene -Z; seen from
// above with screen-up = -Z the scene looks exactly like the LOLA polar map.

import { MOON_R_M, latLonToXY, type Vec3 } from '#lib/engine/geo.ts';

export const R_KM = MOON_R_M / 1000;

/** Moon ME direction -> scene direction (rotation only). */
export function dirToScene(d: ArrayLike<number>): Vec3 {
	return [d[1], -d[2], -d[0]];
}

/**
 * Point on the curved surface from map coordinates (km) and altitude above the
 * sphere (km). Same closed form as the terrain vertex shader (inverse stereographic).
 */
export function surfaceAt(mx: number, my: number, alt: number): Vec3 {
	const s = mx / (2 * R_KM);
	const t = my / (2 * R_KM);
	const r2 = s * s + t * t;
	const k = 1 / (1 + r2);
	return [2 * s * k * (R_KM + alt), alt * (1 - r2) * k - 2 * R_KM * r2 * k, -2 * t * k * (R_KM + alt)];
}

/** Scene point -> map coordinates (km) and altitude above the sphere (km). */
export function sceneToMap(x: number, y: number, z: number): { mx: number; my: number; alt: number } {
	const l2m = x * x + z * z + y * y + 2 * R_KM * y; // |V|^2 - R^2 without cancellation
	const L = Math.sqrt(R_KM * R_KM + l2m);
	const alt = l2m / (L + R_KM);
	const ux = x / L;
	const uy = (y + R_KM) / L;
	const uz = z / L;
	const d = 1 + uy;
	return { mx: (2 * R_KM * ux) / d, my: (-2 * R_KM * uz) / d, alt };
}

/** Lat/lon (deg) + elevation (m) -> scene point (km) with vertical exaggeration. */
export function siteToScene(lat: number, lon: number, elevM: number, exag = 1, liftKm = 0): Vec3 {
	const [x, y] = latLonToXY(lat, lon);
	return surfaceAt(x / 1000, y / 1000, (elevM / 1000) * exag + liftKm);
}

/** Local up (unit) at a scene point. */
export function upAt(p: ArrayLike<number>): Vec3 {
	const v: Vec3 = [p[0], p[1] + R_KM, p[2]];
	const n = Math.hypot(v[0], v[1], v[2]);
	return [v[0] / n, v[1] / n, v[2] / n];
}
