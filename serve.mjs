// AI-assisted: written with Claude, reviewed by the team.
// Minimal zero-dependency static server for the built app (./build).
// Binds to 127.0.0.1 only; Caddy terminates HTTPS in front of it.
// Usage: node serve.mjs   (PORT and HOST env vars override the defaults)
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 44000);
const HOST = process.env.HOST ?? '127.0.0.1';
const ROOT = resolve('build');
const FALLBACK = join(ROOT, '200.html');

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8',
	'.csv': 'text/csv; charset=utf-8',
	'.bin': 'application/octet-stream',
	'.woff2': 'font/woff2'
};

async function fileAt(path) {
	try {
		const s = await stat(path);
		if (s.isFile()) return { path, size: s.size };
		if (s.isDirectory()) return fileAt(join(path, 'index.html'));
	} catch {}
	return null;
}

createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? '/', 'http://x');
		const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
		const target = resolve(ROOT, rel);
		if (!target.startsWith(ROOT)) {
			res.writeHead(403).end();
			return;
		}
		let file = await fileAt(target);
		if (!file) {
			// Unknown asset -> 404; unknown route -> SPA fallback.
			if (extname(target)) {
				res.writeHead(404).end('Not found');
				return;
			}
			file = await fileAt(FALLBACK);
		}
		const ext = extname(file.path);
		const immutable = url.pathname.startsWith('/_app/immutable/');
		res.writeHead(200, {
			'Content-Type': TYPES[ext] ?? 'application/octet-stream',
			'Content-Length': file.size,
			'Cache-Control': immutable
				? 'public, max-age=31536000, immutable'
				: ext === '.html'
					? 'no-cache'
					: 'public, max-age=3600',
			'X-Content-Type-Options': 'nosniff'
		});
		if (req.method === 'HEAD') return res.end();
		createReadStream(file.path).pipe(res);
	} catch (err) {
		console.error(err);
		res.writeHead(500).end();
	}
}).listen(PORT, HOST, () => console.log(`Serving ${ROOT} on http://${HOST}:${PORT}`));
