// AI-assisted: written with Claude, reviewed by the team.
// Panorama camera: azimuth with drag inertia, critically damped fly-to,
// smooth horizontal zoom around an anchor point, and vertical pan when zoomed in.

import { approach, clamp, norm360, wrapDelta } from './util.ts';

export const MIN_FOV = 12;
export const MAX_FOV = 360;

export class Camera {
	az = 0;
	fov = 180;
	fovTarget = 180;
	/** inertial angular speed, deg/s */
	vel = 0;
	/** fly-to spring */
	private fly: { target: number; v: number } | null = null;
	/** keep `az` under screen offset `dx` (px from centre) while zooming */
	private anchor: { dx: number; az: number } | null = null;
	/** vertical centre offset chosen by the user (deg), used only when the view does not fit */
	elUser: number | null = null;
	reduced = false;

	stop() {
		this.vel = 0;
		this.fly = null;
	}

	panBy(dDeg: number) {
		this.fly = null;
		this.anchor = null;
		this.az = norm360(this.az + dDeg);
	}

	flyTo(az: number) {
		this.vel = 0;
		this.anchor = null;
		const target = this.az + wrapDelta(az - this.az);
		if (this.reduced) {
			this.az = norm360(target);
			this.fly = null;
		} else this.fly = { target, v: 0 };
	}

	/** Zoom by factor (> 1 zooms out) keeping the azimuth at screen offset dx fixed. */
	zoomBy(factor: number, dx: number, ppd: number) {
		this.fovTarget = clamp(this.fovTarget * factor, MIN_FOV, MAX_FOV);
		this.anchor = { dx, az: this.az + dx / ppd };
		if (this.reduced) this.fov = this.fovTarget;
	}

	setFov(fov: number) {
		this.fovTarget = clamp(fov, MIN_FOV, MAX_FOV);
		this.anchor = null;
		if (this.reduced) this.fov = this.fovTarget;
	}

	/** Advance one frame. safeW = width (px) of the free area the fov maps onto. */
	update(dt: number, safeW: number) {
		// zoom
		if (Math.abs(this.fov - this.fovTarget) > 1e-3) {
			this.fov += (this.fovTarget - this.fov) * approach(dt, 14);
			if (Math.abs(this.fov - this.fovTarget) < 0.01) this.fov = this.fovTarget;
			if (this.anchor) this.az = this.anchor.az - this.anchor.dx / (safeW / this.fov);
		} else this.anchor = null;
		// fly-to (critically damped spring)
		if (this.fly) {
			const k = 55;
			const c = 2 * Math.sqrt(k);
			const x = this.az - this.fly.target;
			this.fly.v += (-k * x - c * this.fly.v) * dt;
			this.az += this.fly.v * dt;
			if (Math.abs(x) < 0.01 && Math.abs(this.fly.v) < 0.05) {
				this.az = this.fly.target;
				this.fly = null;
			}
		}
		// inertia
		if (this.vel !== 0) {
			this.az += this.vel * dt;
			this.vel *= Math.exp(-dt * 3.2);
			if (Math.abs(this.vel) < 0.3) this.vel = 0;
		}
		if (!this.fly) this.az = norm360(this.az);
	}

	get moving() {
		return this.vel !== 0 || this.fly !== null || this.fov !== this.fovTarget;
	}
}
