// AI-assisted: written with Claude, reviewed by the team.
// Minimal zero-dependency static server for the built app (./build).
// - binds to 127.0.0.1 only; Caddy terminates HTTPS in front of it
// - serves pre-compressed .br / .gz siblings created by scripts/compress.mjs
// - proxies /api/* to the Python point API (pipeline/api.py)
// Usage: node serve.mjs   (PORT, HOST, API_PORT env vars override the defaults)
import { createServer, request } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 44000);
const HOST = process.env.HOST ?? '127.0.0.1';
const API_PORT = Number(process.env.API_PORT ?? 44001);
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
	'.woff2': 'font/woff2',
	'.webmanifest': 'application/manifest+json'
};

async function fileAt(path) {
	try {
		const s = await stat(path);
		if (s.isFile()) return { path, size: s.size };
		if (s.isDirectory()) return fileAt(join(path, 'index.html'));
	} catch {}
	return null;
}

function clientHeaders(req) {
	const h = { 'x-forwarded-for': String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '') };
	if (req.headers['cf-connecting-ip']) h['cf-connecting-ip'] = String(req.headers['cf-connecting-ip']);
	return h;
}

function proxyApi(req, res) {
	const up = request(
		{
			host: '127.0.0.1',
			port: API_PORT,
			path: req.url,
			method: 'GET',
			timeout: 60_000,
			// client address for the per-client limits of /api/square
			headers: clientHeaders(req)
		},
		(r) => {
			res.writeHead(r.statusCode ?? 502, r.headers);
			r.pipe(res);
		}
	);
	up.on('timeout', () => up.destroy(new Error('timeout')));
	up.on('error', () => {
		if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
		res.end('{"error":"Point service is unavailable"}');
	});
	up.end();
}

createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? '/', 'http://x');
		if (url.pathname.startsWith('/api/')) {
			if (req.method !== 'GET') return res.writeHead(405).end();
			return proxyApi(req, res);
		}
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
		const accept = String(req.headers['accept-encoding'] ?? '');
		let body = file;
		let encoding = null;
		for (const [enc, suffix] of [['br', '.br'], ['gzip', '.gz']]) {
			if (!accept.includes(enc)) continue;
			const c = await fileAt(file.path + suffix);
			if (c) {
				body = c;
				encoding = enc;
				break;
			}
		}
		const immutable = url.pathname.startsWith('/_app/immutable/');
		const headers = {
			'Content-Type': TYPES[ext] ?? 'application/octet-stream',
			'Content-Length': body.size,
			'Cache-Control': immutable
				? 'public, max-age=31536000, immutable'
				: ext === '.html'
					? 'no-cache'
					: 'public, max-age=3600',
			'X-Content-Type-Options': 'nosniff',
			Vary: 'Accept-Encoding'
		};
		if (encoding) headers['Content-Encoding'] = encoding;
		res.writeHead(200, headers);
		if (req.method === 'HEAD') return res.end();
		createReadStream(body.path).pipe(res);
	} catch (err) {
		console.error(err);
		res.writeHead(500).end();
	}
}).listen(PORT, HOST, () => console.log(`Serving ${ROOT} on http://${HOST}:${PORT}`));
