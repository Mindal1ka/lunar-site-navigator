// AI-assisted: written with Claude, reviewed by the team.
// Frame-exact capture of the app's 3D scene for the demo video.
// The page clock (performance.now, requestAnimationFrame) is replaced by a manual one, so every
// frame is exactly 1/FPS s apart no matter how long the GPU and the screenshot take. A plan
// script (scripts/video/plan.js) moves the camera, the time cursor, the layers and the captions
// for each frame; frames go straight into ffmpeg (H.264).
// usage: node scripts/video/capture.mjs <out.mp4> [fps=60] [from_s=0] [to_s=plan end] [scale=1.5]
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [OUT = 'video/scene.mp4', FPS = '60', FROM = '0', TO = '', SCALE = '1.5'] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://127.0.0.1:44000';
const EXE = process.env.CHROME ?? 'C:/Users/A/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const FFMPEG = process.env.FFMPEG ?? 'D:/Nasa/.venv/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';
const W = 1920, H = 1080, fps = +FPS, dpr = +SCALE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9400 + Math.floor(Math.random() * 300);
const chrome = spawn(EXE, [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'vid-'))}`, '--use-angle=d3d11', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => chrome.kill('SIGKILL'));
for (let i = 0; i < 75; i++) { try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (m) => {
	const d = JSON.parse(m.data);
	if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
	else if (d.method === 'Runtime.exceptionThrown') console.error('page exception:', d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
	else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') console.error('page error:', d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 600));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }).then((d) => { if (d.error) throw new Error(method + ': ' + d.error.message); return d.result; });
const ev = async (expression) => {
	const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
	return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dpr, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
// manual clock: the page only moves when we call __step(ms)
await send('Page.addScriptToEvaluateOnNewDocument', {
	source: `(() => {
		let T = 0, q = [], nid = 0;
		performance.now = () => T;
		const D0 = Date.now(); Date.now = () => D0 + T;
		window.requestAnimationFrame = (cb) => { q.push([++nid, cb]); return nid; };
		window.cancelAnimationFrame = (h) => { q = q.filter((e) => e[0] !== h); };
		window.__step = (ms) => { T += ms; const run = q; q = []; for (const [, cb] of run) { try { cb(T); } catch (e) { console.error(e); } } };
		window.__now = () => T;
	})();`
});
// VLANG=uk renders the Ukrainian captions (and the app itself in Ukrainian)
const VLANG = process.env.VLANG === 'uk' ? 'uk' : 'en';
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__vidLang = '${VLANG}';` });
await send('Page.navigate', { url: `${BASE}/?debug&q=high&lang=${VLANG}&a=connecting-ridge-c1` });

// warm-up in (almost) real time: load data, compile shaders, play the app's own intro, load heat maps
const until = Date.now() + 40000;
let ready = false;
while (Date.now() < until) {
	await sleep(16);
	ready = await ev(`(() => { if (!window.__step) return false; __step(16.67); const v = window.__vid; return !!(v && v.introDone() && v.app.heatmap && !v.eng.compiling); })()`).catch(() => false);
	if (ready) break;
}
if (!ready) console.warn('warm-up timed out; continuing');
// a little more settle time for detail tiles and squares
for (let i = 0; i < 180; i++) { await sleep(8); await ev('__step(16.67)'); }

if (process.env.PROBE) {
	if (process.env.PROBE_T) {
		await ev(readFileSync(new URL('./plan.js', import.meta.url), 'utf8'));
		await ev('__plan.setup()');
		console.log(JSON.stringify(await ev('__plan.info()')));
		const ts = process.env.PROBE_T.split(',').map(Number);
		if (ts.length > 1) {
			for (const [k, tt] of ts.entries()) {
				for (let i = 0; i < 40; i++) await ev(`__plan.frame(${tt - (39 - i) / 60}, 16.67)`);
				if (process.env.PROBE_JS) console.log(tt, await ev(process.env.PROBE_JS));
				const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
				(await import('node:fs')).writeFileSync(process.env.PROBE.replace('.jpg', `_${k}.jpg`), Buffer.from(data, 'base64'));
			}
			process.exit(0);
		}
		for (let i = 0; i <= 3; i++) await ev(`__plan.frame(${+process.env.PROBE_T}, 16.67)`);
		if (process.env.PROBE_NOCSS) await ev(`document.querySelectorAll('style').forEach(s=>{ if (s.textContent.includes('#vid')) s.remove() }); document.getElementById('vid').remove(); __step(16.67)`);
	}
	console.log(await ev(`JSON.stringify({ intro: __vid.introDone(), heat: !!__vid.app.heatmap, compiling: __vid.eng.compiling, cam: __vid.eng.camera.position.toArray().map(v=>+v.toFixed(2)), canv: [...document.querySelectorAll('canvas')].map(c=>c.width+'x'+c.height+' '+getComputedStyle(c).visibility+' '+c.getBoundingClientRect().width), t: __now() })`));
	const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
	(await import('node:fs')).writeFileSync(process.env.PROBE, Buffer.from(data, 'base64'));
	process.exit(0);
}
await ev(readFileSync(new URL('./plan.js', import.meta.url), 'utf8'));
const DUR = await ev('__plan.setup()');
const f0 = Math.round(+FROM * fps), f1 = Math.round((TO ? +TO : DUR) * fps);
console.log(`capturing ${f1 - f0} frames at ${fps} fps (${W}x${H} @${dpr}x)`);

const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
	'-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'film', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });

const t0 = Date.now();
for (let f = f0; f < f1; f++) {
	// plan sets state for time t, then one manual frame: finish the GPU first so the engine never skips a draw
	await ev(`__plan.frame(${f / fps}, ${1000 / fps})`);
	const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: false });
	if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
	if ((f - f0) % 60 === 0) console.log(`frame ${f - f0}/${f1 - f0}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('exit', r));
console.log(`done: ${OUT} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(0);
