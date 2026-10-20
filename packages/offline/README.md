# @protoyard/offline

Optional offline support for **exported** prototypes. A build-time Vite plugin writes a
small service worker (`sw.js`) with a precache manifest, and injects a few lines into
`index.html` to register it. After a first online visit, the app shell loads with no
network. There is no Workbox dependency and nothing runs in `vite dev`.

> **Your data was already offline.** Prototype records live in the browser's IndexedDB,
> with no backend. This package only makes the **app shell** (HTML, JS, CSS, images) load
> without a network. It never stores, syncs or uploads data.

## Turning it on

Offline is **off by default**. Turn it on per prototype in `protoyard.json`:

```json
{ "build": { "offline": true } }
```

or per build with `PROTOYARD_OFFLINE=1` (the CLI's `--offline` flag sets it). The renderer's
`defineProtoyardConfig` adds the plugin when either is set. Direct use:

```ts
import { protoyardOffline } from '@protoyard/offline';
export default { plugins: [...protoyardOffline({ enabled: true })] };
```

## What the service worker does

| Request | Strategy |
| --- | --- |
| Page / navigation (HTML) | **Network-first**, falling back to the cached shell when offline. Any `?scenario=…` variant uses the same cache entry, so the cache doesn't grow per link. |
| Content-hashed assets (`index-B3x9Kq1z.js`) | **Cache-first**. Their URL changes whenever their content does. |
| Other built files (`favicon.svg`, `thumbnail.png`) | Network-first with cache fallback. |
| Non-GET, cross-origin, outside the app's folder, or not part of the build | **Not handled**; the browser does what it normally would. |

- **Precache:** every file of the finished build, scanned after Vite writes, including
  `public/`. Source maps, ZIPs, `build-manifest.json`, dotfiles and symlinks are excluded.
- **Version:** a hash of every file's path and content. A new deploy has a new version; its
  worker installs in the background and **waits**. It never calls `skipWaiting()` on its
  own, so an open tab is never swapped mid-session. When a waiting update exists,
  `window.__protoyardOffline.updateAvailable` is `true` and a `protoyard:offline-update`
  event fires. `window.__protoyardOffline.applyUpdate()` activates it and reloads once.
  Otherwise it activates when every tab of the app is closed.
- **Scope:** the folder that holds `index.html`, resolved at runtime from `document.baseURI`.
  It works under sub-paths (`/p/crm-demo/app/`) and with base `./`.
- **Several prototypes on one origin** (the showcase): caches are named
  `protoyard-offline:<scope>:<version>`, and activation deletes only *its own scope's* older
  caches. One prototype never evicts another's.
- **Mock APIs** (`@protoyard/http`) answer inside the page, so they never reach the
  service worker. Same-origin `/api/…` requests that are not part of the build pass through
  untouched.
- **Kill switch:** open the app with **`?offline=0`** to unregister this scope's worker and
  delete its caches, for example to recover from a bad deploy. Remove the parameter to opt
  back in.

## Honest limits

- **The first visit must be online.** Nothing is cached until the worker has installed once.
- **Secure contexts only:** HTTPS, or `localhost` / `127.0.0.1`. Over plain HTTP on a LAN
  address, browsers refuse service workers, and the app still works online.
- **Safari / iOS:** service workers work, but Safari may evict a site's storage (caches
  *and* IndexedDB) after about 7 days without a visit, and home-screen web apps keep storage
  separate from Safari tabs. Export a snapshot of anything worth keeping.
- **Storage eviction anywhere:** browsers can clear storage under disk pressure, unless
  persistence was granted (`requestPersistence()` in `@protoyard/database`).
- **Updates arrive on the next visit**, not instantly, by design.
- **Not tested in Firefox or WebKit here**; the verified path is Chromium (see Tests).

## Tests

- `pnpm vitest run packages/offline` covers:
  - the manifest: exclusions, symlinks, versioning, hashed-asset detection;
  - the service worker, run in a fake `ServiceWorkerGlobalScope` with a Cache API stub:
    - install precaches without `skipWaiting`, and `SKIP_WAITING` works only by message;
    - activation deletes only the same scope's old caches;
    - non-GET, cross-origin and out-of-scope requests are ignored;
    - network-first navigation with the offline shell, and no growth per query string;
    - cache-first hashed assets;
  - the register script: sub-path scope and the `?offline=0` kill switch;
  - the plugin: no-op when disabled, single injection, fails if the script goes missing.
- **Browser check (Chromium, real service worker):** a build served from a **sub-path** by
  a generic static server, then load → create a record → `context.setOffline(true)` →
  reload. The app boots from cache, the record is still there, there are 0 failed requests,
  and `?offline=0` leaves 0 registrations and 0 caches.

## Package output

The manifest keeps TypeScript source exports for workspace development. `pnpm build:packages --filter engine` creates the ESM and declaration files under `dist/` that the packed manifest exposes.
