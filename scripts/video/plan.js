// AI-assisted: written with Claude, reviewed by the team.
// Shot plan for the 30 s demo video, evaluated inside the app page by scripts/video/capture.mjs.
// ONE continuous camera move: orbit parameters (target, distance, elevation, azimuth, field of
// view) are keyed in time and joined by a cubic Hermite spline with time-based tangents, so the
// camera never stops between keys. The time cursor, heat layers, overlays and captions run off
// the same clock. Plain browser JS (no imports). All numbers shown are the app's own results.
(() => {
	const V = window.__vid;
	const { app, eng } = V;
	const R = 1737.4;
	const D2R = Math.PI / 180;
	const HOUR0 = Date.UTC(2026, 10, 1); // ephemeris index 0

	// ------------------------------------------------------------ geometry helpers
	const mapXY = (lat, lon) => V.latLonToXY(lat, lon).map((v) => v / 1000); // km
	const groundM = (mx, my) => eng.hf.heightM(mx, my);
	const S = (mx, my, altM) => V.surfaceAt(mx, my, altM / 1000); // scene point, altitude above sphere in m
	const clamp01 = (k) => Math.max(0, Math.min(1, k));
	const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
	const smoother = (k) => { k = clamp01(k); return k * k * k * (k * (k * 6 - 15) + 10); };
	const lerp = (a, b, k) => a + (b - a) * k;
	const ramp = (t, a, b) => smooth((t - a) / (b - a));

	const C1 = { lat: -89.4398, lon: 222.83 };
	const c1xy = mapXY(C1.lat, C1.lon);
	const shXY = mapXY(-89.67, 129.78); // Shackleton floor

	// Sun / Earth elevation and azimuth at C1 for an ephemeris index
	function skyAt(idx) {
		const { sunDir, earthKm } = V.ephemAt(app.eph, idx);
		const la = C1.lat * D2R, lo = C1.lon * D2R;
		const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
		const rk = R + 1.96;
		const e = [earthKm[0] - up[0] * rk, earthKm[1] - up[1] * rk, earthKm[2] - up[2] * rk];
		const n = Math.hypot(...e);
		const eu = e.map((v) => v / n);
		const el = (d) => Math.asin(d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / D2R;
		return { sunEl: el(sunDir), earthEl: el(eu), sunScene: V.dirToScene(sunDir), earthScene: V.dirToScene(eu) };
	}
	// scene direction -> map-plane azimuth (rad, 0 = map +X, CCW); scene +X = map +X, scene -Z = map +Y
	const mapAz = (d) => Math.atan2(-d[2], d[0]);

	// ------------------------------------------------------------ pick the moment T* (lands at 14 s)
	// Sun up at C1 and Earth a few degrees above its horizon, Sun and Earth well apart in azimuth
	let TSTAR = 14 * 24;
	{
		let best = -1e9;
		for (let i = 14 * 24; i < 75 * 24; i++) {
			const s = skyAt(i);
			if (s.sunEl < 1.0 || s.earthEl < 2.5 || s.earthEl > 6) continue;
			let dAz = Math.abs(mapAz(s.sunScene) - mapAz(s.earthScene));
			if (dAz > Math.PI) dAz = 2 * Math.PI - dAz;
			const score = s.sunEl * 2 + Math.min(dAz, 1.6) * 3 - Math.abs(s.earthEl - 4);
			if (score > best) { best = score; TSTAR = i; }
		}
	}
	const sky = skyAt(TSTAR);
	const earthAz = mapAz(sky.earthScene);

	// time-lapse speed profile (days per second); integrate so that t = 14 s lands on T*
	const speed = (t) => (t < 2 ? 0.05 : t < 4 ? lerp(0.05, 1, smooth((t - 2) / 2)) : t < 5 ? lerp(1, 3, smooth(t - 4)) : t < 11 ? 3 : t < 14 ? 3 * (1 - smoother((t - 11) / 3)) : 0);
	const daysTo = (t) => { let s = 0; const n = Math.ceil(t * 120); for (let i = 0; i < n; i++) s += speed((i + 0.5) / 120) / 120; return s; };
	const LAPSE = daysTo(14);
	const T0 = TSTAR - LAPSE * 24;
	const timeAt = (t) => (t >= 14 ? TSTAR : T0 + daysTo(t) * 24);

	// ------------------------------------------------------------ camera keys (orbit parameters)
	// azimuths count up toward the final shot, which looks from behind C1 at Earth
	const AF = earthAz + Math.PI; // camera sits opposite Earth
	const deg = (d) => d * D2R;
	const toward = (k) => [c1xy[0] + Math.cos(earthAz) * k, c1xy[1] + Math.sin(earthAz) * k];
	const finTarget = toward(30); // a ground point 30 km beyond C1 toward Earth
	const finCam = toward(-2.6); // 2.6 km behind the crest
	const finCamAlt = Math.max(groundM(...finCam), groundM(...c1xy)) + 420;
	const finDist = Math.hypot(finTarget[0] - finCam[0], finTarget[1] - finCam[1]);
	// look slightly below Earth so it sits in the upper part of the frame, above the end card
	const pitch = (sky.earthEl - 2.4) * D2R;
	const finElev = -pitch; // camera below its (airborne) target -> looks slightly up
	const finTgAlt = finCamAlt + finDist * 1000 * Math.tan(pitch) - groundM(...finTarget); // m above ground
	const keys = [
		// t, target(map km), dist km, elev, az, fov
		{ t: 0, tg: [0, 0], d: 270, el: deg(76), az: AF - deg(300), fov: 45 },
		{ t: 4, tg: [shXY[0] * 0.6, shXY[1] * 0.6], d: 120, el: deg(54), az: AF - deg(262), fov: 45 },
		{ t: 6.6, tg: [lerp(shXY[0], c1xy[0], 0.45), lerp(shXY[1], c1xy[1], 0.45)], d: 52, el: deg(30), az: AF - deg(220), fov: 45 },
		{ t: 9, tg: c1xy, d: 22, el: deg(17), az: AF - deg(190), fov: 45 },
		{ t: 14, tg: c1xy, d: 10.5, el: deg(11), az: AF - deg(160), fov: 45 },
		{ t: 16.5, tg: c1xy, d: 20, el: deg(40), az: AF - deg(132), fov: 45 },
		{ t: 20.5, tg: c1xy, d: 23, el: deg(44), az: AF - deg(92), fov: 45 },
		{ t: 23.5, tg: c1xy, d: 14, el: deg(27), az: AF - deg(55), fov: 42 },
		{ t: 27.2, tg: finTarget, ta: finTgAlt, d: finDist, el: finElev, az: AF, fov: 17 },
		{ t: 30, tg: finTarget, ta: finTgAlt, d: finDist - 0.25, el: finElev, az: AF, fov: 15.5 }
	];
	// scalar channels for the spline
	const ch = (k) => [k.tg[0], k.tg[1], Math.log(k.d), k.el, k.az, k.fov, k.ta ?? 0];
	const P = keys.map(ch);
	const T = keys.map((k) => k.t);
	const tang = P.map((p, i) => p.map((_, j) => {
		if (i === P.length - 1) return 0; // come to rest
		if (i === 0) return ((P[1][j] - P[0][j]) / (T[1] - T[0])) * 0.5; // already moving on frame 0
		return (P[i + 1][j] - P[i - 1][j]) / (T[i + 1] - T[i - 1]);
	}));
	function spline(t) {
		let i = 0;
		while (i < T.length - 2 && t > T[i + 1]) i++;
		const h = T[i + 1] - T[i];
		const u = clamp01((t - T[i]) / h);
		const u2 = u * u, u3 = u2 * u;
		const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
		return P[i].map((_, j) => h00 * P[i][j] + h10 * h * tang[i][j] + h01 * P[i + 1][j] + h11 * h * tang[i + 1][j]);
	}
	function camAt(t) {
		const [tx, ty, ld, el, az, fov, ta] = spline(t);
		const d = Math.exp(ld);
		const g = groundM(tx, ty) + ta;
		const cx = tx + d * Math.cos(el) * Math.cos(az);
		const cy = ty + d * Math.cos(el) * Math.sin(az);
		const alt = g + d * Math.sin(el) * 1000;
		return { pos: S(cx, cy, alt), look: S(tx, ty, g), fov };
	}
	function setCamera(c) {
		const cam = eng.camera;
		cam.position.set(...c.pos);
		const up = [c.pos[0], c.pos[1] + R, c.pos[2]];
		const n = Math.hypot(...up);
		cam.up.set(up[0] / n, up[1] / n, up[2] / n);
		eng.controls.target.set(...c.look);
		cam.fov = c.fov;
		cam.lookAt(...c.look);
		cam.updateProjectionMatrix();
		eng.invalidate();
	}

	// ------------------------------------------------------------ overlay
	const css = document.createElement('style');
	css.textContent = `
		body * { visibility: hidden !important; }
		canvas[data-vid], #vid, #vid * { visibility: visible !important; }
		#vid { position: fixed; inset: 0; z-index: 9999; pointer-events: none; color: #fff; font-family: var(--font-display), system-ui, sans-serif; }
		#vid .vign { position: absolute; inset: 0; background: radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%); }
		#vid .cap { position: absolute; left: 0; right: 0; bottom: 8.5%; text-align: center; font-weight: 600; font-size: 54px; letter-spacing: -0.015em; line-height: 1.12; text-shadow: 0 2px 28px rgba(0,0,0,.9), 0 0 3px rgba(0,0,0,.9); }
		#vid .cap b { color: var(--c, #ffb547); font-weight: 600; }
		#vid .sub { display: block; margin-top: 14px; font: 500 21px var(--font-mono), monospace; letter-spacing: .06em; color: rgba(255,255,255,.75); }
		#vid .date { position: absolute; left: 56px; top: 48px; font: 500 22px var(--font-mono), monospace; letter-spacing: .08em; color: rgba(255,255,255,.85); text-shadow: 0 1px 12px rgba(0,0,0,.9); }
		#vid .date i { display: block; font-style: normal; font-size: 15px; color: rgba(255,255,255,.55); margin-bottom: 6px; letter-spacing: .14em; }
		#vid .chip { position: absolute; left: 56px; top: 48px; padding: 12px 18px; border-radius: 14px; background: rgba(10,13,20,.72); border: 1px solid rgba(255,255,255,.12); font: 500 18px var(--font-mono), monospace; letter-spacing: .05em; color: rgba(255,255,255,.8); }
		#vid .chip b { display: block; font: 600 22px var(--font-display), sans-serif; letter-spacing: 0; color: var(--c); margin-bottom: 4px; }
		#vid .bar { height: 8px; width: 330px; border-radius: 4px; margin-top: 10px; }
		#vid .mk { position: absolute; transform: translate(-50%, -100%); text-align: center; white-space: nowrap; }
		#vid .mk .pill { display: inline-flex; align-items: center; gap: 10px; padding: 8px 16px 8px 8px; border-radius: 999px; background: rgba(10,13,20,.78); border: 1px solid rgba(255,255,255,.16); font: 600 21px var(--font-display), sans-serif; }
		#vid .mk .pill i { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #fff; color: #0a0d14; font: 700 16px var(--font-display); font-style: normal; }
		#vid .mk .val { margin-top: 8px; font: 600 44px var(--font-display), sans-serif; color: var(--c); text-shadow: 0 2px 20px rgba(0,0,0,.9); font-variant-numeric: tabular-nums; }
		#vid .mk .stem { width: 2px; height: 46px; margin: 6px auto 0; background: linear-gradient(rgba(255,255,255,.9), rgba(255,255,255,0)); }
		#vid .mk .dot { width: 14px; height: 14px; border-radius: 50%; margin: -2px auto 0; background: #fff; box-shadow: 0 0 0 5px rgba(255,255,255,.25); transform: translateY(50%); }
		#vid .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 150px; text-align: center; }
		#vid .end h1 { margin: 0; font: 600 92px var(--font-display), sans-serif; letter-spacing: -0.03em; text-shadow: 0 4px 40px rgba(0,0,0,.8); }
		#vid .end p { margin: 14px 0 0; font: 400 34px var(--font-display), sans-serif; color: rgba(255,255,255,.85); }
		#vid .end .url { margin-top: 34px; font: 500 34px var(--font-mono), monospace; color: #ffb547; }
		#vid .end .team { margin-top: 16px; font: 500 22px var(--font-display), sans-serif; color: rgba(255,255,255,.7); letter-spacing: .02em; }
		#vid .ai { position: absolute; right: 30px; bottom: 22px; font: 500 15px var(--font-mono), monospace; letter-spacing: .06em; color: rgba(255,255,255,.6); text-shadow: 0 1px 6px rgba(0,0,0,.9); }
		#vid .black { position: absolute; inset: 0; background: #000; }
	`;
	document.head.appendChild(css);
	eng.renderer.domElement.setAttribute('data-vid', '');
	const root = document.createElement('div');
	root.id = 'vid';
	root.innerHTML = `
		<div class="vign"></div>
		<div class="date"><i>TIME-LAPSE · UTC</i><span></span></div>
		<div class="chip"><b></b><span></span><div class="bar"></div></div>
		<div class="mk"><div class="pill"><i>A</i>Connecting Ridge (C1)</div><div class="val"></div><div class="stem"></div><div class="dot"></div></div>
		<div class="cap"></div>
		<div class="end"><h1>Lunar Landing Site Navigator</h1><p>Where and when to land at the lunar south pole.</p><div class="url">space.mindal1ka.com</div><div class="team">✦ IT STEP Poltava × Mindal1ka.com ✦</div></div>
		<div class="ai">AI-assisted · real app render, NASA LOLA + JPL/NAIF data</div>
		<div class="black"></div>`;
	document.body.appendChild(root);
	const $ = (s) => root.querySelector(s);
	const capEl = $('.cap'), dateEl = $('.date'), dateTxt = $('.date span'), chipEl = $('.chip'), mkEl = $('.mk'), valEl = $('.mk .val'), endEl = $('.end'), blackEl = $('.black');

	const SUN = '#ffb547', EARTH = '#5cc8ff', NIGHT = '#a58bff';
	const PERIOD = 'Nov 2026 – Nov 2027 · Panel/antenna height: 2 m';
	const caps = [
		{ t0: 0.6, t1: 3.8, html: 'Sunlight at the pole skims the horizon' },
		{ t0: 4.9, t1: 8.7, html: 'A few hundred metres change everything' },
		{ t0: 15.1, t1: 18.9, html: `Connecting Ridge C1: <b style="--c:${SUN}">87%</b> in sunlight`, sub: PERIOD },
		{ t0: 19.3, t1: 23.4, html: `Earth in view <b style="--c:${EARTH}">49%</b> · Longest night <b style="--c:${NIGHT}">9.1 days</b>`, sub: PERIOD },
		{ t0: 24.3, t1: 27.1, html: 'Validated vs JPL Horizons and NASA LOLA', sub: 'ephemeris 0.1″ max difference · illumination map 1.0 pp mean error' }
	];
	function caption(t) {
		const c = caps.find((c) => t >= c.t0 && t < c.t1);
		if (!c) { capEl.style.opacity = '0'; return; }
		const a = Math.min(smooth((t - c.t0) / 0.45), smooth((c.t1 - t) / 0.45));
		const html = c.html + (c.sub ? `<span class="sub">${c.sub}</span>` : '');
		if (capEl.dataset.k !== c.html) { capEl.innerHTML = html; capEl.dataset.k = c.html; }
		capEl.style.opacity = String(a);
		capEl.style.transform = `translateY(${(1 - a) * 16}px)`;
		capEl.style.filter = `blur(${(1 - a) * 6}px)`;
	}
	const fmtDate = (idx) => {
		const d = new Date(HOUR0 + idx * 3600000);
		const m = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
		return `${String(d.getUTCDate()).padStart(2, '0')} ${m} ${d.getUTCFullYear()} · ${String(d.getUTCHours()).padStart(2, '0')}:00`;
	};

	// heat layers drawn by the terrain shader: (from, to, mix); 0 off, 1 sun, 2 earth, 3 night
	const layers = eng.U.uHeatLayers.value;
	function heat(t) {
		const seq = [[14.0, 0, 1], [19.0, 1, 2], [21.0, 2, 3], [23.6, 3, 0]];
		let from = 0, to = 0, mix = 0;
		for (const [ts, f, tt] of seq) if (t >= ts) { from = f; to = tt; mix = smooth((t - ts) / (ts === 14 ? 1.6 : 1.1)); }
		layers.set(from, to, mix);
		return mix < 0.5 ? from : to;
	}
	const LEG = {
		1: { c: SUN, name: 'Sunlight', txt: 'share of time in sunlight', grad: V.rampCss('sun') },
		2: { c: EARTH, name: 'Earth in view', txt: 'share of time with Earth above the horizon', grad: V.rampCss('earth') },
		3: { c: NIGHT, name: 'Longest night', txt: 'longest stretch with no Sun, days', grad: V.rampCss('night') }
	};
	const VALS = { 1: ['87%', 'in sunlight', 87, '%'], 2: ['49%', 'Earth in view', 49, '%'], 3: ['9.1 days', 'longest night', 9.1, ' days'] };

	const c1Scene = () => S(c1xy[0], c1xy[1], groundM(...c1xy));
	function marker(t, layer) {
		const a = Math.min(ramp(t, 7.4, 8.4), 1 - ramp(t, 23.8, 24.6));
		if (a <= 0.001) { mkEl.style.opacity = '0'; return; }
		const p = new eng.camera.position.constructor(...c1Scene()).project(eng.camera);
		const x = (p.x * 0.5 + 0.5) * innerWidth, y = (-p.y * 0.5 + 0.5) * innerHeight;
		mkEl.style.left = `${x}px`;
		mkEl.style.top = `${y}px`;
		mkEl.style.opacity = String(a);
		if (layer && t >= 14.6) {
			const [, label, v, unit] = VALS[layer];
			const L = LEG[layer];
			// count up on the first reveal, then switch values with the layer
			const k = layer === 1 ? smoother((t - 15.0) / 2.0) : 1;
			const shown = layer === 3 ? (v * k).toFixed(1) : Math.round(v * k);
			valEl.innerHTML = `${shown}${unit}<span style="font-size:20px;color:rgba(255,255,255,.75);display:block;font-weight:500;margin-top:2px">${label}</span>`;
			valEl.style.setProperty('--c', L.c);
			valEl.style.opacity = String(ramp(t, 14.6, 15.0));
		} else valEl.style.opacity = '0';
	}

	window.__plan = {
		info: () => ({ TSTAR, date: fmtDate(TSTAR), sunEl: sky.sunEl, earthEl: sky.earthEl, lapseDays: LAPSE }),
		setup() {
			eng.cancelFlight();
			// the app keeps the orbit above the horizon; the final shot looks slightly up at Earth
			Object.assign(eng.controls, { maxPolarAngle: Math.PI, minPolarAngle: 0, minDistance: 0.01, maxDistance: 1e5, enableDamping: false });
			app.heatLayer = 'sun'; // loads the layer and the 100 m squares once; the mix is driven per frame below
			app.exaggeration = 1;
			// let shaders recompile and textures upload in real time before the first captured frame
			return (async () => {
				const end = Date.now() + 4000; // page clock: advances with each __step below
				while (Date.now() < end || eng.compiling) {
					await new Promise((r) => setTimeout(r, 16));
					window.__step(16.67);
				}
				return 30;
			})();
		},
		async frame(t, dtMs) {
			app.t = timeAt(t);
			setCamera(camAt(t));
			const layer = heat(t);
			caption(t);
			// date counter during the time-lapse
			const da = Math.min(ramp(t, 1.6, 2.4), 1 - ramp(t, 13.6, 14.2));
			dateEl.style.opacity = String(da);
			dateTxt.textContent = fmtDate(app.t);
			// legend chip while a layer is on
			const ca = Math.min(ramp(t, 14.4, 15.0), 1 - ramp(t, 23.6, 24.2));
			chipEl.style.opacity = String(ca);
			if (ca > 0 && layer) {
				const L = LEG[layer];
				chipEl.style.setProperty('--c', L.c);
				chipEl.querySelector('b').textContent = L.name;
				chipEl.querySelector('span').textContent = `${L.txt} · 2 m · Nov 2026 – Nov 2027`;
				chipEl.querySelector('.bar').style.background = L.grad;
			}
			marker(t, layer);
			// end card, darken under it, fades
			const ea = ramp(t, 27.4, 28.1);
			endEl.style.opacity = String(ea);
			endEl.style.transform = `translateY(${(1 - ea) * 18}px)`;
			eng.U.uExposure.value = 1.15 * (1 - 0.2 * ea);
			blackEl.style.opacity = String(Math.max(1 - smooth(t / 0.5), ramp(t, 29.55, 30)));
			await new Promise((r) => setTimeout(r, 0)); // let Svelte effects run (Sun, Earth)
			eng.renderer.getContext().finish();
			window.__step(dtMs);
		}
	};
})();
