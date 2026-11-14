// AI-assisted: written with Claude, reviewed by the team.
// Renders the /pitch page of a running site (print mode: all slides, final state, no controls)
// to static/pitch/lunar-landing-site-navigator-<lang>.pdf and per-slide PNGs, then builds the
// .pptx (one full-slide picture per slide) with scripts/pitch_pptx.py.
// usage: node scripts/pitch_export.mjs [http://127.0.0.1:44000] [chrome-or-headless-shell.exe]
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:44000';
const EXE = process.argv[3] ?? 'C:/Users/A/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const OUT = 'static/pitch';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9200 + Math.floor(Math.random() * 300);
const proc = spawn(EXE, [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pitch-'))}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => proc.kill('SIGKILL'));
for (let i = 0; i < 75; i++) { try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }).then((d) => { if (d.error) throw new Error(method + ': ' + d.error.message); return d.result; });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

for (const lang of ['en', 'uk']) {
	await send('Page.navigate', { url: `${BASE}/pitch?print=1&lang=${lang}` });
	await sleep(1500);
	await send('Runtime.evaluate', {
		expression: `(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r})));return 1})()`,
		awaitPromise: true
	});
	await sleep(800);
	const n = (await send('Runtime.evaluate', { expression: 'document.querySelectorAll(".slide").length', returnByValue: true })).result.value;
	const pdf = await send('Page.printToPDF', { printBackground: true, paperWidth: 20, paperHeight: 11.25, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, preferCSSPageSize: false });
	writeFileSync(join(OUT, `lunar-landing-site-navigator-${lang}.pdf`), Buffer.from(pdf.data, 'base64'));
	const dir = join(tmpdir(), `pitch-png-${lang}`);
	mkdirSync(dir, { recursive: true });
	await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
	for (let i = 0; i < n; i++) {
		const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: i * 1080, width: 1920, height: 1080, scale: 1 }, captureBeyondViewport: true });
		writeFileSync(join(dir, `s${i + 1}.png`), Buffer.from(data, 'base64'));
	}
	const py = existsSync('.venv/Scripts/python.exe') ? '.venv/Scripts/python.exe' : 'python';
	const r = spawnSync(py, ['scripts/pitch_pptx.py', dir, String(n), join(OUT, `lunar-landing-site-navigator-${lang}.pptx`)], { stdio: 'inherit' });
	if (r.status !== 0) throw new Error('pptx failed');
	console.log(`${lang}: ${n} slides -> pdf, pptx`);
}
// keep the running build in sync without a rebuild
if (existsSync('build/pitch')) for (const lang of ['en', 'uk']) for (const ext of ['pdf', 'pptx']) { const f = `lunar-landing-site-navigator-${lang}.${ext}`; copyFileSync(join(OUT, f), join('build/pitch', f)); }
process.exit(0);
