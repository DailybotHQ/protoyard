// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ControlServer, startControlServer, tokenMatches } from '../src/control-server.ts';
import type { DevServerHandle } from '../src/lib/dev-server.ts';
import { templateDemoNamespace } from '../src/lib/registry.ts';
import { addPrototype, addTemplate, createWorkspace, type TempWorkspace } from './helpers.ts';

let ws: TempWorkspace;
let control: ControlServer;
const started: Array<{
  slug: string;
  kind: string;
  storageNamespace?: string;
  dir: string;
}> = [];
const ORIGIN = 'http://localhost:4321';
const TOKEN = 'test-create-token-0123456789';

function fakeHandle(slug: string, port: number): DevServerHandle {
  let exit: (code: number) => void = () => {};
  const exited = new Promise<number>((r) => {
    exit = r;
  });
  return {
    slug,
    port,
    url: `http://localhost:${port}/`,
    lan: [],
    startedAt: '2026-01-01T00:00:00.000Z',
    child: {} as DevServerHandle['child'],
    exited,
    stop: async () => exit(0),
  };
}

/** Raw HTTP so the test controls Host and Origin headers exactly. */
function call(method: string, path: string, headers: Record<string, string> = {}) {
  return new Promise<{
    status: number;
    body: Record<string, unknown>;
    cors?: string;
    allowHeaders?: string;
  }>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: control.port,
        method,
        path,
        headers: { Host: `127.0.0.1:${control.port}`, ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: data ? JSON.parse(data) : {},
            cors: res.headers['access-control-allow-origin'] as string | undefined,
            allowHeaders: res.headers['access-control-allow-headers'] as string | undefined,
          })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  ws = createWorkspace();
  addPrototype(ws, 'crm-app');
  addTemplate(ws, 'blank');
  control = await startControlServer({
    root: ws.root,
    port: 0,
    start: async ({ slug, kind, storageNamespace, dir }) => {
      started.push({ slug, kind, ...(storageNamespace ? { storageNamespace } : {}), dir });
      return fakeHandle(slug, 5200 + started.length);
    },
  });
});
afterAll(async () => {
  await control.close();
  ws.cleanup();
});

describe('control server', () => {
  it('reports status to the allowed origin with CORS', async () => {
    const res = await call('GET', '/api/status', { Origin: ORIGIN });
    expect(res.status).toBe(200);
    expect(res.cors).toBe(ORIGIN);
    expect(res.body).toMatchObject({ ok: true, running: [] });
  });

  it('rejects foreign origins and non-loopback Host headers (DNS rebinding)', async () => {
    expect((await call('GET', '/api/status', { Origin: 'https://evil.example' })).status).toBe(403);
    expect(
      (await call('POST', '/api/dev/crm-app', { Origin: 'https://evil.example' })).status
    ).toBe(403);
    expect((await call('GET', '/api/status', { Host: 'evil.example' })).status).toBe(403);
    // State changes need an Origin at all (blocks blind cross-site requests without one).
    expect((await call('POST', '/api/dev/crm-app')).status).toBe(403);
    expect(started).toEqual([]);
  });

  it('lets the allowed origin preflight a JSON POST (browsers send content-type)', async () => {
    const preflight = await call('OPTIONS', '/api/new', {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    });
    expect(preflight.status).toBe(204);
    expect(preflight.cors).toBe(ORIGIN);
    expect(preflight.allowHeaders).toBe('content-type, x-protoyard-token');
    const foreign = await call('OPTIONS', '/api/new', {
      Origin: 'https://evil.example',
      'Access-Control-Request-Method': 'POST',
    });
    expect(foreign.status).toBe(403);
    expect(foreign.allowHeaders).toBeUndefined();
  });

  it('keeps creating off by default: no token in status, POST /api/new refused with a hint', async () => {
    const status = await call('GET', '/api/status', { Origin: ORIGIN });
    expect(status.body.create).toEqual({ enabled: false });
    const res = await call('POST', '/api/new', {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'X-Protoyard-Token': 'anything',
    });
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/disabled/);
    expect(String(res.body.hint)).toMatch(/--allow-create/);
  });

  it('accepts only registry slugs', async () => {
    expect((await call('POST', '/api/dev/..%2F..%2Fetc', { Origin: ORIGIN })).status).toBe(400);
    expect((await call('POST', '/api/dev/unknown-app', { Origin: ORIGIN })).status).toBe(404);
    expect(started).toEqual([]);
  });

  it('starts once, reuses the running server and stops it', async () => {
    const first = await call('POST', '/api/dev/crm-app', { Origin: ORIGIN });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      ok: true,
      slug: 'crm-app',
      kind: 'prototype',
      url: 'http://localhost:5201/',
      reused: false,
    });
    expect(first.body.storageNamespace).toBeUndefined();
    const again = await call('POST', '/api/dev/crm-app', { Origin: ORIGIN });
    expect(again.body).toMatchObject({
      reused: true,
      url: 'http://localhost:5201/',
      kind: 'prototype',
    });
    expect(started).toEqual([
      expect.objectContaining({
        slug: 'crm-app',
        kind: 'prototype',
        dir: expect.stringContaining('prototypes/crm-app'),
      }),
    ]);
    expect((await call('GET', '/api/status', { Origin: ORIGIN })).body.running).toHaveLength(1);

    const stop = await call('POST', '/api/stop/crm-app', { Origin: ORIGIN });
    expect(stop.body).toMatchObject({ ok: true, stopped: true });
    expect((await call('GET', '/api/status', { Origin: ORIGIN })).body.running).toEqual([]);
  });

  it('starts a template as a live demo under template-demo-<name> namespace', async () => {
    started.length = 0;
    const demoNs = templateDemoNamespace('blank');
    expect(demoNs).toBe('template-demo-blank');

    const first = await call('POST', '/api/dev/blank', { Origin: ORIGIN });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      ok: true,
      slug: 'blank',
      kind: 'template',
      storageNamespace: demoNs,
      reused: false,
    });
    expect(started).toEqual([
      expect.objectContaining({
        slug: 'blank',
        kind: 'template',
        storageNamespace: demoNs,
        dir: expect.stringContaining('templates/blank'),
      }),
    ]);

    const again = await call('POST', '/api/dev/blank', { Origin: ORIGIN });
    expect(again.body).toMatchObject({
      reused: true,
      kind: 'template',
      storageNamespace: demoNs,
    });
    expect(started).toHaveLength(1);

    const status = await call('GET', '/api/status', { Origin: ORIGIN });
    expect(status.body.running).toEqual([
      expect.objectContaining({
        slug: 'blank',
        kind: 'template',
        storageNamespace: demoNs,
      }),
    ]);

    await call('POST', '/api/stop/blank', { Origin: ORIGIN });
    expect((await call('GET', '/api/status', { Origin: ORIGIN })).body.running).toEqual([]);
  });

  it('refuses unknown templates the same way as unknown prototypes', async () => {
    const res = await call('POST', '/api/dev/not-a-template', { Origin: ORIGIN });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false });
    expect(String(res.body.error)).toMatch(/unknown prototype or template/i);
  });
});

describe('tokenMatches', () => {
  it('compares in constant time and treats any length mismatch as a mismatch', () => {
    expect(tokenMatches('abc', 'abc')).toBe(true);
    expect(tokenMatches('abc', 'abd')).toBe(false);
    expect(tokenMatches('abc', 'abcd')).toBe(false);
    expect(tokenMatches('abc', '')).toBe(false);
    expect(tokenMatches('abc', undefined)).toBe(false);
  });
});

describe('templateDemoNamespace', () => {
  it('builds a kebab-case demo namespace from the template slug', () => {
    expect(templateDemoNamespace('blank')).toBe('template-demo-blank');
    expect(templateDemoNamespace('task-manager')).toBe('template-demo-task-manager');
  });
});

describe('POST /api/new', () => {
  let nws: TempWorkspace;
  let server: ControlServer;
  const starts: string[] = [];

  /** JSON POST with exact headers; `raw` sends a body as is. */
  function post(body: unknown, headers: Record<string, string> = {}, raw?: string) {
    const payload = raw ?? JSON.stringify(body);
    return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: server.port,
          method: 'POST',
          path: '/api/new',
          headers: {
            Host: `127.0.0.1:${server.port}`,
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(payload)),
            'X-Protoyard-Token': TOKEN,
            ...headers,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : {} })
          );
        }
      );
      req.on('error', reject);
      req.end(payload);
    });
  }
  const manifestOf = (slug: string) =>
    JSON.parse(
      readFileSync(join(nws.root, 'prototypes', slug, 'protoyard.json'), 'utf8')
    ) as Record<string, unknown>;

  beforeAll(async () => {
    nws = createWorkspace();
    addPrototype(nws, 'crm-app', {
      name: 'Original CRM',
      storage: { namespace: 'crm-app', schemaVersion: 1 },
    });
    addTemplate(nws, 'blank');
    server = await startControlServer({
      root: nws.root,
      port: 0,
      newInstall: 'skip',
      allowCreate: true,
      createToken: TOKEN,
      start: async ({ slug }) => {
        starts.push(slug);
        return fakeHandle(slug, 5300 + starts.length);
      },
    });
  });
  afterAll(async () => {
    await server.close();
    nws.cleanup();
  });

  it('creates from a template, links it and returns its dev URL', async () => {
    const res = await post({ slug: 'my-app', from: 'blank', name: 'My App' }, { Origin: ORIGIN });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      slug: 'my-app',
      id: 'local.my-app',
      path: 'prototypes/my-app',
      source: { kind: 'template', slug: 'blank' },
      created: true,
      linked: true,
      url: 'http://localhost:5301/',
    });
    expect(starts).toEqual(['my-app']);
    expect(manifestOf('my-app')).toMatchObject({
      kind: 'prototype',
      name: 'My App',
      template: 'blank',
      storage: { namespace: 'my-app' },
    });
  });

  it('remixes an existing prototype with a fresh id, name and storage namespace', async () => {
    const res = await post({ slug: 'crm-copy', from: 'crm-app' }, { Origin: ORIGIN });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      source: { kind: 'prototype', slug: 'crm-app' },
      created: true,
    });
    const copy = manifestOf('crm-copy');
    expect(copy).toMatchObject({
      id: 'local.crm-copy',
      slug: 'crm-copy',
      name: 'Crm Copy',
      storage: { namespace: 'crm-copy' },
    });
    // The source is untouched.
    expect(manifestOf('crm-app')).toMatchObject({
      name: 'Original CRM',
      storage: { namespace: 'crm-app' },
    });
  });

  it('never overwrites: an existing slug is refused and left intact', async () => {
    const before = readFileSync(join(nws.root, 'prototypes/crm-app/protoyard.json'), 'utf8');
    const clash = await post({ slug: 'crm-app', from: 'blank' }, { Origin: ORIGIN });
    expect(clash.status).toBe(409);
    expect(readFileSync(join(nws.root, 'prototypes/crm-app/protoyard.json'), 'utf8')).toBe(before);
    const other = await post({ slug: 'my-app', from: 'crm-app' }, { Origin: ORIGIN });
    expect(other.status).toBe(409);
    expect(manifestOf('my-app').template).toBe('blank');
  });

  it('gives the per-run token only to an allowed origin', async () => {
    const status = (headers: Record<string, string>) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port: server.port,
            method: 'GET',
            path: '/api/status',
            headers: { Host: `127.0.0.1:${server.port}`, ...headers },
          },
          (r) => {
            let data = '';
            r.on('data', (c) => (data += c));
            r.on('end', () => resolve({ status: r.statusCode, ...JSON.parse(data || '{}') }));
          }
        );
        req.on('error', reject);
        req.end();
      });
    expect((await status({ Origin: ORIGIN })).create).toEqual({ enabled: true, token: TOKEN });
    const bare = await status({});
    expect(JSON.stringify(bare)).not.toContain(TOKEN);
    expect(JSON.stringify(await status({ Origin: 'null' }))).not.toContain(TOKEN);
    expect(JSON.stringify(await status({ Origin: 'https://evil.example' }))).not.toContain(TOKEN);
  });

  it('refuses Origin: null and a missing, wrong or wrong-length token', async () => {
    const body = { slug: 'tok-app', from: 'blank' };
    expect((await post(body, { Origin: 'null' })).status).toBe(403);
    const missing = await post(body, { Origin: ORIGIN, 'X-Protoyard-Token': '' });
    expect(missing.status).toBe(403);
    expect(String(missing.body.error)).toMatch(/token/);
    const wrong = TOKEN.replace(/.$/, (c) => (c === 'x' ? 'y' : 'x'));
    expect((await post(body, { Origin: ORIGIN, 'X-Protoyard-Token': wrong })).status).toBe(403);
    expect((await post(body, { Origin: ORIGIN, 'X-Protoyard-Token': `${TOKEN}x` })).status).toBe(
      403
    );
    expect(existsSync(join(nws.root, 'prototypes/tok-app'))).toBe(false);
  });

  it('refuses path traversal and invalid slugs before touching the disk', async () => {
    for (const body of [
      { slug: '../evil', from: 'blank' },
      { slug: 'a/b', from: 'blank' },
      { slug: 'ok-name', from: '../../etc' },
      { slug: 'ok-name', from: '..%2F..%2Fetc' },
      { slug: 'Upper', from: 'blank' },
    ]) {
      expect((await post(body, { Origin: ORIGIN })).status, JSON.stringify(body)).toBe(400);
    }
    expect(existsSync(join(nws.root, 'evil'))).toBe(false);
    expect(existsSync(join(nws.root, 'prototypes/ok-name'))).toBe(false);
    expect(
      (await post({ slug: 'ok-name', from: 'no-such-thing' }, { Origin: ORIGIN })).status
    ).toBe(404);
  });

  it('refuses forbidden or missing origins, wrong content types and malformed bodies', async () => {
    expect(
      (await post({ slug: 'x-app', from: 'blank' }, { Origin: 'https://evil.example' })).status
    ).toBe(403);
    expect((await post({ slug: 'x-app', from: 'blank' })).status).toBe(403);
    expect(
      (
        await post(
          { slug: 'x-app', from: 'blank' },
          { Origin: ORIGIN, 'Content-Type': 'text/plain' }
        )
      ).status
    ).toBe(400);
    expect((await post(null, { Origin: ORIGIN }, '{not json')).status).toBe(400);
    expect(
      (await post({ slug: 'x-app', from: 'blank', path: '/etc' }, { Origin: ORIGIN })).status
    ).toBe(400);
    expect(
      (
        await post(
          { slug: 'x-app', from: 'blank', description: 'x'.repeat(9000) },
          { Origin: ORIGIN }
        )
      ).status
    ).toBe(400);
    expect(existsSync(join(nws.root, 'prototypes/x-app'))).toBe(false);
  });

  it('returns the exact install command instead of going online when offline linking fails', async () => {
    const launched: string[] = [];
    const offline = await startControlServer({
      root: nws.root,
      port: 0,
      allowCreate: true,
      createToken: TOKEN,
      start: async ({ slug }) => {
        launched.push(slug);
        return fakeHandle(slug, 5400);
      },
      create: async (input) => ({
        slug: input.slug,
        id: `local.${input.slug}`,
        name: 'Needs Deps',
        source: { kind: 'template', slug: input.from },
        template: input.from,
        path: `prototypes/${input.slug}`,
        dir: join(nws.root, 'prototypes', input.slug),
        created: true,
        files: 3,
        install: { ok: false, skipped: false, mode: 'offline', command: 'pnpm install' },
        spec: { ok: false, created: 0, updated: 0 },
        indexed: true,
        nextSteps: [],
      }),
    });
    try {
      const res = await new Promise<{ status: number; body: Record<string, unknown> }>(
        (resolve, reject) => {
          const payload = JSON.stringify({ slug: 'needs-deps', from: 'blank' });
          const req = request(
            {
              host: '127.0.0.1',
              port: offline.port,
              method: 'POST',
              path: '/api/new',
              headers: {
                Host: `127.0.0.1:${offline.port}`,
                Origin: ORIGIN,
                'Content-Type': 'application/json',
                'X-Protoyard-Token': TOKEN,
              },
            },
            (r) => {
              let data = '';
              r.on('data', (c) => (data += c));
              r.on('end', () => resolve({ status: r.statusCode ?? 0, body: JSON.parse(data) }));
            }
          );
          req.on('error', reject);
          req.end(payload);
        }
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        created: true,
        linked: false,
        command: 'pnpm install',
      });
      expect(res.body.url).toBeUndefined();
      expect(launched).toEqual([]);
    } finally {
      await offline.close();
    }
  });
});
