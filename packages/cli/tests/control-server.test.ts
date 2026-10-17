// @vitest-environment node
import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ControlServer, startControlServer } from '../src/control-server.ts';
import type { DevServerHandle } from '../src/lib/dev-server.ts';
import { addPrototype, createWorkspace, type TempWorkspace } from './helpers.ts';

let ws: TempWorkspace;
let control: ControlServer;
const started: string[] = [];
const ORIGIN = 'http://localhost:4321';

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
  return new Promise<{ status: number; body: Record<string, unknown>; cors?: string }>(
    (resolve, reject) => {
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
            })
          );
        }
      );
      req.on('error', reject);
      req.end();
    }
  );
}

beforeAll(async () => {
  ws = createWorkspace();
  addPrototype(ws, 'crm-app');
  control = await startControlServer({
    root: ws.root,
    port: 0,
    start: async ({ slug }) => {
      started.push(slug);
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
      url: 'http://localhost:5201/',
      reused: false,
    });
    const again = await call('POST', '/api/dev/crm-app', { Origin: ORIGIN });
    expect(again.body).toMatchObject({ reused: true, url: 'http://localhost:5201/' });
    expect(started).toEqual(['crm-app']);
    expect((await call('GET', '/api/status', { Origin: ORIGIN })).body.running).toHaveLength(1);

    const stop = await call('POST', '/api/stop/crm-app', { Origin: ORIGIN });
    expect(stop.body).toMatchObject({ ok: true, stopped: true });
    expect((await call('GET', '/api/status', { Origin: ORIGIN })).body.running).toEqual([]);
  });
});
