// AI-assisted: written with Claude, reviewed by the team.
// Shared rendering-quality state. The 3D scene measures real frame times and moves the tier
// up or down; the rest of the UI reads it (and the `perf-<tier>` class on <html>) to drop the
// most expensive effects on weak or GPU-less machines while capable devices look unchanged.

export type Tier = 'high' | 'medium' | 'low';

const ORDER: Tier[] = ['low', 'medium', 'high'];

/** WebGL renderer string, e.g. "ANGLE (NVIDIA ...)" or "... SwiftShader ..." */
export function rendererInfo(): string {
	try {
		const c = document.createElement('canvas');
		const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
		if (!gl) return 'none';
		const ext = gl.getExtension('WEBGL_debug_renderer_info');
		const s = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return s;
	} catch {
		return 'unknown';
	}
}

/** Software rasterisers: no usable GPU (the case to design for: a PC without a graphics card). */
export function isSoftware(renderer: string): boolean {
	return /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software|mesa offscreen/i.test(renderer);
}

class Perf {
	renderer = $state('');
	software = $state(false);
	/** current tier; the scene adapts it from measured frame times */
	tier = $state<Tier>('high');
	/** user override from the URL (?q=low|medium|high), wins over the automatic choice */
	forced = $state<Tier | null>(null);

	init() {
		this.renderer = rendererInfo();
		this.software = isSoftware(this.renderer) || this.renderer === 'none';
		const q = new URLSearchParams(location.search).get('q');
		if (q === 'low' || q === 'medium' || q === 'high') this.forced = q;
		const cores = navigator.hardwareConcurrency ?? 8;
		this.tier = this.forced ?? (this.software ? 'low' : cores <= 4 ? 'medium' : 'high');
		// the page style follows the tier chosen at load only: switching it at runtime would
		// visibly change the panels while the user is looking at them
		const el = document.documentElement;
		for (const t of ORDER) el.classList.toggle(`perf-${t}`, t === this.tier);
	}

	/** step the tier down (true) or up (false); ignored when forced */
	step(down: boolean) {
		if (this.forced) return;
		const i = ORDER.indexOf(this.tier) + (down ? -1 : 1);
		if (i >= 0 && i < ORDER.length) this.tier = ORDER[i];
	}
}

export const perf = new Perf();
