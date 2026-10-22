import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { productionBuildEnv } from './build-env.ts';

/**
 * Serves the built player (packages/player/dist/app) on 127.0.0.1 with the CSP
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

/** Every page a complete player build has, plus its `_headers`. */
const PLAYER_PAGES = ['index', 'deck', 'page', 'doc'] as const;

/** A lock older than this is from a crashed run and is taken over. */
const STALE_LOCK_MS = 10 * 60_000;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * The one way tests get a built player: rebuild unless every kind page and
 * `_headers` exist (an older dist without the kind pages is stale), and build
 * for production. Vitest sets NODE_ENV=test, which would bundle Svelte's dev
 * runtime and leave a larger dist behind for the budget suites. Test files run
 * in parallel processes, so one lock per checkout serializes the build: the
 * others wait for it and reuse its dist instead of reading a half-written one
 * (the lock is keyed by the resolved root, so `repo` and `repo/` share it).
 */
export function ensurePlayerBuild(root: string): string {
  const dist = join(root, 'packages/player/dist/app');
  const lock = join(
    tmpdir(),
    `protoyard-player-build-${createHash('sha256').update(resolve(root)).digest('hex').slice(0, 12)}.lock`
  );
  const complete = () =>
    PLAYER_PAGES.every((name) => existsSync(join(dist, `${name}.html`))) &&
    existsSync(join(dist, '_headers'));
  if (complete() && !existsSync(lock)) return dist;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS)
          rmSync(lock, { recursive: true, force: true });
      } catch {
        // Released between the two calls.
      }
      sleepSync(250);
    }
  }
  try {
    if (!complete()) {
      const run = spawnSync('pnpm', ['--filter', '@protoyard/player', 'build'], {
        cwd: root,
        encoding: 'utf8',
        env: productionBuildEnv(),
      });
      if (run.status !== 0) throw new Error(`player build failed:\n${run.stderr}${run.stdout}`);
    }
  } finally {
    rmSync(lock, { recursive: true, force: true });
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
