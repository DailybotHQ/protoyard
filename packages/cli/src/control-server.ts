import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { checkSlug } from '@protoyard/core';
import { type DevServerHandle, startDevServer } from './lib/dev-server.ts';
import { workspacePaths } from './lib/paths.ts';
import { findEntry, loadRegistry } from './lib/registry.ts';
import { CLI_VERSION } from './lib/workspace.ts';

/**
 * Tiny local control API used by the gallery in `pnpm dev`:
 *
 *   GET  /api/status       → running dev servers
 *   POST /api/dev/:slug    → start that prototype's Vite dev server, return its URL
 *   POST /api/stop/:slug   → stop it
 *
 * Safety model: bound to 127.0.0.1 only; the Host header must be loopback
 * (DNS-rebinding guard); POSTs need an allow-listed Origin (a random website
 * cannot drive it); only slugs present in the registry are accepted, and
 * nothing is ever passed to a shell.
 */

export const DEFAULT_CONTROL_PORT = 4300;
export const DEFAULT_GALLERY_PORT = 4321;
const MAX_RUNNING = 8;

export interface ControlServerOptions {
  root: string;
  port?: number;
  /** Exact origins allowed to call the API (scheme://host:port). */
  allowedOrigins?: readonly string[];
  /** Injected for tests; defaults to spawning Vite. */
  start?: (input: { root: string; dir: string; slug: string }) => Promise<DevServerHandle>;
  log?: (line: string) => void;
}

export interface ControlServer {
  server: Server;
  port: number;
  url: string;
  running(): { slug: string; url: string; port: number; startedAt: string }[];
  close(): Promise<void>;
}

export function defaultAllowedOrigins(galleryPort = DEFAULT_GALLERY_PORT): string[] {
  return [`http://localhost:${galleryPort}`, `http://127.0.0.1:${galleryPort}`];
}

function send(res: ServerResponse, status: number, body: unknown, origin?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

export async function startControlServer(options: ControlServerOptions): Promise<ControlServer> {
  const paths = workspacePaths(options.root);
  const allowed = new Set(options.allowedOrigins ?? defaultAllowedOrigins());
  const log = options.log ?? (() => {});
  const start = options.start ?? ((input) => startDevServer({ ...input, stdio: 'pipe' }));
  const servers = new Map<string, DevServerHandle>();
  const pending = new Map<string, Promise<DevServerHandle>>();
  let port = options.port ?? DEFAULT_CONTROL_PORT;

  const running = () =>
    [...servers.values()].map((s) => ({
      slug: s.slug,
      url: s.url,
      port: s.port,
      startedAt: s.startedAt,
    }));

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    const host = (req.headers.host ?? '').toLowerCase();
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      send(res, 403, { ok: false, error: 'forbidden host' });
      return;
    }
    if (origin !== undefined && !allowed.has(origin)) {
      send(res, 403, { ok: false, error: 'forbidden origin' });
      return;
    }
    const corsOrigin = origin && allowed.has(origin) ? origin : undefined;
    const url = new URL(req.url ?? '/', `http://${host}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' } : {}),
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      send(res, 200, { ok: true, version: CLI_VERSION, running: running() }, corsOrigin);
      return;
    }
    const match = /^\/api\/(dev|stop)\/([^/]+)$/.exec(url.pathname);
    if (req.method !== 'POST' || !match) {
      send(res, 404, { ok: false, error: 'not found' }, corsOrigin);
      return;
    }
    // State-changing calls must come from the gallery page, not from curl-less
    // cross-site forms: require an allow-listed Origin.
    if (!corsOrigin) {
      send(res, 403, { ok: false, error: 'origin required' });
      return;
    }
    const [, verb, rawSlug] = match;
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawSlug ?? '');
    } catch {
      send(res, 400, { ok: false, error: 'malformed slug' }, corsOrigin);
      return;
    }
    const slugCheck = checkSlug(decoded);
    if (!slugCheck.ok) {
      send(res, 400, { ok: false, error: slugCheck.reason }, corsOrigin);
      return;
    }
    const slug = slugCheck.slug;

    if (verb === 'stop') {
      const server = servers.get(slug);
      if (server) {
        await server.stop();
        servers.delete(slug);
        log(`stopped ${slug}`);
      }
      send(res, 200, { ok: true, slug, stopped: Boolean(server) }, corsOrigin);
      return;
    }

    const existing = servers.get(slug);
    if (existing) {
      send(
        res,
        200,
        { ok: true, slug, url: existing.url, port: existing.port, reused: true },
        corsOrigin
      );
      return;
    }
    const registry = await loadRegistry(paths);
    const entry = findEntry(registry, slug, 'prototype');
    if (!entry) {
      send(res, 404, { ok: false, error: `unknown prototype "${slug}"` }, corsOrigin);
      return;
    }
    if (servers.size + pending.size >= MAX_RUNNING && !pending.has(slug)) {
      send(
        res,
        429,
        { ok: false, error: `at most ${MAX_RUNNING} prototypes can run at once; stop one first` },
        corsOrigin
      );
      return;
    }
    let starting = pending.get(slug);
    if (!starting) {
      starting = start({ root: options.root, dir: join(options.root, entry.path), slug });
      pending.set(slug, starting);
    }
    try {
      const server = await starting;
      servers.set(slug, server);
      server.exited.then(() => {
        if (servers.get(slug) === server) servers.delete(slug);
      });
      log(`started ${slug} at ${server.url}`);
      send(
        res,
        200,
        { ok: true, slug, url: server.url, port: server.port, reused: false },
        corsOrigin
      );
    } catch (error) {
      send(res, 500, { ok: false, error: (error as Error).message }, corsOrigin);
    } finally {
      pending.delete(slug);
    }
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) send(res, 500, { ok: false, error: (error as Error).message });
    });
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolvePromise());
  });
  const address = server.address();
  if (address && typeof address === 'object') port = address.port;

  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    running,
    async close() {
      await Promise.all([...servers.values()].map((s) => s.stop()));
      servers.clear();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
