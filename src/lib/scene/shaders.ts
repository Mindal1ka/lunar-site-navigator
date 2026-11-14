// AI-assisted: written with Claude, reviewed by the team.
// GLSL for the 3D view (GLSL3 via three's ShaderMaterial). Units: km.
// Terrain lighting is physical: Sun direction from the SPICE ephemeris, normals
// from TRUE LOLA heights, and shadows ray-marched on the curved surface with a
// soft penumbra across the real solar disk (same definition as the app numbers:
// visible fraction of the disk above the terrain horizon).

import { RAMP_GLSL, NIGHT_LOG_MAX, SLOPE_MAX } from './ramps';
import { DETAIL_FADE } from './heightfield';

// beyond the LOLA map there is no terrain data: show the rest of the Moon dimmed
const BODY_DIM = '#define BODY_DIM 0.14';

const COMMON = /* glsl */ `
${BODY_DIM}
#define PI 3.141592653589793
uniform float uR;
uniform float uHalf;
uniform sampler2D uOv;
uniform vec4 uOvRect;   // x0_km, y0_km, extent_km, -
uniform float uOvOff;   // m
uniform sampler2D uD0;
uniform vec4 uD0Rect;
uniform float uD0Off;
uniform float uD0W;
uniform sampler2D uD1;
uniform vec4 uD1Rect;
uniform float uD1Off;
uniform float uD1W;

vec2 rectUV(vec4 r, vec2 m) { return vec2((m.x - r.x) / r.z, (r.y - m.y) / r.z); }

float fadeW(vec2 uv) {
	if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return 0.0;
	vec2 a = smoothstep(0.0, ${DETAIL_FADE.toFixed(3)}, uv) * smoothstep(0.0, ${DETAIL_FADE.toFixed(3)}, 1.0 - uv);
	return a.x * a.y;
}

float ovH(vec2 m) { return texture(uOv, rectUV(uOvRect, m)).r + uOvOff; }

// true height (m): overview with the 40 m site tiles blended in
float heightM(vec2 m, out float wmax) {
	float h = ovH(m);
	wmax = 0.0;
	if (uD0W > 0.0) {
		vec2 uv = rectUV(uD0Rect, m);
		float w = fadeW(uv) * uD0W;
		if (w > 0.0) { h = mix(h, texture(uD0, uv).r + uD0Off, w); wmax = w; }
	}
	if (uD1W > 0.0) {
		vec2 uv = rectUV(uD1Rect, m);
		float w = fadeW(uv) * uD1W;
		if (w > 0.0) { h = mix(h, texture(uD1, uv).r + uD1Off, w); wmax = max(wmax, w); }
	}
	return h;
}

// map point (km) + altitude above the sphere (km) -> scene (inverse stereographic, no cancellation)
vec3 surf(vec2 m, float a) {
	vec2 st = m / (2.0 * uR);
	float r2 = dot(st, st);
	float k = 1.0 / (1.0 + r2);
	return vec3(2.0 * st.x * k * (uR + a), a * (1.0 - r2) * k - 2.0 * uR * r2 * k, -2.0 * st.y * k * (uR + a));
}

// scene -> map point (km) and altitude above the sphere (km)
vec2 toMap(vec3 q, out float alt) {
	float l2m = dot(q.xz, q.xz) + q.y * q.y + 2.0 * uR * q.y;
	float L = sqrt(uR * uR + l2m);
	alt = l2m / (L + uR);
	vec3 u = vec3(q.x, q.y + uR, q.z) / L;
	return 2.0 * uR * vec2(u.x, -u.z) / (1.0 + u.y);
}
`;

export const TERRAIN_VERT = /* glsl */ `
${COMMON}
uniform vec4 uMesh;   // x0_km, y0_km, extent_km
uniform float uExag;
uniform float uRole;  // 0 overview, 1/2 site patch
out vec2 vM;
out vec3 vW;
void main() {
	vec2 m = vec2(uMesh.x + uv.x * uMesh.z, uMesh.y - (1.0 - uv.y) * uMesh.z);
	float w;
	float h = uRole < 0.5 ? ovH(m) : heightM(m, w);
	vec3 p = surf(m, h * 0.001 * uExag);
	vM = m;
	vW = p;
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const TERRAIN_FRAG = /* glsl */ `
${COMMON}
${RAMP_GLSL}
uniform vec3 uSun;
uniform float uSunR;     // angular radius of the solar disk (rad)
uniform float uSunI;
uniform vec3 uEarth;
uniform float uEarthPhase;
uniform vec3 uCam;
uniform float uObsH;     // observer height above the surface (km), = app panel/antenna height
uniform float uHmax;     // highest terrain (km)
uniform float uRole;
uniform float uFade;
uniform float uExposure;
uniform sampler2D uHeat;
uniform vec4 uHeatGrid;  // half_km, cell_km, n, has
uniform vec3 uHeatLayers; // from, to, mix
uniform float uHeatAlpha;
// detail squares (101 x 101 cells of 100 m) around site A (0) and B (1)
uniform sampler2D uSq0;
uniform vec4 uSq0Rect;   // x0_km, y0_km (top edge), extent_km, reveal 0..1
uniform vec2 uSq0Info;   // n, has
uniform sampler2D uSq1;
uniform vec4 uSq1Rect;
uniform vec2 uSq1Info;
uniform vec4 uBest0;     // best landing cell centre mx, my (km), cell (km), alpha
uniform vec4 uBest1;
uniform float uSlopeLimit; // lander slope limit (deg): steeper cells are hatched on the slope layer
uniform float uSteps; // ray-march budget of the current quality tier (<= STEPS, changes without a recompile)
in vec2 vM;
in vec3 vW;

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

float diskFrac(float u) {
	u = clamp(u, -1.0, 1.0);
	return 1.0 - (acos(u) - u * sqrt(1.0 - u * u)) / PI;
}

// Visible fraction of the solar disk at P: march towards the Sun on the curved
// surface, track the lowest clearance angle (rad) of the ray over the true terrain.
float sunVisible(vec3 P, vec3 L, float w) {
	float t = mix(0.62, 0.065, w);
	float g = pow(330.0 / t, 1.0 / uSteps);
	t *= pow(g, ign(gl_FragCoord.xy));
	float cmin = 1.0;
	for (int i = 0; i < STEPS; i++) {
		if (float(i) >= uSteps) break;
		vec3 q = P + L * t;
		float alt;
		vec2 mq = toMap(q, alt);
		if (abs(mq.x) > uHalf || abs(mq.y) > uHalf) break;
		if (alt - uHmax > uSunR * t) break;          // the ray is above every summit
		float tmp;
		float H = heightM(mq, tmp) * 0.001;
		cmin = min(cmin, (alt - H) / t);
		if (cmin < -uSunR) break;                     // disk fully hidden
		t *= g;
	}
	return diskFrac(cmin / uSunR);
}

vec3 aces(vec3 x) {
	return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec4 heatRaw(vec2 m) {
	float half_ = uHeatGrid.x, cell = uHeatGrid.y;
	int n = int(uHeatGrid.z);
	vec2 f = vec2(m.x + half_, half_ - m.y) / cell - 0.5;
	ivec2 i0 = ivec2(floor(f));
	vec2 t = fract(f);
	vec4 acc = vec4(0.0);
	float ws = 0.0;
	for (int k = 0; k < 4; k++) {
		ivec2 o = ivec2(k & 1, k >> 1);
		ivec2 c = clamp(i0 + o, ivec2(0), ivec2(n - 1));
		vec4 v = texelFetch(uHeat, c, 0) * 255.0;
		float wk = (o.x == 1 ? t.x : 1.0 - t.x) * (o.y == 1 ? t.y : 1.0 - t.y);
		if (v.r > 254.5) wk = 0.0;
		acc += v * wk;
		ws += wk;
	}
	if (ws < 0.25) return vec4(0.0, 0.0, 0.0, -1.0);
	return vec4(acc.rgb / ws, 1.0);
}

vec3 heatColor(float layer, vec4 raw) {
	if (layer < 1.5) return ramp_sun(raw.r / 200.0);
	if (layer < 2.5) return ramp_earth(raw.g / 200.0);
	return ramp_night(log(1.0 + raw.b) / log(${(1 + NIGHT_LOG_MAX).toFixed(1)}));
}

#define SLOPE_MAX ${SLOPE_MAX.toFixed(1)}

// Detail square: bilinear between 100 m cell centres (no-data cells skipped). Returns the
// blend weight (0 outside / not yet revealed); v = raw [sun, earth, night, slope] codes.
// rim = square outline + the sweeping front of the reveal; grid = cell lines when zoomed in.
float sqSample(sampler2D tex, vec4 rect, vec2 info, vec2 m, vec2 fm, out vec4 v, out float rim, out float grid) {
	v = vec4(0.0);
	rim = 0.0;
	grid = 0.0;
	if (info.y < 0.5 || rect.w <= 0.001) return 0.0;
	vec2 uv = rectUV(rect, m);
	vec2 q = abs(uv - 0.5) * 2.0;
	float d = max(q.x, q.y);
	float px = 2.0 * max(fm.x, fm.y) / rect.z;     // d units per pixel
	float rev = rect.w * 1.1;
	float edge = 1.0 - smoothstep(0.0, px * 1.6, abs(d - 1.0));
	float front = exp(-pow((d - rev) / max(0.025, px * 2.0), 2.0)) * (1.0 - smoothstep(0.7, 1.0, rect.w));
	rim = max(edge * smoothstep(0.55, 1.0, rect.w), front * step(d, 1.0) * 1.4);
	if (d >= 1.0) return 0.0;
	float w = 1.0 - smoothstep(rev - 0.08, rev, d);
	if (w <= 0.0) return 0.0;
	int n = int(info.x);
	vec2 f = uv * info.x - 0.5;
	ivec2 i0 = ivec2(floor(f));
	vec2 t = fract(f);
	vec4 acc = vec4(0.0);
	float ws = 0.0;
	for (int k = 0; k < 4; k++) {
		ivec2 o = ivec2(k & 1, k >> 1);
		ivec2 c = clamp(i0 + o, ivec2(0), ivec2(n - 1));
		vec4 s = texelFetch(tex, c, 0) * 255.0;
		float wk = (o.x == 1 ? t.x : 1.0 - t.x) * (o.y == 1 ? t.y : 1.0 - t.y);
		if (s.r > 254.5) wk = 0.0;
		s.a = min(s.a, 254.0);
		acc += s * wk;
		ws += wk;
	}
	if (ws < 0.25) return 0.0;
	v = acc / ws;
	vec2 g = abs(fract(uv * info.x) - 0.5);
	vec2 fw = fm / rect.z * info.x;              // cells per pixel
	float line = max(smoothstep(0.5 - fw.x * 1.2, 0.5, g.x), smoothstep(0.5 - fw.y * 1.2, 0.5, g.y));
	grid = line * (1.0 - smoothstep(0.06, 0.2, max(fw.x, fw.y)));
	return w;
}

vec3 layerColor(float L, vec4 raw, float slopeOv, vec4 sv, float sw, out float a) {
	a = 0.0;
	if (L < 0.5) return vec3(0.0);
	vec3 c = vec3(0.0);
	if (L > 3.5) { c = ramp_slope(slopeOv / SLOPE_MAX); a = 1.0; }
	else if (raw.a > 0.0) { c = heatColor(L, raw); a = 1.0; }
	if (sw > 0.0) {
		vec3 cs = L > 3.5 ? ramp_slope(sv.a * 0.25 / SLOPE_MAX) : heatColor(L, sv);
		c = a > 0.0 ? mix(c, cs, sw) : cs;
		a = mix(a, 1.0, sw);
	}
	return c;
}

// outline of the best landing cell
float bestRing(vec4 b, vec2 m, vec2 fm) {
	if (b.w <= 0.001) return 0.0;
	vec2 q = abs(m - b.xy) / (0.5 * b.z);
	float e = max(q.x, q.y);
	float px = max(fm.x, fm.y) / (0.5 * b.z);
	float ring = 1.0 - smoothstep(0.0, max(px * 1.8, 0.08), abs(e - 1.0));
	float halo = exp(-pow(length(m - b.xy) / (b.z * 1.6), 2.0)) * 0.35;
	return (ring + halo) * b.w;
}

void main() {
	vec2 m = vM;
	float w;
	float h = heightM(m, w);
	if (uRole < 0.5) {
		if (w > 0.999) discard;
	} else {
		float wk = uRole < 1.5 ? fadeW(rectUV(uD0Rect, m)) * uD0W : fadeW(rectUV(uD1Rect, m)) * uD1W;
		if (wk < 0.001) discard;
	}

	// normal from TRUE heights (the displayed geometry may be exaggerated)
	float e = mix(0.41, 0.04, w);
	float tmp;
	vec2 ex = vec2(e, 0.0), ey = vec2(0.0, e);
	vec3 px = surf(m + ex, heightM(m + ex, tmp) * 0.001) - surf(m - ex, heightM(m - ex, tmp) * 0.001);
	vec3 py = surf(m + ey, heightM(m + ey, tmp) * 0.001) - surf(m - ey, heightM(m - ey, tmp) * 0.001);
	vec3 N = normalize(cross(px, py));

	vec3 P = surf(m, h * 0.001 + uObsH);
	vec3 up = normalize(vec3(P.x, P.y + uR, P.z));
	vec3 L = uSun;
	float mu0 = dot(N, L);
	float vis = 0.0;
	if (dot(up, L) > -0.03 && mu0 > -0.05) vis = sunVisible(P, L, w);

	// Lunar-Lambert reflectance (McEwen 1991): the Moon's flat, Lommel-Seeliger-like look
	vec3 V = normalize(uCam - vW);
	float mu = max(dot(N, V), 0.0);
	float m0 = max(mu0, 0.0);
	float refl = mix(m0, min(1.25, 2.0 * m0 / (m0 + mu + 1e-3)), 0.45);
	float alb = 0.16;
	vec3 col = alb * vec3(1.0, 0.965, 0.92) * uSunI * refl * vis;

	// earthshine from the real Earth direction and phase (boosted for legibility)
	float ue = max(dot(N, uEarth), 0.0) * smoothstep(-0.02, 0.02, dot(up, uEarth));
	col += alb * vec3(0.42, 0.6, 1.0) * 0.16 * uEarthPhase * ue;
	// faint fill so relief in permanent shadow stays readable
	col += alb * vec3(0.55, 0.6, 0.78) * 0.03 * (0.25 + 0.75 * max(dot(N, up), 0.0));

	// towards the edge of the LOLA map, blend into the smooth rest of the Moon (same as the body shader)
	vec2 m4 = m * m;
	float r = sqrt(sqrt(dot(m4, m4)));   // rounded-square edge
	float edge = smoothstep(uHalf - 20.0, uHalf - 1.0, r);
	if (edge > 0.0) {
		float b0 = max(dot(up, L), 0.0);
		float bm = max(dot(up, V), 0.0);
		float brefl = mix(b0, min(1.25, 2.0 * b0 / (b0 + bm + 1e-3)), 0.45);
		vec3 bcol = (alb * vec3(1.0, 0.965, 0.92) * uSunI * brefl + alb * vec3(0.55, 0.6, 0.78) * 0.03) * BODY_DIM;
		col = mix(col, bcol, edge);
	}

	col = aces(col * uExposure);

	float mixT = uHeatLayers.z;
	float heatOn = (uHeatLayers.x > 0.5 ? 1.0 - mixT : 0.0) + (uHeatLayers.y > 0.5 ? mixT : 0.0);
	if (uHeatAlpha > 0.001 && heatOn > 0.001) {
		vec2 fm = fwidth(m);
		vec4 raw = uHeatGrid.w > 0.5 ? heatRaw(m) : vec4(0.0, 0.0, 0.0, -1.0);
		float slopeOv = degrees(acos(clamp(dot(N, up), 0.0, 1.0)));
		vec4 sv;
		float rim0, grid0, rim1, grid1;
		float sw = sqSample(uSq0, uSq0Rect, uSq0Info, m, fm, sv, rim0, grid0);
		vec4 sv1;
		float sw1 = sqSample(uSq1, uSq1Rect, uSq1Info, m, fm, sv1, rim1, grid1);
		if (sw1 > sw) { sw = sw1; sv = sv1; grid0 = grid1; }
		float rim = max(rim0, rim1);
		float aF, aT;
		vec3 cF = layerColor(uHeatLayers.x, raw, slopeOv, sv, sw, aF);
		vec3 cT = layerColor(uHeatLayers.y, raw, slopeOv, sv, sw, aT);
		float a = mix(aF, aT, mixT);
		if (a > 0.0) {
			vec3 hc = (cF * aF * (1.0 - mixT) + cT * aT * mixT) / max(a, 1e-3);
			hc = pow(hc, vec3(2.2));
			float relief = pow(clamp(dot(N, up), 0.0, 1.0), 10.0);
			float lit = clamp(refl * vis * 2.5, 0.0, 1.0);
			hc *= 0.5 + 0.32 * relief + 0.18 * lit;
			// slope layer: hatch cells steeper than the lander limit
			float onSlope = (uHeatLayers.x > 3.5 ? 1.0 - mixT : 0.0) + (uHeatLayers.y > 3.5 ? mixT : 0.0);
			if (onSlope > 0.0 && sw > 0.0 && sv.a * 0.25 > uSlopeLimit) {
				vec2 hp = gl_FragCoord.xy;
				float hatch = step(0.5, fract((hp.x + hp.y) / 7.0));
				hc *= 1.0 - 0.45 * hatch * onSlope * sw;
			}
			col = mix(col, aces(hc * 1.6), a * uHeatAlpha * (0.9 + 0.08 * sw));
			col = mix(col, vec3(1.0), grid0 * 0.1 * sw * heatOn);
		}
		col += vec3(1.0, 0.93, 0.8) * rim * 0.6 * heatOn * uHeatAlpha;
		float best = max(bestRing(uBest0, m, fm), bestRing(uBest1, m, fm));
		col = mix(col, vec3(0.62, 1.0, 0.78), clamp(best, 0.0, 1.0) * heatOn);
	}

	col *= uFade;
	gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;

/** The rest of the Moon beyond the 420 km map: a smooth sphere, same reflectance, no relief. */
export const BODY_VERT = /* glsl */ `
out vec3 vN;
out vec3 vW;
void main() {
	vec4 w = modelMatrix * vec4(position, 1.0);
	vW = w.xyz;
	vN = normalize(position);
	gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const BODY_FRAG = /* glsl */ `
${BODY_DIM}
uniform vec3 uSun;
uniform vec3 uCam;
uniform float uSunI;
uniform float uExposure;
uniform float uFade;
in vec3 vN;
in vec3 vW;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
	vec3 N = normalize(vN);
	vec3 V = normalize(uCam - vW);
	float m0 = max(dot(N, uSun), 0.0);
	float mu = max(dot(N, V), 0.0);
	float refl = mix(m0, min(1.25, 2.0 * m0 / (m0 + mu + 1e-3)), 0.45);
	vec3 col = (0.16 * vec3(1.0, 0.965, 0.92) * uSunI * refl + 0.16 * vec3(0.55, 0.6, 0.78) * 0.03) * BODY_DIM;
	col = aces(col * uExposure) * uFade;
	gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;

export const STARS_VERT = /* glsl */ `
in float aMag;
in vec3 aCol;
uniform float uPx;
out vec3 vCol;
out float vA;
void main() {
	gl_Position = projectionMatrix * viewMatrix * vec4(position * 400.0, 1.0);
	gl_PointSize = uPx * (0.9 + 1.9 * aMag);
	vA = 0.18 + 0.82 * aMag;
	vCol = aCol;
}
`;

export const STARS_FRAG = /* glsl */ `
uniform float uFade;
in vec3 vCol;
in float vA;
void main() {
	vec2 c = gl_PointCoord - 0.5;
	float d = length(c);
	float a = smoothstep(0.5, 0.0, d);
	a *= a;
	gl_FragColor = vec4(vCol * vA * a * uFade, 1.0);
}
`;

/** Camera-facing quad for the Sun: crisp disk of the true angular size + glare. */
export const SUN_VERT = /* glsl */ `
uniform vec3 uDir;
uniform float uHalfAngle;
out vec2 vUv;
void main() {
	vec4 c = viewMatrix * vec4(uDir * 400.0, 1.0);
	float s = 400.0 * tan(uHalfAngle);
	c.xy += position.xy * s;
	vUv = position.xy;
	gl_Position = projectionMatrix * c;
}
`;

export const SUN_FRAG = /* glsl */ `
uniform float uHalfAngle;
uniform float uSunR;
uniform float uFade;
in vec2 vUv;
void main() {
	float th = length(vUv) * uHalfAngle;          // rad from the Sun centre
	float px = fwidth(th);
	float disk = 1.0 - smoothstep(uSunR - px, uSunR + px, th);
	float g1 = exp(-th / (uSunR * 1.6));
	float g2 = exp(-th / (uSunR * 7.0));
	float g3 = exp(-th / (uSunR * 28.0));
	// faint horizontal glare streak
	float streak = exp(-abs(vUv.y) * uHalfAngle / (uSunR * 0.35)) * exp(-abs(vUv.x) * 3.2);
	vec3 col = vec3(1.0, 0.97, 0.9) * disk * 1.6
		+ vec3(1.0, 0.86, 0.6) * (0.55 * g1 + 0.2 * g2)
		+ vec3(1.0, 0.7, 0.4) * 0.07 * g3
		+ vec3(1.0, 0.82, 0.55) * 0.08 * streak;
	col *= 1.0 - smoothstep(0.75, 1.0, length(vUv));
	gl_FragColor = vec4(col * uFade, 1.0);
}
`;

/** Earth: real angular size, lit by the real Sun direction, so the phase is correct. */
export const EARTH_VERT = /* glsl */ `
out vec3 vN;
out vec3 vObj;
void main() {
	vN = normalize(mat3(modelMatrix) * normal);
	vObj = position;
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

export const EARTH_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uView;   // direction from the Earth towards the observer
uniform float uFade;
in vec3 vN;
in vec3 vObj;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
	vec3 i = floor(x), f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
	vec3 N = normalize(vN);
	vec3 p = normalize(vObj);
	float land = smoothstep(0.52, 0.56, fbm(p * 2.2 + 3.1));
	float cloud = smoothstep(0.5, 0.78, fbm(p * 4.0 + vec3(7.0, 1.0, 3.0)));
	vec3 base = mix(vec3(0.03, 0.12, 0.32), vec3(0.24, 0.3, 0.2), land);
	base = mix(base, vec3(0.95), cloud * 0.85);
	float d = dot(N, uSun);
	float day = smoothstep(-0.08, 0.12, d);
	float rim = pow(1.0 - max(dot(N, uView), 0.0), 3.0);
	vec3 col = base * day * 1.25 + vec3(0.3, 0.55, 1.0) * rim * (0.25 + 0.9 * day) + vec3(0.004, 0.008, 0.02);
	gl_FragColor = vec4(pow(col * uFade, vec3(1.0 / 2.2)), 1.0);
}
`;
