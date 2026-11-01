// @vitest-environment node
import { existsSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ControlServer, startControlServer } from '../src/control-server.ts';
import type { DevServerHandle } from '../src/lib/dev-server.ts';
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
});
