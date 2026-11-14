// AI-assisted: written with Claude, reviewed by the team.
/** Static data URL with the build's version, so a CDN never serves data from an older build. */
export const dataUrl = (u: string) => `${u}${u.includes('?') ? '&' : '?'}v=${typeof __DATA_V__ === 'string' ? __DATA_V__ : 'dev'}`;
