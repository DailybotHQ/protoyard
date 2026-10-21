import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';

/**
 * Serves the built player (packages/player/dist) on 127.0.0.1 with the CSP
 * header from its `_headers`, plus extra same-origin files (blueprint
 * fixtures), on an OS-assigned port. Builds the player first when dist is
 * missing.
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

export function ensurePlayerBuild(root: string): string {
  const dist = join(root, 'packages/player/dist');
  if (!existsSync(join(dist, 'index.html'))) {
    const run = spawnSync('pnpm', ['--filter', '@protoyard/player', 'build'], {
      cwd: root,
      encoding: 'utf8',
    });
    if (run.status !== 0) throw new Error(`player build failed:\n${run.stderr}${run.stdout}`);
  }
  return dist;
}

export async function serveDist(
  dist: string,
  extra: Record<string, string> = {}
): Promise<{ origin: string; server: Server }> {
  const headers = readFileSync(join(dist, '_headers'), 'utf8');
  const csp = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? '';
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent((request.url ?? '/').split('?')[0] as string));
    const file = extra[path] ?? join(dist, path === '/' ? 'index.html' : path);
    if (
      (!extra[path] && !file.startsWith(dist)) ||
      !existsSync(file) ||
      statSync(file).isDirectory()
    ) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'content-security-policy': csp,
    });
    response.end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, server };
}
