// AI-assisted: written with Claude, reviewed by the team.
// Category order and dot colours for the site picker.
// Deliberately not the Sun/Earth/night meaning colours, so a dot never reads as a measurement.

import type { SiteCategory } from '#lib/engine/data.ts';

export const CATEGORY_ORDER: SiteCategory[] = ['artemis', 'mission', 'sunny', 'shadow', 'custom'];

export const CATEGORY_COLOR: Record<SiteCategory, string> = {
	artemis: '#8fb3ff',
	mission: '#5fe0c8',
	sunny: '#ffe08a',
	shadow: '#8a86b8',
	custom: '#f59ac0'
};
