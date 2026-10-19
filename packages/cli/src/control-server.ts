import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { checkSlug } from '@protoyard/core';
import { z } from 'zod';
import { type CreateInput, type CreateResult, createPrototypeFrom } from './commands/new.ts';
import { type DevServerHandle, startDevServer } from './lib/dev-server.ts';
import { CliError, createOutput, toCliError } from './lib/output.ts';
import { workspacePaths } from './lib/paths.ts';
import {
  findEntry,
  loadRegistry,
  type RegistryEntry,
  templateDemoNamespace,
} from './lib/registry.ts';
import { CLI_VERSION, createContext } from './lib/workspace.ts';

/**
 * Tiny local control API used by the gallery in `pnpm dev`:
 *
 *   GET  /api/status       → running dev servers
 *   POST /api/dev/:slug    → start that prototype or template's Vite dev server
 *   POST /api/stop/:slug   → stop it
 *   POST /api/new          → copy a template or prototype into a new slug
 *                            ({ slug, from, name?, description? }), link it
 *                            offline, start it and return its dev URL
 *
 * Templates run as live demos under a `template-demo-<name>` storage namespace
 * so demo data never mixes with prototypes and never lands in the template's
 * authoring namespace. The template folder itself is never written.
 *
 * Safety model: bound to 127.0.0.1 only; the Host header must be loopback
 * (DNS-rebinding guard); POSTs need an allow-listed Origin (a random website
 * cannot drive it); only slugs present in the registry are accepted, and
 * nothing is ever passed to a shell.
 */

export const DEFAULT_CONTROL_PORT = 4300;
export const DEFAULT_GALLERY_PORT = 4321;
const MAX_RUNNING = 8;
class LaunchError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Largest accepted POST /api/new body. */
const MAX_BODY_BYTES = 8 * 1024;

const NewRequestSchema = z
  .object({
    slug: z.string().min(1).max(64),
    from: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).optional(),
  })
  .strict();

const STATUS_BY_CODE: Record<string, number> = {
  usage: 400,
  unsafe_path: 400,
  not_found: 404,
  conflict: 409,
  validation: 422,
};

/** Reads a small JSON body; refuses other content types and oversized bodies. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json')
    throw new CliError('usage', 'Content-Type must be application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new CliError('usage', 'Request body too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new CliError('usage', 'Request body is not valid JSON.');
  }
}

export interface ControlServerOptions {
  root: string;
  port?: number;
  /** Exact origins allowed to call the API (scheme://host:port). */
  allowedOrigins?: readonly string[];
  /** Injected for tests; defaults to spawning Vite. */
  start?: (input: {
    root: string;
    dir: string;
    slug: string;
    kind: RegistryEntry['kind'];
    /** Storage namespace override (template demos). */
    storageNamespace?: string;
  }) => Promise<DevServerHandle>;
  log?: (line: string) => void;
  /**
   * How POST /api/new links the new prototype: `offline` (default) runs
   * `pnpm install --offline` and, when that is not enough, returns the
   * command to run instead of reaching the network. `skip` is for tests.
   */
  newInstall?: 'offline' | 'skip';
  /** Injected for tests; defaults to the same code path as `protoyard new`. */
  create?: (input: CreateInput) => Promise<CreateResult>;
  /**
   * Enables POST /api/new, which writes `prototypes/<slug>/`, installs and runs
   * the copy (ADR-013). Off by default: `control-server --allow-create` /
   * `gallery --allow-create` turn it on for one run.
   */
  allowCreate?: boolean;
  /** Per-run token for POST /api/new; random when omitted (tests inject one). */
  createToken?: string;
}

/** Header that carries the per-run create token (a custom header also forces preflight). */
export const CREATE_TOKEN_HEADER = 'x-protoyard-token';

/** Constant-time comparison; different lengths are a mismatch without comparing bytes. */
export function tokenMatches(expected: string, received: unknown): boolean {
  if (typeof received !== 'string' || received.length === 0) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface ControlServer {
  server: Server;
  port: number;
  url: string;
  running(): {
    slug: string;
    url: string;
    port: number;
    startedAt: string;
    kind?: RegistryEntry['kind'];
    storageNamespace?: string;
  }[];
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
  const allowCreate = options.allowCreate === true;
  // Never printed or logged: only allowed origins read it from GET /api/status.
  const createToken = options.createToken ?? randomBytes(32).toString('base64url');
  const log = options.log ?? (() => {});
  const start =
    options.start ??
    ((input) =>
      startDevServer({
        root: input.root,
        dir: input.dir,
        slug: input.slug,
        stdio: 'pipe',
        ...(input.storageNamespace ? { storageNamespace: input.storageNamespace } : {}),
      }));
  const servers = new Map<string, DevServerHandle>();
  const pending = new Map<string, Promise<DevServerHandle>>();
  /** Kind / demo namespace for each running slug (status payload). */
  const meta = new Map<string, { kind: RegistryEntry['kind']; storageNamespace?: string }>();
  let port = options.port ?? DEFAULT_CONTROL_PORT;
  // In-process, silent: the same code path as `protoyard new`, never a shell.
  const quiet = createOutput(
    { json: true, quiet: true, color: false },
    { stdout() {}, stderr() {} }
  );
  const create =
    options.create ??
    ((input: CreateInput) => createPrototypeFrom(createContext(options.root, quiet, true), input));
  /** One creation at a time: copies, installs and re-indexes never interleave. */
  let creating: Promise<unknown> = Promise.resolve();

  const running = () =>
    [...servers.values()].map((s) => {
      const info = meta.get(s.slug);
      return {
        slug: s.slug,
        url: s.url,
        port: s.port,
        startedAt: s.startedAt,
        ...(info?.kind ? { kind: info.kind } : {}),
        ...(info?.storageNamespace ? { storageNamespace: info.storageNamespace } : {}),
      };
    });

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
        // JSON bodies (POST /api/new) need the content-type header allowed, or browsers
        // reject the request after preflight. Only allowed origins get CORS headers at all.
        ...(corsOrigin
          ? {
              'Access-Control-Allow-Origin': corsOrigin,
              'Access-Control-Allow-Headers': `content-type, ${CREATE_TOKEN_HEADER}`,
              Vary: 'Origin',
            }
          : {}),
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      send(
        res,
        200,
        {
          ok: true,
          version: CLI_VERSION,
          running: running(),
          // The create token goes only to an allowed Origin (the gallery page), never to
          // curl or other tools without one, and only when creating is enabled.
          create:
            corsOrigin && allowCreate ? { enabled: true, token: createToken } : { enabled: false },
        },
        corsOrigin
      );
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/new') {
      if (!corsOrigin) {
        send(res, 403, { ok: false, error: 'origin required' });
        return;
      }
      if (!allowCreate) {
        send(
          res,
          403,
          {
            ok: false,
            error: 'creating prototypes from the gallery is disabled',
            hint: 'Restart with `pnpm protoyard gallery --allow-create` (or `control-server --allow-create`), or run `pnpm protoyard new <slug> --from <source>`.',
          },
          corsOrigin
        );
        return;
      }
      if (!tokenMatches(createToken, req.headers[CREATE_TOKEN_HEADER])) {
        send(res, 403, { ok: false, error: 'missing or invalid create token' }, corsOrigin);
        return;
      }
      await handleNew(req, res, corsOrigin);
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
        meta.delete(slug);
        log(`stopped ${slug}`);
      }
      send(res, 200, { ok: true, slug, stopped: Boolean(server) }, corsOrigin);
      return;
    }

    const existing = servers.get(slug);
    if (existing) {
      const info = meta.get(slug);
      send(
        res,
        200,
        {
          ok: true,
          slug,
          url: existing.url,
          port: existing.port,
          reused: true,
          kind: info?.kind ?? 'prototype',
          ...(info?.storageNamespace ? { storageNamespace: info.storageNamespace } : {}),
        },
        corsOrigin
      );
      return;
    }
    const registry = await loadRegistry(paths);
    // Prototypes first, then templates — same order as resolveTarget('runnable').
    const entry = findEntry(registry, slug, 'prototype') ?? findEntry(registry, slug, 'template');
    if (!entry) {
      send(res, 404, { ok: false, error: `unknown prototype or template "${slug}"` }, corsOrigin);
      return;
    }
    try {
      send(res, 200, { ok: true, ...(await launch(entry)) }, corsOrigin);
    } catch (error) {
      const status = error instanceof LaunchError ? error.status : 500;
      send(res, status, { ok: false, error: (error as Error).message }, corsOrigin);
    }
  }

  /** Starts (or reuses) the dev server of a registry entry. */
  async function launch(entry: RegistryEntry) {
    const slug = entry.slug;
    const existing = servers.get(slug);
    if (existing) {
      const info = meta.get(slug);
      return {
        slug,
        url: existing.url,
        port: existing.port,
        reused: true,
        kind: info?.kind ?? entry.kind,
        ...(info?.storageNamespace ? { storageNamespace: info.storageNamespace } : {}),
      };
    }
    if (servers.size + pending.size >= MAX_RUNNING && !pending.has(slug)) {
      throw new LaunchError(
        429,
        `at most ${MAX_RUNNING} prototypes or template demos can run at once; stop one first`
      );
    }
    const storageNamespace =
      entry.kind === 'template' ? templateDemoNamespace(entry.slug) : undefined;
    let starting = pending.get(slug);
    if (!starting) {
      starting = start({
        root: options.root,
        dir: join(options.root, entry.path),
        slug,
        kind: entry.kind,
        ...(storageNamespace ? { storageNamespace } : {}),
      });
      pending.set(slug, starting);
    }
    try {
      const server = await starting;
      servers.set(slug, server);
      meta.set(slug, {
        kind: entry.kind,
        ...(storageNamespace ? { storageNamespace } : {}),
      });
      server.exited.then(() => {
        if (servers.get(slug) === server) {
          servers.delete(slug);
          meta.delete(slug);
        }
      });
      log(
        entry.kind === 'template'
          ? `started template demo ${slug} at ${server.url} (namespace ${storageNamespace})`
          : `started ${slug} at ${server.url}`
      );
      return {
        slug,
        url: server.url,
        port: server.port,
        reused: false,
        kind: entry.kind,
        ...(storageNamespace ? { storageNamespace } : {}),
      };
    } finally {
      pending.delete(slug);
    }
  }

  /** POST /api/new: create, link (offline only), then start and return the dev URL. */
  async function handleNew(req: IncomingMessage, res: ServerResponse, corsOrigin: string) {
    let input: z.infer<typeof NewRequestSchema>;
    try {
      const parsed = NewRequestSchema.safeParse(await readJson(req));
      if (!parsed.success) {
        throw new CliError(
          'usage',
          `Invalid request: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'body'} ${i.message}`).join('; ')}.`
        );
      }
      input = parsed.data;
      for (const value of [input.slug, input.from]) {
        const check = checkSlug(value);
        if (!check.ok) throw new CliError('usage', check.reason);
      }
    } catch (error) {
      const err = toCliError(error);
      send(res, STATUS_BY_CODE[err.code] ?? 400, { ok: false, error: err.message }, corsOrigin);
      return;
    }
    const run = creating.then(() =>
      create({
        slug: input.slug,
        from: input.from,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        install: options.newInstall ?? 'offline',
        stdio: 'pipe',
      })
    );
    creating = run.catch(() => undefined);
    let result: CreateResult;
    try {
      result = await run;
    } catch (error) {
      const err = toCliError(error);
      send(
        res,
        STATUS_BY_CODE[err.code] ?? 500,
        { ok: false, error: err.message, ...(err.hint ? { hint: err.hint } : {}) },
        corsOrigin
      );
      return;
    }
    log(`created ${result.path} from ${result.source.kind} ${result.source.slug}`);
    const created = {
      slug: result.slug,
      id: result.id,
      name: result.name,
      path: result.path,
      source: result.source,
      created: result.created,
      spec: { ok: result.spec.ok },
    };
    if (!result.install.ok) {
      // Not linked: nothing can start yet. The gallery shows the exact command.
      send(
        res,
        200,
        {
          ok: true,
          ...created,
          linked: false,
          command: result.install.command ?? 'pnpm install',
          next: `Run \`${result.install.command ?? 'pnpm install'}\` in the workspace, then start ${result.slug}.`,
        },
        corsOrigin
      );
      return;
    }
    const entry = findEntry(await loadRegistry(paths), result.slug, 'prototype');
    if (!entry) {
      send(
        res,
        500,
        { ok: false, error: `${result.path} was created but is not indexed` },
        corsOrigin
      );
      return;
    }
    try {
      const dev = await launch(entry);
      send(
        res,
        200,
        { ok: true, ...created, linked: true, url: dev.url, port: dev.port },
        corsOrigin
      );
    } catch (error) {
      // Created and linked; only the start failed (e.g. too many running).
      send(
        res,
        200,
        { ok: true, ...created, linked: true, started: false, error: (error as Error).message },
        corsOrigin
      );
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
