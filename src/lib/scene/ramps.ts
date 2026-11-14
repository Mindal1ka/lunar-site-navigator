// AI-assisted: written with Claude, reviewed by the team.
// Heat map colour ramps. One source of truth for the GLSL (generated below) and
// the CSS legend, so the legend always matches the colours on the terrain.

export type RampLayer = 'sun' | 'earth' | 'night';
type Stop = [t: number, hex: string];

export const RAMPS: Record<RampLayer, Stop[]> = {
	// deep violet -> amber -> white
	sun: [
		[0, '#140a26'],
		[0.22, '#3b1660'],
		[0.48, '#9a3c78'],
		[0.7, '#ff8a3d'],
		[0.86, '#ffc25c'],
		[1, '#fff6e0']
	],
	// dark -> cyan
	earth: [
		[0, '#05080f'],
		[0.3, '#0c2a48'],
		[0.6, '#1d6fa8'],
		[0.85, '#5cc8ff'],
		[1, '#d4f2ff']
	],
	// short nights amber -> long nights violet
	night: [
		[0, '#ffd27a'],
		[0.25, '#ffb547'],
		[0.5, '#c8607a'],
		[0.75, '#6a3f9e'],
		[1, '#2a1a52']
	]
};

/** Night ramp is logarithmic in days: 1 d, 1 lunar day (~15 d) and a whole year all stay readable. */
export const NIGHT_LOG_MAX = 255;
export const nightT = (days: number) => Math.min(1, Math.max(0, Math.log(1 + days) / Math.log(1 + NIGHT_LOG_MAX)));

function hexRgb(h: string): [number, number, number] {
	const n = parseInt(h.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rampCss(layer: RampLayer, dir = 'to right'): string {
	return `linear-gradient(${dir}, ${RAMPS[layer].map(([t, c]) => `${c} ${(t * 100).toFixed(1)}%`).join(', ')})`;
}

const f = (v: number) => v.toFixed(4);

/** GLSL function `vec3 ramp_<layer>(float t)` returning sRGB colour. */
function rampGlsl(layer: RampLayer): string {
	const s = RAMPS[layer];
	let body = `vec3 ramp_${layer}(float t){\n\tt = clamp(t, 0.0, 1.0);\n\tvec3 c = vec3(${hexRgb(s[0][1]).map(f).join(', ')});\n`;
	for (let i = 1; i < s.length; i++) {
		const [t0] = s[i - 1];
		const [t1, c1] = s[i];
		body += `\tc = mix(c, vec3(${hexRgb(c1).map(f).join(', ')}), clamp((t - ${f(t0)}) / ${f(t1 - t0)}, 0.0, 1.0));\n`;
	}
	return body + '\treturn c;\n}\n';
}

export const RAMP_GLSL = (['sun', 'earth', 'night'] as RampLayer[]).map(rampGlsl).join('\n');
