import { PermissionDeniedError, type PrototypeRuntime, type Row } from '@protoyard/core';
import { createPrototypeRuntime, type ProtoyardRuntime } from '@protoyard/runtime';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createTasksDefinition, type Task } from '../../runtime/tests/fixtures/tasks-prototype.ts';
import {
  createMockApi,
  HttpError,
  installGlobalFetch,
  json,
  MOCK_HEADER,
  MockResponse,
  OfflineFetchError,
  type Routes,
} from '../src/index.ts';

class ValidationError extends Error {
  readonly issues: Record<string, string>;
  constructor(issues: Record<string, string>) {
    super(Object.values(issues)[0] ?? 'Invalid');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}
class PaywallError extends Error {
  constructor() {
    super('Plan expired (simulated).');
    this.name = 'PaywallError';
  }
}

const open: ProtoyardRuntime[] = [];
afterEach(() => {
  for (const rt of open.splice(0)) rt.close();
});

async function boot(scenario = 'active-month', sleeps: number[] = []) {
  const runtime = await createPrototypeRuntime(
    createTasksDefinition({ namespace: 'http-fixture' }),
    {
      indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
      IDBKeyRange,
      link: { scenario },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    }
  );
  await runtime.scenarios.ensureSeeded();
  open.push(runtime);
  return runtime;
}

const routes: Routes = {
  'GET /tasks': async ({ runtime, query }) => {
    const db = (runtime as PrototypeRuntime<ProtoyardRuntime['db']>).db;
    const status = query.get('status');
    const rows = (await db.rows<Task>('tasks').toArray()).filter(
      (t) => !status || t.status === status
    );
    return { items: rows.slice(0, Number(query.get('limit') ?? 100)), total: rows.length };
  },
  'GET /tasks/:id': async ({ runtime, params }) => {
    const task = await (runtime.db as ProtoyardRuntime['db']).rows('tasks').get(params.id ?? '');
    if (!task) throw new HttpError(404, `Task ${params.id} not found`);
    return task;
  },
  'POST /tasks': async ({ runtime, body }) => {
    runtime.session.assert('tasks:create');
    const input = (body ?? {}) as { title?: string; projectId?: string };
    if (!input.title || input.title.length < 3) {
      throw new ValidationError({ title: 'Title needs at least 3 characters' });
    }
    const task = {
      id: `task_api_${input.title.length}`,
      title: input.title,
      projectId: input.projectId ?? 'project_0001',
      status: 'todo',
      assigneeId: null,
      createdAt: runtime.clock.now().toISOString(),
    };
    await (runtime.db as ProtoyardRuntime['db']).rows('tasks').add(task as Row);
    return json(task, { status: 201, headers: { location: `/api/tasks/${task.id}` } });
  },
  'DELETE /tasks/:id': async ({ runtime, params }) => {
    runtime.session.assert('tasks:delete');
    await (runtime.db as ProtoyardRuntime['db']).rows('tasks').delete(params.id ?? '');
  },
  'GET /zod': () => {
    const error = new Error('Invalid input') as Error & { issues: unknown[] };
    error.name = 'ZodError';
    error.issues = [{ path: ['amount'], message: 'Too small' }];
    throw error;
  },
  'GET /paywall': () => {
    throw new PaywallError();
  },
  'GET /boom': () => {
    throw new Error('kaboom');
  },
};

describe('routing', () => {
  it('serves JSON with params, query, bodies and real Response semantics', async () => {
    const runtime = await boot();
    const api = createMockApi(runtime, { baseUrl: '/api', routes });
    expect(api.routes).toContain('GET /tasks/:id');

    const list = await api.fetch('/api/tasks?status=todo&limit=2');
    expect(list.status).toBe(200);
    expect(list.headers.get(MOCK_HEADER)).toBe('1');
    expect(list.headers.get('content-type')).toContain('application/json');
    const data = (await list.json()) as { items: Task[]; total: number };
    expect(data.items.length).toBeLessThanOrEqual(2);
    expect(data.items.every((t) => t.status === 'todo')).toBe(true);

    const one = await api.fetch('/api/tasks/task%5F0001');
    expect(((await one.json()) as Task).id).toBe('task_0001');

    const created = await api.fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'From the API' }),
    });
    expect(created.status).toBe(201);
    expect(created.headers.get('location')).toBe('/api/tasks/task_api_12');
    expect(await runtime.db.rows('tasks').get('task_api_12')).toBeDefined();

    const removed = await api.fetch(
      new Request(new URL('/api/tasks/task_api_12', location.href), { method: 'DELETE' })
    );
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe('');
    expect(await runtime.db.rows('tasks').get('task_api_12')).toBeUndefined();
  });

  it('answers 404, 405 (with Allow) and 400 for broken JSON', async () => {
    const api = createMockApi(await boot(), { baseUrl: '/api', routes });
    const missing = await api.fetch('/api/nope');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: 'not_found' });
    expect((await api.fetch('/api/tasks/task_9999')).status).toBe(404);

    const wrong = await api.fetch('/api/tasks/task_0001', { method: 'PUT' });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toBe('GET, DELETE');

    const bad = await api.fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ nope',
    });
    expect(bad.status).toBe(400);
  });

  it('supports absolute base URLs and refuses URLs outside the API', async () => {
    const api = createMockApi(await boot(), { baseUrl: 'https://api.example.test/v1', routes });
    expect((await api.fetch('https://api.example.test/v1/tasks/task_0002')).status).toBe(200);
    expect(api.matches('https://api.example.test/v2/tasks')).toBe(false);
    expect(api.matches('https://other.example.test/v1/tasks')).toBe(false);
    await expect(api.fetch('/v1/tasks')).rejects.toThrow(/outside the mock API/);
  });

  it('rejects malformed route keys at startup', async () => {
    const runtime = await boot();
    expect(() => createMockApi(runtime, { routes: { 'FETCH /x': () => 1 } })).toThrow(
      /Invalid route/
    );
    expect(() => createMockApi(runtime, { routes: { 'GET x': () => 1 } })).toThrow(/Invalid route/);
  });
});

describe('error mapping', () => {
  it('maps permission, validation, custom and unknown errors', async () => {
    const runtime = await boot('viewer');
    const api = createMockApi(runtime, {
      routes,
      mapError: (error) =>
        error instanceof Error && error.name === 'PaywallError'
          ? new MockResponse(402, { error: 'payment_required', message: error.message })
          : undefined,
    });
    const forbidden = await api.fetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Nope' }),
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({
      error: 'forbidden',
      capability: 'tasks:create',
      role: 'viewer',
    });

    await runtime.session.switchActor('user_0001');
    await runtime.overrides.set({ role: 'owner' });
    const invalid = await api.fetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'x' }),
    });
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      error: 'validation_failed',
      issues: { title: expect.any(String) },
    });
    const zod = await api.fetch('/api/zod');
    expect(zod.status).toBe(422);
    expect(((await zod.json()) as { issues: unknown[] }).issues).toHaveLength(1);

    expect((await api.fetch('/api/paywall')).status).toBe(402);
    const boom = await api.fetch('/api/boom');
    expect(boom.status).toBe(500);
    expect(await boom.json()).toMatchObject({ error: 'internal', message: 'kaboom' });
  });

  it('maps every simulated environment failure to HTTP', async () => {
    const runtime = await boot();
    const api = createMockApi(runtime, { routes });
    const cases: [string, number, string | null][] = [
      ['timeout', 504, null],
      ['server-error', 500, null],
      ['rate-limited', 429, '2'],
      ['permission-denied', 403, null],
    ];
    for (const [failureMode, status, retryAfter] of cases) {
      runtime.environment.set({ failureMode: failureMode as never, failureRate: 1 });
      const response = await api.fetch('/api/tasks');
      expect(response.status, failureMode).toBe(status);
      expect(response.headers.get('retry-after')).toBe(retryAfter);
    }
    runtime.environment.set({ failureMode: 'none', network: 'offline' });
    const offline = api.fetch('/api/tasks');
    await expect(offline).rejects.toBeInstanceOf(TypeError);
    await expect(api.fetch('/api/tasks')).rejects.toThrow('Failed to fetch');
    await expect(api.fetch('/api/tasks')).rejects.toBeInstanceOf(OfflineFetchError);
    expect(api.log.entries().at(-1)).toMatchObject({
      status: null,
      error: expect.stringMatching(/offline/),
    });
  });

  it('honours failureScope so only matching endpoints fail', async () => {
    const runtime = await boot();
    const api = createMockApi(runtime, { routes });
    runtime.environment.set({
      failureMode: 'server-error',
      failureRate: 1,
      failureScope: ['http.GET /tasks/:id'],
    });
    expect((await api.fetch('/api/tasks/task_0001')).status).toBe(500);
    expect((await api.fetch('/api/tasks')).status).toBe(200);
    // Services (not http.*) are unaffected by an http-only scope.
    runtime.environment.set({ failureScope: ['http.'] });
    await expect(runtime.environment.run('tasks.create', () => 'ok')).resolves.toBe('ok');
  });

  it('applies simulated latency through the environment', async () => {
    const sleeps: number[] = [];
    const runtime = await boot('active-month', sleeps);
    const api = createMockApi(runtime, { routes });
    runtime.environment.set({ latencyMs: 300 });
    sleeps.length = 0;
    await api.fetch('/api/tasks');
    expect(sleeps).toEqual([300]);
    runtime.environment.set({ network: 'slow' });
    sleeps.length = 0;
    await api.fetch('/api/tasks');
    expect(sleeps).toEqual([1500]);
  });
});

describe('global fetch and the network log', () => {
  it('intercepts only the API prefix and restores the original', async () => {
    const api = createMockApi(await boot(), { baseUrl: '/api', routes });
    const seen: string[] = [];
    const target = {
      fetch: (async (input: RequestInfo | URL) => {
        seen.push(String(input));
        return new Response('upstream');
      }) as typeof fetch,
    };
    const original = target.fetch;
    const installed = installGlobalFetch(api, target);
    expect((await target.fetch('/api/tasks/task_0001')).headers.get(MOCK_HEADER)).toBe('1');
    expect(await (await target.fetch('https://cdn.example.test/x.json')).text()).toBe('upstream');
    expect(await (await target.fetch('/apix/not-ours')).text()).toBe('upstream');
    expect(seen).toEqual(['https://cdn.example.test/x.json', '/apix/not-ours']);
    installed.restore();
    expect(target.fetch).toBe(original);
  });

  it('keeps the newest entries in a ring buffer and notifies subscribers', async () => {
    const api = createMockApi(await boot(), { routes, logSize: 3 });
    const sizes: number[] = [];
    const off = api.log.subscribe((entries) => sizes.push(entries.length));
    for (let i = 1; i <= 5; i++) await api.fetch(`/api/tasks/task_000${i}`);
    off();
    const entries = api.log.entries();
    expect(entries.map((e) => e.url)).toEqual([
      '/api/tasks/task_0003',
      '/api/tasks/task_0004',
      '/api/tasks/task_0005',
    ]);
    expect(entries[0]).toMatchObject({ method: 'GET', route: 'GET /tasks/:id', status: 200 });
    expect(entries[0]?.at).toMatch(/^2026-06-01T/);
    expect(sizes).toEqual([1, 2, 3, 3, 3]);
    api.log.clear();
    expect(api.log.entries()).toEqual([]);
  });
});

// Keep the PermissionDeniedError import honest: the mapping must also accept the class.
expect(new PermissionDeniedError('x', 'viewer').name).toBe('PermissionDeniedError');
