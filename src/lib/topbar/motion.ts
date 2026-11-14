// AI-assisted: written with Claude, reviewed by the team.
// Small motion kit for the top bar: reduced-motion aware Svelte transitions.

import { cubicOut, backOut, quintOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

export const reducedMotion = (): boolean =>
	typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Popover: grows from its anchor (scale + lift + fade), slightly springy on the way in. */
export function pop(node: Element, { duration = 260, y = -6, origin = 'top left' } = {}): TransitionConfig {
	if (reducedMotion()) return { duration: 120, css: (t) => `opacity:${t}` };
	(node as HTMLElement).style.transformOrigin = origin;
	return {
		duration,
		easing: quintOut,
		css: (t, u) => `opacity:${Math.min(1, t * 1.6)};transform:translateY(${u * y}px) scale(${0.94 + 0.06 * t})`
	};
}

/** Chip / label swap: slides vertically with a soft blur. */
export function swap(node: Element, { dir = 1, duration = 280 } = {}): TransitionConfig {
	if (reducedMotion()) return { duration: 0 };
	return {
		duration,
		easing: cubicOut,
		css: (t, u) => `opacity:${t};transform:translateY(${u * 10 * dir}px);filter:blur(${u * 3}px)`
	};
}

/** Horizontal reveal for the site B chip: width grows from 0 while the content scales in. */
export function reveal(node: Element, { duration = 380 } = {}): TransitionConfig {
	const el = node as HTMLElement;
	const w = el.offsetWidth;
	if (reducedMotion()) return { duration: 120, css: (t) => `opacity:${t}` };
	return {
		duration,
		easing: backOut,
		css: (t) => {
			const k = Math.max(0, Math.min(1, t));
			return `max-width:${k * w}px;opacity:${Math.min(1, t * 1.4)};transform:scale(${0.85 + 0.15 * t});overflow:hidden`;
		}
	};
}

/** Bottom sheet slide. */
export function sheet(node: Element, { duration = 420 } = {}): TransitionConfig {
	if (reducedMotion()) return { duration: 150, css: (t) => `opacity:${t}` };
	return { duration, easing: quintOut, css: (t, u) => `transform:translateY(${u * 104}%)` };
}

/** Toast: drops in from above with a little overshoot. */
export function drop(node: Element, { duration = 420 } = {}): TransitionConfig {
	if (reducedMotion()) return { duration: 120, css: (t) => `opacity:${t}` };
	return {
		duration,
		easing: backOut,
		css: (t, u) => `opacity:${Math.min(1, t * 2)};transform:translate(-50%, ${-u * 18}px) scale(${0.92 + 0.08 * t})`
	};
}
