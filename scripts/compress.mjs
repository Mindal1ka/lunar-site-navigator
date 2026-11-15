// AI-assisted: written with Claude, reviewed by the team.
// Post-build: write .br and .gz next to every compressible file in ./build.
// Compressed copies are cached by content hash in .cache/compress (not in git), so an
// unchanged file (most of the terrain and map data) costs a copy, not a brotli-11 pass.
// New files are compressed in parallel on the libuv thread pool.
import { cpus } from 'node:os';
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(4, cpus().length));
const { readdir, readFile, writeFile, copyFile, mkdir, rename, stat } = await import('node:fs/promises');
const { existsSync } = await import('node:fs');
const { join, extname } = await import('node:path');
const { createHash } = await import('node:crypto');
const { promisify } = await import('node:util');
const zlib = await import('node:zlib');
const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

const EXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.bin', '.txt', '.webmanifest']);
const CACHE = '.cache/compress';
await mkdir(CACHE, { recursive: true });

async function* walk(dir) {
	for (const e of await readdir(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) yield* walk(p);
		else yield p;
	}
}

const files = [];
for await (const f of walk('build')) if (EXT.has(extname(f))) files.push(f);

let n = 0, hits = 0, raw = 0, br = 0;
async function one(f) {
	const buf = await readFile(f);
	if (buf.length < 1024) return;
	const key = join(CACHE, createHash('sha1').update(buf).digest('hex'));
	let b;
	if (existsSync(key + '.br') && existsSync(key + '.gz')) {
		await Promise.all([copyFile(key + '.br', f + '.br'), copyFile(key + '.gz', f + '.gz')]);
		b = { length: (await stat(key + '.br')).size };
		hits++;
	} else {
		const [bb, gz] = await Promise.all([
			brotli(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }),
			gzip(buf, { level: 9 })
		]);
		await Promise.all([writeFile(f + '.br', bb), writeFile(f + '.gz', gz)]);
		// write to a temp name first so an interrupted build never leaves a half-written cache entry
		await writeFile(key + '.br.tmp', bb);
		await writeFile(key + '.gz.tmp', gz);
		await rename(key + '.br.tmp', key + '.br');
		await rename(key + '.gz.tmp', key + '.gz');
		b = bb;
	}
	n++;
	raw += buf.length;
	br += b.length;
}

// bounded concurrency: enough to keep every thread-pool worker busy
let next = 0;
const LIMIT = Number(process.env.UV_THREADPOOL_SIZE) * 2;
await Promise.all(Array.from({ length: LIMIT }, async () => { while (next < files.length) await one(files[next++]); }));
console.log(`compressed ${n} files (${hits} from cache): ${(raw / 1e6).toFixed(1)} MB -> ${(br / 1e6).toFixed(1)} MB (br)`);
