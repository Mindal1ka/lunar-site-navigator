// AI-assisted: written with Claude, reviewed by the team.
// Post-build: write .br and .gz next to every compressible file in ./build.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const EXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.bin', '.txt', '.webmanifest']);
async function* walk(dir) {
	for (const e of await readdir(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) yield* walk(p);
		else yield p;
	}
}
let n = 0, raw = 0, br = 0;
for await (const f of walk('build')) {
	if (!EXT.has(extname(f))) continue;
	const buf = await readFile(f);
	if (buf.length < 1024) continue;
	const b = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
	await writeFile(f + '.br', b);
	await writeFile(f + '.gz', gzipSync(buf, { level: 9 }));
	n++; raw += buf.length; br += b.length;
}
console.log(`compressed ${n} files: ${(raw / 1e6).toFixed(1)} MB -> ${(br / 1e6).toFixed(1)} MB (br)`);
