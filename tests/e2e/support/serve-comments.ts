/**
 * Serves a static prototype build AND the shared comments API on one origin,
 * for the review E2E's "two reviewers" project: `/api/comments/**` goes to
 * `handleCommentsRequest` (the same handler the Cloudflare Function uses) on
 * an in-memory store; everything else is a file from the build.
 *
 * Usage: tsx tests/e2e/support/serve-comments.ts <dir> <port>
 * Test-only: no key, no persistence (the store resets when the server stops).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import {
  createMemoryCommentsStore,
  handleCommentsRequest,
} from '../../../packages/review/src/server/index.ts';

const [dirArg, portArg] = process.argv.slice(2);
if (!dirArg || !portArg || !/^\d+$/.test(portArg)) {
  console.error('usage: serve-comments.ts <dir> <port>');
  process.exit(2);
}
const dir = resolve(dirArg);
const port = Number(portArg);
const store = createMemoryCommentsStore();
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith('/api/comments')) {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value);
    }
    const method = req.method ?? 'GET';
    const request = new Request(url, {
      method,
      headers,
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: await body(req) }),
    });
    const response = await handleCommentsRequest(request, {}, store);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  // Static files; any path outside the build folder is refused.
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = join(dir, relative);
  if (file !== dir && !file.startsWith(dir + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${dir} with /api/comments at http://127.0.0.1:${port}/`);
});
