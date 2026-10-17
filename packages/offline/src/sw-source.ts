import type { PrecacheManifest } from './manifest.ts';

/** Every Protoyard offline cache name starts with this, followed by the scope URL. */
export const CACHE_PREFIX = 'protoyard-offline';

export interface ServiceWorkerConfig {
  version: string;
  /** URLs relative to the worker's scope. */
  precache: string[];
  /** Subset of `precache` that is content-hashed (cache-first). */
  hashed: string[];
}

export function serviceWorkerConfig(
  manifest: PrecacheManifest,
  isHashed: (url: string) => boolean
): ServiceWorkerConfig {
  const urls = manifest.entries.map((entry) => entry.url);
  return {
    version: manifest.version,
    // './' is the app's front door (index.html is served for it).
    precache: ['./', ...urls],
    hashed: urls.filter(isHashed),
  };
}

/**
 * The service worker, as plain JavaScript (no build step, no Workbox).
 *
 * Rules it enforces:
 *  - only same-origin GET requests inside its own scope are handled;
 *    everything else (cross-origin, POST, other prototypes' paths) passes
 *    through untouched — so in-page mock APIs and real backends are unaffected;
 *  - HTML/navigations: network-first, falling back to the cached shell offline;
 *  - content-hashed assets: cache-first (their URL changes when they change);
 *  - other precached files: network-first with cache fallback;
 *  - caches are named per scope + version: activating a new version deletes
 *    only THIS scope's older caches, never another prototype's on the same origin;
 *  - it never calls skipWaiting() on its own: only on an explicit
 *    `{ type: 'SKIP_WAITING' }` message, so an open tab is never swapped mid-session.
 */
export function createServiceWorkerSource(config: ServiceWorkerConfig): string {
  return `/* Protoyard offline service worker — generated at build time. Do not edit. */
'use strict';
const CONFIG = ${JSON.stringify(config)};
const SCOPE = self.registration.scope;
const PREFIX = ${JSON.stringify(CACHE_PREFIX)} + ':' + SCOPE + ':';
const CACHE = PREFIX + CONFIG.version;
const absolute = (path) => new URL(path, SCOPE).href;
const PRECACHE = CONFIG.precache.map(absolute);
const HASHED = new Set(CONFIG.hashed.map(absolute));
const SHELL = absolute('./');

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isNavigation(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

// Entries are keyed by URL WITHOUT the query string: "?scenario=…" variants of the
// page share one entry (no unbounded cache growth), and the offline shell is
// always the most recently fetched HTML.
const keyOf = (request) => {
  const url = new URL(request.url);
  return url.origin + url.pathname;
};

async function networkFirst(request, isPage) {
  const cache = await caches.open(CACHE);
  const key = keyOf(request);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      await cache.put(key, response.clone());
      if (isPage && key !== SHELL) await cache.put(SHELL, response.clone());
    }
    return response;
  } catch (error) {
    const cached = (await cache.match(key)) || (isPage ? await cache.match(SHELL) : undefined);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const key = keyOf(request);
  const cached = await cache.match(key);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') await cache.put(key, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(SCOPE)) return;
  const clean = url.origin + url.pathname;
  if (isNavigation(request)) {
    event.respondWith(networkFirst(request, true));
  } else if (HASHED.has(clean)) {
    event.respondWith(cacheFirst(request));
  } else if (PRECACHE.includes(clean)) {
    event.respondWith(networkFirst(request, false));
  }
  // Anything else: no respondWith → the browser handles it normally.
});
`;
}
