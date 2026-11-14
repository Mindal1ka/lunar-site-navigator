// AI-assisted: written with Claude, reviewed by the team.
// three.js engine behind Scene3D: terrain (LOLA overview + 40 m site tiles),
// physically lit and ray-marched shadows, sky (stars, Sun, Earth), damped orbit
// camera with cinematic flights, render-on-demand with adaptive resolution.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Grid, Heatmap } from '#lib/engine/data.ts';
import type { Vec3 } from '#lib/engine/geo.ts';
import { R_KM, sceneToMap, upAt } from './coords';
import { Heightfield } from './heightfield';
import {
	BODY_FRAG,
	BODY_VERT,
	EARTH_FRAG,
	EARTH_VERT,
	STARS_FRAG,
	STARS_VERT,
	SUN_FRAG,
	SUN_VERT,
	TERRAIN_FRAG,
	TERRAIN_VERT
} from './shaders';

export type HeatIndex = 0 | 1 | 2 | 3; // off, sun, earth, night

export interface EngineOptions {
	mobile: boolean;
	reducedMotion: boolean;
	onFrame: () => void;
	onContextLost: () => void;
	onContextRestored: () => void;
	onUserMove?: () => void;
}

export interface Insets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

interface Pose {
	target: THREE.Vector3;
	radius: number;
	phi: number;
	theta: number;
}

interface Flight {
	from: Pose;
	to: Pose;
	t0: number;
	dur: number;
	lift: number;
	intro: boolean;
	resolve?: () => void;
}

interface Tween {
	from: number;
	to: number;
	t0: number;
	dur: number;
	set: (v: number) => void;
	done?: () => void;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

const HEIGHT_OFFSET_SAMPLES = 4096;

export class SceneEngine {
	readonly canvas: HTMLCanvasElement;
	readonly hf = new Heightfield();
	renderer: THREE.WebGLRenderer;
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;

	private container: HTMLElement;
	private opts: EngineOptions;
	private scene = new THREE.Scene();
	private sky = new THREE.Scene();
	private skyCam = new THREE.PerspectiveCamera(45, 1, 1, 4000);
	private U: Record<string, THREE.IUniform>;
	private overviewMesh: THREE.Mesh | null = null;
	private patch: (THREE.Mesh | null)[] = [null, null];
	private patchId: (string | null)[] = [null, null];
	private detailTex: (THREE.DataTexture | null)[] = [null, null];
	private ovTex: THREE.DataTexture | null = null;
	private heatTex: THREE.DataTexture | null = null;
	private placeholder: THREE.DataTexture;
	private heatPlaceholder: THREE.DataTexture;
	private sunMesh: THREE.Mesh;
	private earthMesh: THREE.Mesh;
	private stars: THREE.Points;
	private body: THREE.Mesh;
	private disposables: { dispose(): void }[] = [];
	private floatLinear: boolean;

	private raf = 0;
	private last = performance.now();
	private dirty = true;
	private lastMotion = 0;
	private flight: Flight | null = null;
	private tweens = new Map<string, Tween>();
	private sunTarget = new THREE.Vector3(1, 0, 0);
	private sunCur = new THREE.Vector3(1, 0, 0);
	private sunSnap = true;
	private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
	private size = { w: 1, h: 1 };
	private baseDpr: number;
	private scale = 1;
	private frameTimes: number[] = [];
	private heatTo: HeatIndex = 0;
	private lost = false;
	private destroyed = false;
	exag = 1;
	visible = true;

	constructor(container: HTMLElement, opts: EngineOptions) {
		this.container = container;
		this.opts = opts;
		this.canvas = document.createElement('canvas');
		this.canvas.className = 'scene-canvas';
		container.prepend(this.canvas);

		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvas,
			antialias: true,
			alpha: false,
			powerPreference: 'high-performance',
			stencil: false
		});
		this.renderer.autoClear = false;
		this.renderer.setClearColor(0x020306, 1);
		this.floatLinear = this.renderer.extensions.has('OES_texture_float_linear');
		this.baseDpr = Math.min(window.devicePixelRatio || 1, opts.mobile ? 1.5 : 2);

		this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 4000);
		this.camera.position.set(0, 1400, 0.001);
		this.camera.up.set(0, 1, 0);

		this.placeholder = new THREE.DataTexture(new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RedFormat, THREE.FloatType);
		this.placeholder.needsUpdate = true;
		const heatPh = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
		heatPh.needsUpdate = true;
		this.heatPlaceholder = heatPh;
		this.disposables.push(this.placeholder, heatPh);

		const half = 210;
		this.U = {
			uR: { value: R_KM },
			uHalf: { value: half },
			uOv: { value: this.placeholder },
			uOvRect: { value: new THREE.Vector4(-half, half, 2 * half, 0) },
			uOvOff: { value: 0 },
			uD0: { value: this.placeholder },
			uD0Rect: { value: new THREE.Vector4(0, 0, 1, 0) },
			uD0Off: { value: 0 },
			uD0W: { value: 0 },
			uD1: { value: this.placeholder },
			uD1Rect: { value: new THREE.Vector4(0, 0, 1, 0) },
			uD1Off: { value: 0 },
			uD1W: { value: 0 },
			uExag: { value: 1 },
			uSun: { value: this.sunCur },
			uSunR: { value: 0.00465 },
			uSunI: { value: 2.0 },
			uEarth: { value: new THREE.Vector3(0, 0, 1) },
			uEarthPhase: { value: 0.5 },
			uCam: { value: this.camera.position },
			uObsH: { value: 0.002 },
			uHmax: { value: 7.1 },
			uFade: { value: 0 },
			uExposure: { value: 1.15 },
			uHeat: { value: heatPh },
			uHeatGrid: { value: new THREE.Vector4(210, 1, 1, 0) },
			uHeatLayers: { value: new THREE.Vector3(0, 0, 1) },
			uHeatAlpha: { value: 1 }
		};

		// ---- sky: stars, Sun, Earth (rendered with a rotation-only camera)
		this.stars = this.makeStars();
		this.sky.add(this.stars);
		const sunGeo = new THREE.PlaneGeometry(2, 2);
		const sunMat = new THREE.ShaderMaterial({
			vertexShader: SUN_VERT,
			fragmentShader: SUN_FRAG,
			uniforms: { uDir: { value: this.sunCur }, uHalfAngle: { value: 0.35 }, uSunR: this.U.uSunR, uFade: this.U.uFade },
			blending: THREE.AdditiveBlending,
			depthTest: false,
			depthWrite: false,
			transparent: true
		});
		this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
		this.sunMesh.frustumCulled = false;
		this.sunMesh.renderOrder = 2;
		this.sky.add(this.sunMesh);

		const earthGeo = new THREE.SphereGeometry(1, 48, 32);
		const earthMat = new THREE.ShaderMaterial({
			vertexShader: EARTH_VERT,
			fragmentShader: EARTH_FRAG,
			uniforms: { uSun: { value: this.sunCur }, uView: { value: new THREE.Vector3() }, uFade: this.U.uFade },
			depthTest: false,
			depthWrite: false
		});
		this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
		this.earthMesh.frustumCulled = false;
		this.earthMesh.renderOrder = 3;
		this.sky.add(this.earthMesh);

		// ---- the rest of the Moon beyond the map (drawn first, no depth)
		const bodyGeo = new THREE.SphereGeometry(R_KM - 6, 256, 128);
		const bodyMat = new THREE.ShaderMaterial({
			vertexShader: BODY_VERT,
			fragmentShader: BODY_FRAG,
			uniforms: { uSun: this.U.uSun, uCam: this.U.uCam, uSunI: this.U.uSunI, uExposure: this.U.uExposure, uFade: this.U.uFade },
			depthTest: false,
			depthWrite: false
		});
		this.body = new THREE.Mesh(bodyGeo, bodyMat);
		this.body.position.set(0, -R_KM, 0);
		this.body.renderOrder = -10;
		this.body.frustumCulled = false;
		this.scene.add(this.body);
		this.disposables.push(sunGeo, sunMat, earthGeo, earthMat, bodyGeo, bodyMat);

		// ---- controls
		this.controls = new OrbitControls(this.camera, this.canvas);
		const c = this.controls;
		c.enableDamping = true;
		c.dampingFactor = opts.reducedMotion ? 0.25 : 0.075;
		c.rotateSpeed = 0.55;
		c.zoomSpeed = 0.9;
		c.panSpeed = 0.9;
		c.screenSpacePanning = false;
		c.zoomToCursor = true;
		c.minDistance = 0.6;
		c.maxDistance = 2600;
		c.maxPolarAngle = 1.48;
		c.keyPanSpeed = 18;
		c.listenToKeyEvents(container);
		c.addEventListener('start', () => {
			this.cancelFlight();
			this.opts.onUserMove?.();
		});
		c.addEventListener('change', () => this.invalidate());

		this.canvas.addEventListener('webglcontextlost', this.onLost, false);
		this.canvas.addEventListener('webglcontextrestored', this.onRestored, false);
		document.addEventListener('visibilitychange', this.onVis);

		this.resize();
		this.raf = requestAnimationFrame(this.tick);
	}

	// ------------------------------------------------------------------ data

	private heightTexture(g: Grid): { tex: THREE.DataTexture; off: number } {
		const n = g.size;
		const src = g.heights;
		// subtract a mean so half floats (fallback) keep sub-metre precision on high terrain
		let sum = 0;
		const stride = Math.max(1, Math.floor(src.length / HEIGHT_OFFSET_SAMPLES));
		let cnt = 0;
		for (let i = 0; i < src.length; i += stride, cnt++) sum += src[i];
		const off = Math.round(sum / Math.max(1, cnt));
		let tex: THREE.DataTexture;
		if (this.floatLinear) {
			const a = new Float32Array(src.length);
			for (let i = 0; i < src.length; i++) a[i] = src[i] - off;
			tex = new THREE.DataTexture(a, n, n, THREE.RedFormat, THREE.FloatType);
		} else {
			const a = new Uint16Array(src.length);
			for (let i = 0; i < src.length; i++) a[i] = THREE.DataUtils.toHalfFloat(src[i] - off);
			tex = new THREE.DataTexture(a, n, n, THREE.RedFormat, THREE.HalfFloatType);
		}
		tex.magFilter = THREE.LinearFilter;
		tex.minFilter = THREE.LinearFilter;
		tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
		tex.generateMipmaps = false;
		tex.flipY = false;
		tex.needsUpdate = true;
		return { tex, off };
	}

	private terrainMaterial(role: number, rect: THREE.Vector4): THREE.ShaderMaterial {
		const steps = this.opts.mobile ? 48 : 128;
		return new THREE.ShaderMaterial({
			vertexShader: TERRAIN_VERT,
			fragmentShader: TERRAIN_FRAG,
			uniforms: { ...this.U, uRole: { value: role }, uMesh: { value: rect } },
			defines: { STEPS: steps },
			side: THREE.DoubleSide
		});
	}

	setOverview(g: Grid & { min_m?: number; max_m?: number }) {
		this.hf.setOverview(g);
		const { tex, off } = this.heightTexture(g);
		this.ovTex?.dispose();
		this.ovTex = tex;
		const ext = (g.size * g.step_m) / 1000;
		const half = this.hf.halfKm;
		this.U.uOv.value = tex;
		this.U.uOvOff.value = off;
		this.U.uOvRect.value.set(g.x0_m / 1000, g.y0_m / 1000, ext, 0);
		this.U.uHalf.value = half;
		this.U.uHmax.value = (g.max_m ?? 7100) / 1000 + 0.05;
		if (!this.overviewMesh) {
			const seg = this.opts.mobile ? 320 : 512;
			const geo = new THREE.PlaneGeometry(1, 1, seg, seg);
			const mat = this.terrainMaterial(0, new THREE.Vector4(g.x0_m / 1000, g.y0_m / 1000, ext, 0));
			this.overviewMesh = new THREE.Mesh(geo, mat);
			this.overviewMesh.frustumCulled = false;
			this.scene.add(this.overviewMesh);
			this.disposables.push(geo, mat);
		}
		this.invalidate();
	}

	/** Show (or clear) the 40 m tile of site slot 0 (A) or 1 (B), with a smooth fade-in. */
	setDetail(slot: 0 | 1, id: string | null, g: Grid | null) {
		if (this.patchId[slot] === id && (g === null) === (this.detailTex[slot] === null)) return;
		const wKey = slot === 0 ? 'uD0W' : 'uD1W';
		const texKey = slot === 0 ? 'uD0' : 'uD1';
		const rectKey = slot === 0 ? 'uD0Rect' : 'uD1Rect';
		const offKey = slot === 0 ? 'uD0Off' : 'uD1Off';
		this.patchId[slot] = id;
		const old = this.detailTex[slot];
		const oldMesh = this.patch[slot];
		const finishOld = () => {
			old?.dispose();
			if (oldMesh) {
				this.scene.remove(oldMesh);
				oldMesh.geometry.dispose();
				(oldMesh.material as THREE.Material).dispose();
			}
		};
		if (!g) {
			this.tween(wKey, this.U[wKey].value, 0, this.opts.reducedMotion ? 0 : 350, (v) => {
				this.U[wKey].value = v;
				const d = this.hf.details[slot];
				if (d) d.weight = v;
			}, () => {
				if (this.patchId[slot] !== null) return;
				finishOld();
				this.detailTex[slot] = null;
				this.patch[slot] = null;
				this.hf.details[slot] = null;
				this.U[texKey].value = this.placeholder;
			});
			return;
		}
		finishOld();
		const { tex, off } = this.heightTexture(g);
		this.detailTex[slot] = tex;
		const ext = (g.size * g.step_m) / 1000;
		const rect = new THREE.Vector4(g.x0_m / 1000, g.y0_m / 1000, ext, 1);
		this.U[texKey].value = tex;
		this.U[offKey].value = off;
		(this.U[rectKey].value as THREE.Vector4).copy(rect);
		this.U[wKey].value = 0;
		const seg = this.opts.mobile ? 192 : 384;
		const geo = new THREE.PlaneGeometry(1, 1, seg, seg);
		const mat = this.terrainMaterial(slot + 1, rect);
		const mesh = new THREE.Mesh(geo, mat);
		mesh.frustumCulled = false;
		this.scene.add(mesh);
		this.patch[slot] = mesh;
		this.hf.details[slot] = { grid: g, weight: 0 };
		this.tween(wKey, 0, 1, this.opts.reducedMotion ? 0 : 900, (v) => {
			this.U[wKey].value = v;
			const d = this.hf.details[slot];
			if (d) d.weight = v;
		});
	}

	setHeatmap(h: Heatmap | null) {
		this.heatTex?.dispose();
		this.heatTex = null;
		if (!h) {
			// never leave a disposed texture bound to the material
			this.U.uHeat.value = this.heatPlaceholder;
			this.U.uHeatGrid.value.w = 0;
			this.invalidate();
			return;
		}
		const n2 = h.n * h.n;
		const a = new Uint8Array(n2 * 4);
		for (let i = 0; i < n2; i++) {
			a[i * 4] = h.sun[i];
			a[i * 4 + 1] = h.earth[i];
			a[i * 4 + 2] = h.night[i];
			a[i * 4 + 3] = 255;
		}
		const tex = new THREE.DataTexture(a, h.n, h.n, THREE.RGBAFormat, THREE.UnsignedByteType);
		tex.magFilter = tex.minFilter = THREE.NearestFilter;
		tex.generateMipmaps = false;
		tex.needsUpdate = true;
		this.heatTex = tex;
		this.U.uHeat.value = tex;
		this.U.uHeatGrid.value.set(h.half_km, h.cell_km, h.n, 1);
		this.invalidate();
	}

	/** Cross-fade between heat layers. */
	setHeatLayer(to: HeatIndex) {
		if (to === this.heatTo) return;
		const L = this.U.uHeatLayers.value as THREE.Vector3;
		// the currently dominant layer becomes the "from" side
		const cur = L.z >= 0.5 ? L.y : L.x;
		L.set(cur, to, 0);
		this.heatTo = to;
		this.tween('heat', 0, 1, this.opts.reducedMotion ? 0 : 520, (v) => (L.z = easeInOutSine(v)));
	}

	setExaggeration(x: number) {
		this.tween('exag', this.exag, x, this.opts.reducedMotion ? 0 : 900, (v) => {
			this.exag = v;
			this.U.uExag.value = v;
		});
	}

	setObserverHeight(m: number) {
		this.U.uObsH.value = m / 1000;
		this.invalidate();
	}

	/** Sun direction (scene, unit) and its angular radius (rad). Smoothly follows unless snap. */
	setSun(dir: Vec3, radiusRad: number, snap = false) {
		this.sunTarget.set(dir[0], dir[1], dir[2]).normalize();
		this.U.uSunR.value = radiusRad;
		if (snap || this.sunSnap || this.opts.reducedMotion) {
			this.sunCur.copy(this.sunTarget);
			this.sunSnap = false;
		}
		this.invalidate();
	}

	/** Earth topocentric direction (scene, unit), distance (km) and illuminated fraction. */
	setEarth(dir: Vec3, distKm: number, phase: number) {
		const e = this.U.uEarth.value as THREE.Vector3;
		e.set(dir[0], dir[1], dir[2]).normalize();
		this.U.uEarthPhase.value = phase;
		const ang = Math.asin(Math.min(1, 6371 / distKm));
		this.earthMesh.position.copy(e).multiplyScalar(400);
		this.earthMesh.scale.setScalar(400 * Math.sin(ang));
		((this.earthMesh.material as THREE.ShaderMaterial).uniforms.uView.value as THREE.Vector3).copy(e).negate();
		this.invalidate();
	}

	sunDirection(): THREE.Vector3 {
		return this.sunTarget;
	}

	// ------------------------------------------------------------------ camera

	private poseNow(): Pose {
		const off = this.camera.position.clone().sub(this.controls.target);
		const s = new THREE.Spherical().setFromVector3(off);
		return { target: this.controls.target.clone(), radius: s.radius, phi: s.phi, theta: s.theta };
	}

	private applyPose(p: Pose) {
		const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(p.radius, p.phi, p.theta));
		this.controls.target.copy(p.target);
		this.camera.position.copy(p.target).add(off);
		this.camera.lookAt(p.target);
	}

	/** Pose that frames the given scene points. */
	framing(points: Vec3[], opts: { theta?: number; phi?: number; minRadius?: number } = {}): Pose {
		const c = new THREE.Vector3();
		for (const p of points) c.add(new THREE.Vector3(p[0], p[1], p[2]));
		c.multiplyScalar(1 / Math.max(1, points.length));
		let span = 0;
		for (const p of points) span = Math.max(span, c.distanceTo(new THREE.Vector3(p[0], p[1], p[2])));
		const { w, h } = this.visibleArea();
		const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
		const half = Math.min(Math.atan((tanV * h) / this.size.h), Math.atan((tanV * w) / this.size.h));
		// keep at least ~9 km of terrain either side of the target, whatever the aspect ratio
		const radius = Math.max(opts.minRadius ?? 34, Math.max(span * 1.2, 9) / Math.tan(half));
		return { target: c, radius, phi: opts.phi ?? 1.1, theta: opts.theta ?? this.poseNow().theta };
	}

	/** Cinematic intro: from high above the pole, swoop down onto the pose in ~2.5 s. */
	intro(to: Pose): Promise<void> {
		const from: Pose = { target: new THREE.Vector3(0, 0, 0), radius: 1500, phi: 0.02, theta: to.theta - 1.4 };
		this.applyPose(from);
		this.tween('fade', 0, 1, this.opts.reducedMotion ? 0 : 1800, (v) => (this.U.uFade.value = easeOutCubic(v)));
		if (this.opts.reducedMotion) {
			this.applyPose(to);
			this.U.uFade.value = 1;
			return Promise.resolve();
		}
		return this.fly(to, 2700, { intro: true, delay: 380 });
	}

	fly(to: Pose, dur = 1600, o: { intro?: boolean; delay?: number } = {}): Promise<void> {
		this.flight?.resolve?.();
		const from = this.poseNow();
		if (this.opts.reducedMotion) dur = 0;
		const dist = from.target.distanceTo(to.target);
		// shortest way round
		let dTheta = to.theta - from.theta;
		dTheta = ((((dTheta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
		const to2 = { ...to, theta: from.theta + dTheta };
		const lift = o.intro ? 0 : Math.min(1.2, dist / Math.max(20, Math.min(from.radius, to.radius)) * 0.35);
		return new Promise((resolve) => {
			this.flight = { from, to: to2, t0: performance.now() + (o.delay ?? 0), dur, lift, intro: !!o.intro, resolve };
			this.invalidate();
		});
	}

	cancelFlight() {
		if (this.flight) {
			this.flight.resolve?.();
			this.flight = null;
		}
	}

	get flying() {
		return !!this.flight;
	}

	zoomBy(f: number) {
		const p = this.poseNow();
		p.radius = THREE.MathUtils.clamp(p.radius * f, this.controls.minDistance, this.controls.maxDistance);
		this.fly(p, 450);
	}

	private stepFlight(now: number) {
		const f = this.flight;
		if (!f) return;
		const raw = f.dur <= 0 ? 1 : Math.max(0, Math.min(1, (now - f.t0) / f.dur));
		let pose: Pose;
		if (f.intro) {
			// descend first, then tilt towards the horizon and settle
			const tr = easeInOutCubic(Math.min(1, raw / 0.85));
			const tp = easeInOutCubic(Math.max(0, (raw - 0.22) / 0.78));
			pose = {
				target: f.from.target.clone().lerp(f.to.target, easeInOutCubic(raw)),
				radius: Math.exp(Math.log(f.from.radius) + (Math.log(f.to.radius) - Math.log(f.from.radius)) * tr),
				phi: f.from.phi + (f.to.phi - f.from.phi) * tp,
				theta: f.from.theta + (f.to.theta - f.from.theta) * easeOutQuint(raw)
			};
		} else {
			const e = easeInOutCubic(raw);
			const lr = Math.log(f.from.radius) + (Math.log(f.to.radius) - Math.log(f.from.radius)) * e;
			pose = {
				target: f.from.target.clone().lerp(f.to.target, e),
				radius: Math.exp(lr) * (1 + f.lift * Math.sin(Math.PI * e)),
				phi: f.from.phi + (f.to.phi - f.from.phi) * e - 0.25 * f.lift * Math.sin(Math.PI * e),
				theta: f.from.theta + (f.to.theta - f.from.theta) * e
			};
			pose.phi = THREE.MathUtils.clamp(pose.phi, 0.02, this.controls.maxPolarAngle);
		}
		this.applyPose(pose);
		if (raw >= 1) {
			this.flight = null;
			f.resolve?.();
		}
	}

	setInsets(i: Insets) {
		this.insets = i;
		this.resize();
	}

	visibleArea() {
		const { w, h } = this.size;
		return { w: Math.max(1, w - this.insets.left - this.insets.right), h: Math.max(1, h - this.insets.top - this.insets.bottom) };
	}

	resize() {
		const r = this.container.getBoundingClientRect();
		const w = Math.max(1, Math.round(r.width));
		const h = Math.max(1, Math.round(r.height));
		this.size = { w, h };
		this.renderer.setPixelRatio(this.baseDpr * this.scale);
		this.renderer.setSize(w, h, false);
		this.canvas.style.width = '100%';
		this.canvas.style.height = '100%';
		this.camera.aspect = w / h;
		const dx = (this.insets.right - this.insets.left) / 2;
		const dy = (this.insets.bottom - this.insets.top) / 2;
		if (dx || dy) this.camera.setViewOffset(w, h, dx, dy, w, h);
		else this.camera.clearViewOffset();
		this.camera.updateProjectionMatrix();
		(this.stars.material as THREE.ShaderMaterial).uniforms.uPx.value = this.baseDpr * this.scale;
		this.invalidate();
	}

	// ------------------------------------------------------------------ picking / projection

	/** Map point (km) under a client pixel, or null. */
	pick(clientX: number, clientY: number): { mx: number; my: number; p: Vec3 } | null {
		const r = this.canvas.getBoundingClientRect();
		const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
		const ray = new THREE.Raycaster();
		ray.setFromCamera(ndc, this.camera);
		const o = ray.ray.origin, d = ray.ray.direction;
		const t = this.hf.raycast([o.x, o.y, o.z], [d.x, d.y, d.z], this.exag);
		if (t === null) return null;
		const p: Vec3 = [o.x + d.x * t, o.y + d.y * t, o.z + d.z * t];
		const m = sceneToMap(p[0], p[1], p[2]);
		if (!this.hf.inside(m.mx, m.my)) return null;
		return { mx: m.mx, my: m.my, p };
	}

	private v = new THREE.Vector3();
	/** Scene point -> CSS pixels in the container; null when behind the camera. */
	project(p: Vec3): { x: number; y: number; depth: number } | null {
		this.v.set(p[0], p[1], p[2]).project(this.camera);
		if (this.v.z > 1 || this.v.z < -1) return null;
		return {
			x: (this.v.x * 0.5 + 0.5) * this.size.w,
			y: (-this.v.y * 0.5 + 0.5) * this.size.h,
			depth: this.camera.position.distanceTo(new THREE.Vector3(p[0], p[1], p[2]))
		};
	}

	occluded(p: Vec3): boolean {
		const c = this.camera.position;
		return this.hf.occluded([c.x, c.y, c.z], p, this.exag);
	}

	cameraDistance(): number {
		return this.camera.position.distanceTo(this.controls.target);
	}

	// ------------------------------------------------------------------ loop

	invalidate() {
		this.dirty = true;
	}

	private tween(key: string, from: number, to: number, dur: number, set: (v: number) => void, done?: () => void) {
		// a new tween on the same key replaces the old one (its completion is dropped on purpose)
		if (dur <= 0) {
			set(to);
			this.tweens.delete(key);
			done?.();
			this.invalidate();
			return;
		}
		this.tweens.set(key, { from, to, t0: performance.now(), dur, set, done });
		this.invalidate();
	}

	private stepTweens(now: number) {
		for (const [k, tw] of this.tweens) {
			const raw = Math.min(1, (now - tw.t0) / tw.dur);
			const e = k === 'heat' || k === 'fade' ? raw : easeInOutCubic(raw);
			tw.set(tw.from + (tw.to - tw.from) * e);
			if (raw >= 1) {
				this.tweens.delete(k);
				tw.done?.();
			}
		}
	}

	private tick = () => {
		const now = performance.now();
		if (this.destroyed) return;
		this.raf = requestAnimationFrame(this.tick);
		const dt = Math.min(0.1, (now - this.last) / 1000);
		this.last = now;
		if (this.lost || !this.visible) return;

		let moving = false;
		if (this.flight) {
			this.stepFlight(now);
			moving = true;
		}
		if (this.tweens.size) {
			this.stepTweens(now);
			moving = true;
		}
		if (this.controls.update(dt)) moving = true;

		// Sun follows its target with a short critically-damped glide
		const ang = this.sunCur.angleTo(this.sunTarget);
		if (ang > 1e-6) {
			if (ang > 0.6) this.sunCur.copy(this.sunTarget);
			else this.sunCur.lerp(this.sunTarget, 1 - Math.exp(-dt * 16)).normalize();
			moving = true;
		}

		if (moving) {
			this.lastMotion = now;
			this.dirty = true;
		}
		if (!this.dirty) {
			// refine: after motion stops, draw once at full resolution
			if (this.scale < 1 && now - this.lastMotion > 320) {
				this.scale = 1;
				this.resize();
			} else return;
		}
		this.dirty = false;
		this.keepAboveGround();
		this.render();
		this.adapt(now, moving);
		this.opts.onFrame();
	};

	private keepAboveGround() {
		const c = this.camera.position;
		const m = sceneToMap(c.x, c.y, c.z);
		if (!this.hf.inside(m.mx, m.my)) return;
		const ground = (this.hf.heightM(m.mx, m.my) / 1000) * this.exag;
		const minAlt = ground + 0.12 + 0.0;
		if (m.alt < minAlt) {
			const up = upAt([c.x, c.y, c.z]);
			const push = minAlt - m.alt;
			c.x += up[0] * push;
			c.y += up[1] * push;
			c.z += up[2] * push;
		}
	}

	private adapt(now: number, moving: boolean) {
		if (!moving) {
			this.frameTimes.length = 0;
			return;
		}
		this.frameTimes.push(now);
		if (this.frameTimes.length < 24) return;
		const span = (this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0]) / (this.frameTimes.length - 1);
		this.frameTimes.length = 0;
		if (span > 24 && this.scale > 0.55) {
			this.scale = this.scale > 0.8 ? 0.75 : 0.55;
			this.resize();
		} else if (span < 15 && this.scale < 1) {
			this.scale = this.scale < 0.6 ? 0.75 : 1;
			this.resize();
		}
	}

	private render() {
		const cam = this.camera;
		const c = cam.position;
		const m = sceneToMap(c.x, c.y, c.z);
		const ground = this.hf.inside(m.mx, m.my) ? (this.hf.heightM(m.mx, m.my) / 1000) * this.exag : -6;
		const altAbove = Math.max(0.05, m.alt - ground);
		cam.near = THREE.MathUtils.clamp(altAbove * 0.3, 0.004, 40);
		const horizon = Math.sqrt(2 * R_KM * Math.max(1, m.alt + 6));
		cam.far = this.cameraDistance() + 700 + horizon * 1.15;
		cam.updateProjectionMatrix();
		cam.updateMatrixWorld();

		const sc = this.skyCam;
		sc.fov = cam.fov;
		sc.aspect = cam.aspect;
		if (cam.view?.enabled) sc.setViewOffset(cam.view.fullWidth, cam.view.fullHeight, cam.view.offsetX, cam.view.offsetY, cam.view.width, cam.view.height);
		else sc.clearViewOffset();
		sc.updateProjectionMatrix();
		sc.quaternion.copy(cam.quaternion);
		sc.position.set(0, 0, 0);
		sc.updateMatrixWorld();

		const r = this.renderer;
		r.clear(true, true, false);
		r.render(this.sky, sc);
		r.clearDepth();
		r.render(this.scene, cam);
	}

	// ------------------------------------------------------------------ sky

	private makeStars(): THREE.Points {
		const N = this.opts.mobile ? 3500 : 6500;
		const pos = new Float32Array(N * 3);
		const mag = new Float32Array(N);
		const col = new Float32Array(N * 3);
		let seed = 1337;
		const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
		// galactic-band-like great circle
		const bn = new THREE.Vector3(0.3, 0.55, 0.78).normalize();
		const b1 = new THREE.Vector3(1, 0, 0).cross(bn).normalize();
		const b2 = bn.clone().cross(b1);
		const v = new THREE.Vector3();
		for (let i = 0; i < N; i++) {
			if (i < N * 0.4) {
				const a = rnd() * Math.PI * 2;
				const g = (rnd() + rnd() + rnd() - 1.5) * 0.16;
				v.copy(b1).multiplyScalar(Math.cos(a)).addScaledVector(b2, Math.sin(a)).addScaledVector(bn, g).normalize();
				mag[i] = Math.pow(rnd(), 9) * 0.7;
			} else {
				const z = rnd() * 2 - 1;
				const a = rnd() * Math.PI * 2;
				const s = Math.sqrt(1 - z * z);
				v.set(s * Math.cos(a), z, s * Math.sin(a));
				mag[i] = Math.pow(rnd(), 7);
			}
			pos.set([v.x, v.y, v.z], i * 3);
			const temp = rnd();
			const cc = temp < 0.2 ? [0.75, 0.83, 1] : temp > 0.85 ? [1, 0.84, 0.66] : [1, 0.97, 0.93];
			col.set(cc, i * 3);
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
		geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
		const mat = new THREE.ShaderMaterial({
			vertexShader: STARS_VERT,
			fragmentShader: STARS_FRAG,
			uniforms: { uPx: { value: 1 }, uFade: { value: 1 } },
			blending: THREE.AdditiveBlending,
			depthTest: false,
			depthWrite: false,
			transparent: true
		});
		this.disposables.push(geo, mat);
		const pts = new THREE.Points(geo, mat);
		pts.frustumCulled = false;
		return pts;
	}

	// ------------------------------------------------------------------ lifecycle

	private onLost = (e: Event) => {
		e.preventDefault();
		this.lost = true;
		this.opts.onContextLost();
	};

	private onRestored = () => {
		this.lost = false;
		for (const t of [this.ovTex, this.heatTex, this.placeholder, ...this.detailTex]) if (t) t.needsUpdate = true;
		this.resize();
		this.opts.onContextRestored();
	};

	private onVis = () => {
		if (document.visibilityState === 'visible') {
			this.last = performance.now();
			this.invalidate();
		}
	};

	dispose() {
		this.destroyed = true;
		cancelAnimationFrame(this.raf);
		this.flight?.resolve?.();
		this.canvas.removeEventListener('webglcontextlost', this.onLost);
		this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
		document.removeEventListener('visibilitychange', this.onVis);
		this.controls.dispose();
		for (const m of this.patch) {
			if (!m) continue;
			m.geometry.dispose();
			(m.material as THREE.Material).dispose();
		}
		for (const t of [this.ovTex, this.heatTex, ...this.detailTex]) t?.dispose();
		for (const d of this.disposables) d.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
		this.canvas.remove();
	}
}
