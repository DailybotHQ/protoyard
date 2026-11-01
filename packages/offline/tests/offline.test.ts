import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_PREFIX,
  createServiceWorkerSource,
  isHashedAsset,
  protoyardOffline,
  serviceWorkerConfig,
} from '../src/index.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeBuild(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'protoyard-offline-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

// ── A fake ServiceWorkerGlobalScope + Cache API + network ─────────────────────

const SCOPE = 'https://demo.example.test/p/crm-demo/app/';

class FakeCache {
  readonly entries = new Map<string, Response>();
  async addAll(urls: string[]) {
    for (const url of urls) {
      const response = await network.fetch({ url, method: 'GET' });
      if (!response.ok) throw new TypeError(`addAll failed for ${url}`);
      this.entries.set(url, response);
    }
  }
  async put(request: { url: string } | string, response: Response) {
    this.entries.set(typeof request === 'string' ? request : request.url, response);
  }
  async match(request: { url: string } | string, options: { ignoreSearch?: boolean } = {}) {
    const url = new URL(typeof request === 'string' ? request : request.url);
    if (options.ignoreSearch) url.search = '';
    return this.entries.get(url.href)?.clone();
  }
}

const network = {
  online: true,
  calls: [] as string[],
  files: new Map<string, string>(),
  async fetch(request: { url: string; method?: string }): Promise<Response> {
    network.calls.push(request.url);
    if (!network.online) throw new TypeError('Failed to fetch');
    const url = new URL(request.url);
    url.search = '';
    const body = network.files.get(url.href) ?? network.files.get(`${url.href}index.html`);
    const response =
      body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  },
};

function bootWorker(
  config: ReturnType<typeof serviceWorkerConfig>,
  existing: Record<string, FakeCache> = {}
) {
  const caches = new Map<string, FakeCache>(Object.entries(existing));
  const listeners = new Map<string, (event: unknown) => void>();
  const skipWaiting = vi.fn();
  const claim = vi.fn(async () => {});
  const self = {
    registration: { scope: SCOPE },
    location: new URL(`${SCOPE}sw.js`),
    clients: { claim },
    skipWaiting,
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
  };
  const cacheStorage = {
    open: async (name: string) => {
      if (!caches.has(name)) caches.set(name, new FakeCache());
      return caches.get(name) as FakeCache;
    },
    keys: async () => [...caches.keys()],
    delete: async (name: string) => caches.delete(name),
  };
  runInNewContext(createServiceWorkerSource(config), {
    self,
    caches: cacheStorage,
    fetch: network.fetch,
    URL,
    Set,
    Promise,
  });
  const run = async (type: string, extra: Record<string, unknown> = {}) => {
    const pending: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    listeners.get(type)?.({
      ...extra,
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
    });
    await Promise.all(pending);
    return responded;
  };
  return { caches, run, skipWaiting, claim };
}

const request = (path: string, init: { method?: string; mode?: string; accept?: string } = {}) => ({
  url: new URL(path, SCOPE).href,
  method: init.method ?? 'GET',
  mode: init.mode ?? 'cors',
  headers: new Headers(init.accept ? { accept: init.accept } : {}),
});

describe('service worker', () => {
  const manifest = {
    version: 'v2',
    entries: [
      { url: 'index.html', hash: 'a', bytes: 1 },
      { url: 'assets/index-K19iSqmG.js', hash: 'b', bytes: 1 },
      { url: 'favicon.svg', hash: 'c', bytes: 1 },
    ],
    totalBytes: 3,
  };
  const config = serviceWorkerConfig(manifest, isHashedAsset);
  const cacheName = `${CACHE_PREFIX}:${SCOPE}:v2`;

  function resetNetwork() {
    network.online = true;
    network.calls = [];
    network.files = new Map([
      [`${SCOPE}index.html`, '<html>v2</html>'],
      [`${SCOPE}assets/index-K19iSqmG.js`, 'app-v2'],
      [`${SCOPE}favicon.svg`, '<svg>v2</svg>'],
    ]);
  }

  it("activation deletes only THIS scope's older caches", async () => {
    resetNetwork();
    const old = `${CACHE_PREFIX}:${SCOPE}:v1`;
    const otherPrototype = `${CACHE_PREFIX}:https://demo.example.test/p/bank/app/:v1`;
    const unrelated = 'someone-elses-cache';
    const sw = bootWorker(config, {
      [old]: new FakeCache(),
      [otherPrototype]: new FakeCache(),
      [unrelated]: new FakeCache(),
    });
    await sw.run('install');
    await sw.run('activate');
    expect([...sw.caches.keys()].sort()).toEqual([cacheName, otherPrototype, unrelated].sort());
    expect(sw.claim).toHaveBeenCalledOnce();
  });

  it('never handles non-GET, cross-origin, out-of-scope or unknown requests', async () => {
    resetNetwork();
    const sw = bootWorker(config);
    await sw.run('install');
    for (const req of [
      request('assets/index-K19iSqmG.js', { method: 'POST' }),
      { ...request('x'), url: 'https://cdn.example.test/lib.js' },
      { ...request('x'), url: 'https://demo.example.test/p/bank/app/index.html' },
      request('api/deals'),
      request('not-precached.json'),
    ]) {
      expect(await sw.run('fetch', { request: req }), req.url).toBeUndefined();
    }
  });

  it('serves navigations network-first and falls back to the cached shell offline', async () => {
    resetNetwork();
    const sw = bootWorker(config);
    await sw.run('install');
    network.files.set(`${SCOPE}index.html`, '<html>v2-fresh</html>');
    const online = await sw.run('fetch', {
      request: request('./?scenario=demo', { mode: 'navigate' }),
    });
    expect(await online?.text()).toBe('<html>v2-fresh</html>');

    network.online = false;
    const offline = await sw.run('fetch', {
      request: request('./?scenario=other', { mode: 'navigate' }),
    });
    expect(await offline?.text()).toBe('<html>v2-fresh</html>');
    const keys = [...(sw.caches.get(cacheName)?.entries.keys() ?? [])];
    expect(keys.some((k) => k.includes('?'))).toBe(false);
    const deep = await sw.run('fetch', { request: request('index.html', { accept: 'text/html' }) });
    expect(await deep?.text()).toContain('<html>');
  });
});

describe('vite plugin', () => {
  it('fails the build when index.html lost the register script', () => {
    const dir = fakeBuild({ 'index.html': '<html></html>' });
    const [plugin] = protoyardOffline({ enabled: true });
    plugin?.configResolved({ root: '/', build: { outDir: dir } });
    expect(() => plugin?.closeBundle()).toThrow(/missing the register script/);
  });
});
