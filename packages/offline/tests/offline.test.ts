import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_PREFIX,
  createPrecacheManifest,
  createRegisterScript,
  createServiceWorkerSource,
  isHashedAsset,
  protoyardOffline,
  readOfflineBuild,
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

describe('precache manifest', () => {
  it('lists shipped files only, and versions by content', () => {
    const dir = fakeBuild({
      'index.html': '<html><head></head></html>',
      'assets/index-K19iSqmG.js': 'console.log(1)',
      'assets/index-K19iSqmG.js.map': '{}',
      'favicon.svg': '<svg/>',
      'sw.js': 'old',
      'crm-demo.zip': 'zip',
      'build-manifest.json': '{}',
      '.hidden': 'x',
    });
    symlinkSync(join(dir, '..', 'nonexistent-target'), join(dir, 'link.js'));
    const manifest = createPrecacheManifest(dir);
    expect(manifest.entries.map((e) => e.url)).toEqual([
      'assets/index-K19iSqmG.js',
      'favicon.svg',
      'index.html',
    ]);
    expect(manifest.version).toMatch(/^[0-9a-f]{12}$/);
    expect(createPrecacheManifest(dir).version).toBe(manifest.version);
    writeFileSync(join(dir, 'favicon.svg'), '<svg>changed</svg>');
    expect(createPrecacheManifest(dir).version).not.toBe(manifest.version);
  });

  it('recognises content-hashed assets', () => {
    expect(isHashedAsset('assets/index-K19iSqmG.js')).toBe(true);
    expect(isHashedAsset('assets/dist-yVFZAMG4.js')).toBe(true);
    expect(isHashedAsset('assets/index-K19iSqmG.css')).toBe(true);
    expect(isHashedAsset('index.html')).toBe(false);
    expect(isHashedAsset('favicon.svg')).toBe(false);
    expect(isHashedAsset('thumbnail.png')).toBe(false);
  });
});

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

  it('precaches the shell and assets on install without skipping the waiting phase', async () => {
    resetNetwork();
    const sw = bootWorker(config);
    await sw.run('install');
    expect([...(sw.caches.get(cacheName)?.entries.keys() ?? [])].sort()).toEqual(
      [
        SCOPE,
        `${SCOPE}assets/index-K19iSqmG.js`,
        `${SCOPE}favicon.svg`,
        `${SCOPE}index.html`,
      ].sort()
    );
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    await sw.run('message', { data: { type: 'SKIP_WAITING' } });
    expect(sw.skipWaiting).toHaveBeenCalledOnce();
  });

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

  it('serves hashed assets cache-first and other precached files network-first', async () => {
    resetNetwork();
    const sw = bootWorker(config);
    await sw.run('install');
    network.calls = [];
    const asset = await sw.run('fetch', { request: request('assets/index-K19iSqmG.js') });
    expect(await asset?.text()).toBe('app-v2');
    expect(network.calls).toEqual([]);

    network.files.set(`${SCOPE}favicon.svg`, '<svg>fresh</svg>');
    expect(await (await sw.run('fetch', { request: request('favicon.svg') }))?.text()).toBe(
      '<svg>fresh</svg>'
    );
    network.online = false;
    expect(await (await sw.run('fetch', { request: request('favicon.svg') }))?.text()).toBe(
      '<svg>fresh</svg>'
    );
    expect(
      await (await sw.run('fetch', { request: request('assets/index-K19iSqmG.js') }))?.text()
    ).toBe('app-v2');
  });
});

describe('register script', () => {
  function runRegister(search: string) {
    const listeners = new Map<string, () => void>();
    const registrations = [
      { scope: SCOPE, unregister: vi.fn() },
      { scope: 'https://demo.example.test/p/bank/app/', unregister: vi.fn() },
    ];
    const register = vi.fn(async () => ({ waiting: null, addEventListener: () => {} }));
    const deleted: string[] = [];
    const window = {
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      dispatchEvent: () => true,
      caches: true,
    } as Record<string, unknown>;
    const sandbox = {
      window,
      navigator: {
        serviceWorker: {
          register,
          getRegistrations: async () => registrations,
          addEventListener: () => {},
          controller: null,
        },
      },
      document: { baseURI: `${SCOPE}index.html${search}`, readyState: 'loading' },
      location: { search, reload: vi.fn() },
      caches: {
        keys: async () => [
          `${CACHE_PREFIX}:${SCOPE}:v1`,
          `${CACHE_PREFIX}:https://demo.example.test/p/bank/app/:v1`,
        ],
        delete: async (key: string) => deleted.push(key),
      },
      URL,
      URLSearchParams,
      CustomEvent: class {},
      console,
    };
    runInNewContext(createRegisterScript(), sandbox);
    return { listeners, register, registrations, deleted, window };
  }

  it('registers sw.js scoped to the page folder once the page has loaded', async () => {
    const { listeners, register, window } = runRegister('?scenario=demo');
    expect(register).not.toHaveBeenCalled();
    listeners.get('load')?.();
    expect(register).toHaveBeenCalledWith(`${SCOPE}sw.js`, { scope: SCOPE });
    expect(window.__protoyardOffline).toBeDefined();
  });

  it('?offline=0 unregisters this scope only and clears only its caches', async () => {
    const { register, registrations, deleted } = runRegister('?offline=0');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(register).not.toHaveBeenCalled();
    expect(registrations[0]?.unregister).toHaveBeenCalledOnce();
    expect(registrations[1]?.unregister).not.toHaveBeenCalled();
    expect(deleted).toEqual([`${CACHE_PREFIX}:${SCOPE}:v1`]);
  });
});

describe('vite plugin', () => {
  it('is a no-op when disabled and build-only when enabled', () => {
    expect(protoyardOffline({ enabled: false })).toEqual([]);
    const [plugin] = protoyardOffline({ enabled: true });
    expect(plugin).toMatchObject({ name: 'protoyard-offline', apply: 'build' });
  });

  it('injects the register script once and writes sw.js with the build version', () => {
    const dir = fakeBuild({ 'assets/index-K19iSqmG.js': 'app', 'favicon.svg': '<svg/>' });
    const seen: string[] = [];
    const [plugin] = protoyardOffline({ enabled: true, onManifest: (m) => seen.push(m.version) });
    if (!plugin) throw new Error('plugin');
    plugin.configResolved({ root: '/', build: { outDir: dir } });
    const html = plugin.transformIndexHtml(
      '<html><head><title>x</title></head><body></body></html>'
    );
    expect(plugin.transformIndexHtml(html)).toBe(html);
    expect(html.match(/data-protoyard-offline/g)).toHaveLength(1);
    writeFileSync(join(dir, 'index.html'), html);
    plugin.closeBundle();
    const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
    expect(sw).toContain(`"version":"${seen[0]}"`);
    expect(sw).toContain('assets/index-K19iSqmG.js');
    expect(sw).not.toContain('"sw.js"');
  });

  it('reads the version back from a finished build for build-manifest.json', () => {
    const dir = fakeBuild({ 'assets/index-K19iSqmG.js': 'app' });
    const [plugin] = protoyardOffline({ enabled: true });
    if (!plugin) throw new Error('plugin');
    plugin.configResolved({ root: '/', build: { outDir: dir } });
    writeFileSync(join(dir, 'index.html'), plugin.transformIndexHtml('<html><head></head></html>'));
    plugin.closeBundle();
    expect(readOfflineBuild(dir)).toEqual({
      version: createPrecacheManifest(dir).version,
      precached: 3,
    });
    expect(readOfflineBuild(fakeBuild({ 'index.html': 'x' }))).toBeNull();
  });

  it('fails the build when index.html lost the register script', () => {
    const dir = fakeBuild({ 'index.html': '<html></html>' });
    const [plugin] = protoyardOffline({ enabled: true });
    plugin?.configResolved({ root: '/', build: { outDir: dir } });
    expect(() => plugin?.closeBundle()).toThrow(/missing the register script/);
  });
});
