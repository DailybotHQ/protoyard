# @protoyard/renderer-svelte

Mounts a Protoyard prototype (Svelte 5 + Vite): Vite config factory, boot
sequence, reactive runtime bindings, Dexie live queries, a hash router and
consistent service feedback.

## Vite

```ts
// vite.config.ts
import { defineProtoyardConfig } from '@protoyard/renderer-svelte/vite';
export default defineProtoyardConfig({ root: import.meta.dirname });
```

Reads `<root>/protoyard.json`, adds the Svelte + Tailwind plugins and injects
the no-flash appearance script. The CLI drives it through env vars:

| Env | Effect | Default |
| --- | --- | --- |
| `PROTOYARD_BASE` | Vite `base` | manifest `build.base` (`./`, relocatable) |
| `PROTOYARD_OUT_DIR` | `build.outDir` (`emptyOutDir: true`) | `<root>/dist` |
| `PROTOYARD_INCLUDE_DEVTOOLS` | `__PROTOYARD_DEVTOOLS__` in builds (`1/0`) | manifest `build.includeDevtools`; always on in dev |
| `PROTOYARD_DEMO_BADGE` | `__PROTOYARD_DEMO_BADGE__` in builds | manifest `build.demoBadge`; off in dev |
| `PROTOYARD_PORT` | dev/preview port (`strictPort: false`) | Vite default |
| `PROTOYARD_BUILT_AT` | `__PROTOYARD_BUILD__.builtAt` | build time |
| `PROTOYARD_OFFLINE` | ship the `@protoyard/offline` service worker (`1/0`; builds only) | manifest `build.offline` (false) |

The dev server's `/@fs` access (`server.fs.allow`) is limited to the prototype folder, the
workspace `packages/` and `node_modules` (`devFsAllow(root)`), so `protoyard dev --host` never
exposes other prototypes or workspace files to the LAN; Vite's default `fs.deny` still applies.

The config module only imports erasable TypeScript (`@protoyard/core/manifest`,
`@protoyard/themes/no-flash`), so plain `vite` loads it under Node type
stripping. With DevTools disabled the panel is tree-shaken out of the bundle.
Globals are typed in `@protoyard/renderer-svelte/env`.

## CSS

```css
/* src/app.css */
@import '@protoyard/renderer-svelte/app.css';
@source './';
```

**Viewport presets** (`tablet`, `iphone`, `android`, from the manifest's
`preview.viewport`, a scenario or a DevTools override) set
`<html data-py-viewport>`. `#app` then becomes a narrow, viewport-tall column that never
scrolls, and is the containing block for `position: fixed` descendants, so a bottom
nav, toasts and the demo badge stay pinned inside the visible column. The app scrolls
inside `[data-py-scroll-root]`, the wrapper the renderer puts around `<App />`, and the
router resets it to the top on navigation. With the desktop preset that wrapper is
`display: contents` and the document scrolls as usual. Media queries still follow the
real window.

## Mount

```ts
import { mountPrototype } from '@protoyard/renderer-svelte';
void mountPrototype({ definition, App, target: document.getElementById('app')! });
```

Boot: `parseScenarioLink(location.search)` → `createPrototypeRuntime(definition,
{ themes: BUILTIN_THEMES + definition.themes, link })` → `scenarios.ensureSeeded()`
→ appearance applied to `<html>` and kept in sync (+ cached for no-flash) →
App mounted with the runtime in context → DevTools (dynamic import) unless
`?devtools=0`. Also renders the storage-degraded banner, a "Load linked
scenario" prompt when a link disagrees with stored data (never automatic),
a thin top progress bar (+ screen-reader status) while any caller loads a
scenario (`scenarios.subscribeProgress`), the optional "Prototype · simulated data" badge, and a recovery screen
(reload / reset only this prototype's databases) when boot fails.
In offline-enabled builds a waiting new version shows an "Update available · Reload" toast
(`protoyard:offline-update`); nothing reloads on its own.
`<html data-py-ready="true|error">` and `window.__protoyard` help E2E tests,
thumbnails and benchmarks. `window.__protoyard` is exposed in production builds on purpose: it
grants nothing same-origin code couldn't already do (IndexedDB is readable and writable by any
script on the origin) and the simulation is not a security boundary.

## Bindings (`.svelte.ts`)

| API | Returns |
| --- | --- |
| `getRuntime<TDb>()` | the runtime (context, or the mounted one outside components) |
| `liveQuery(fn, { initial?, deps? })` | `{ current, loading, error }`; re-runs on table changes and when its inputs change. **List every reactive input in `deps: () => [...]`** (route params, filters, persona). As a safety net, reads made before the querier's first `await` are tracked automatically (one extra query per subscription); inputs read only after an `await` need `deps` |
| `usePrincipal()` / `useAppearance()` / `useEnvironment()` / `useOverrides()` | `{ current }` |
| `useScenario()` | `{ active, list }` |
| `useClock()` | `{ now, committed, reference, previewing, state }` |
| `can(capability, resource?)` | reactive boolean (services must still `assert`) |

`describeLoadProgress(progress)` turns a core `LoadProgress` into
`{ label, fraction }` ("Writing 6,000 of 15,000 rows…", `0.4`; `fraction: null`
while generating/validating) for custom loading UIs.

## Router

```ts
const router = createRouter([
  { path: '/', component: Home, title: 'Home' },
  { path: '/deals/:id', component: Deal },
  // Own chunk — keeps multi-screen apps under the initial-JS budget:
  { path: '/reports', title: 'Reports', load: () => import('./screens/Reports.svelte') },
]);
```

`<Router {router} />` renders the match with `params`/`query`. Eager `component`
routes mount immediately. Lazy `load` routes show `@protoyard/ui` `LoadingState`
while the chunk downloads, then the screen; a failed download shows `ErrorState`
with **Try again** (`invalidate` + re-`load`). Resolved modules are cached per
route. `document.title` updates from the route's `title` as soon as the hash
matches (before the chunk settles). After each successful mount the outlet
receives focus (`data-py-router-outlet`, `tabindex="-1"`) so keyboard users land
on the new screen.

`<Link href="/deals/1" {router} activeClass="…">`, `navigate('/x', { replace })`,
`back(fallback)`. Hash routing works on refresh/back/forward on any static host.

### Route guards

A route's `guard(match)` runs before its screen renders. It returns `true` to
let the screen through or a path to redirect to. The redirect replaces the
history entry, so Back never lands on the blocked screen, and the protected
screen never mounts, not even for a frame.

```ts
const router = createRouter(
  [
    { path: '/settings', component: Settings,
      guard: (m) => runtime.session.isSignedIn() || redirectWithNext('/sign-in', m) },
    // Guest-only: once signed in, continue to where the person was going.
    { path: '/sign-in', component: SignIn,
      guard: (m) => !runtime.session.isSignedIn() || nextPath(m.query) },
  ],
  { revalidateOn: (refresh) => runtime.session.subscribe(refresh) },
);
```

- Guards run on the first location, on every hash change, and whenever
  `revalidateOn` calls `refresh` (sign-in, sign-out, persona switch). You can
  also call `router.refresh()` yourself. A refresh that doesn't change the
  outcome does nothing.
- `redirectWithNext(target, match)` appends `next=<path?query>`.
  `nextPath(query, fallback)` reads it back and accepts only in-app paths
  (`/…`, not `//host`, backslashes or whitespace).
- `router.current.redirectedFrom` holds the originally requested path.
- More than `MAX_REDIRECTS` (5) hops counts as a loop. The router renders the
  not-found screen with the message in `current.error` ("This page keeps
  redirecting"), and the title becomes "Redirect loop".
- Guards are synchronous. Gating on the simulated session is UX, not
  security (ADR-008, ADR-018).

## Services

```ts
const result = await runService(() => services.create(input), { success: 'Created' });
if (!result.ok && isValidationError(result.error)) errors = result.error.issues;
```

`PermissionDeniedError` and `SimulatedServiceError` become toasts; errors with
an `issues` object are returned for inline display. Services throw them with
`parseInput(schema, input)` / `ValidationError` from `@protoyard/core`.
