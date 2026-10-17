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
the optional "Prototype · simulated data" badge, and a recovery screen
(reload / reset only this prototype's databases) when boot fails.
`<html data-py-ready="true|error">` and `window.__protoyard` help E2E tests.

## Bindings (`.svelte.ts`)

| API | Returns |
| --- | --- |
| `getRuntime<TDb>()` | the runtime (context, or the mounted one outside components) |
| `liveQuery(fn, { initial?, deps? })` | `{ current, loading, error }`; re-runs on table changes and when `deps()` changes |
| `usePrincipal()` / `useAppearance()` / `useEnvironment()` / `useOverrides()` | `{ current }` |
| `useScenario()` | `{ active, list }` |
| `useClock()` | `{ now, committed, reference, previewing, state }` |
| `can(capability, resource?)` | reactive boolean (services must still `assert`) |

## Router

```ts
const router = createRouter([
  { path: '/', component: Home, title: 'Home' },
  { path: '/deals/:id', component: Deal },
]);
```

`<Router {router} />` renders the match with `params`/`query`;
`<Link href="/deals/1" {router} activeClass="…">`, `navigate('/x', { replace })`,
`back(fallback)`. Hash routing works on refresh/back/forward on any static host.

## Services

```ts
const result = await runService(() => services.create(input), { success: 'Created' });
if (!result.ok && isValidationError(result.error)) errors = result.error.issues;
```

`PermissionDeniedError` and `SimulatedServiceError` become toasts; errors with
an `issues` object are returned for inline display.
