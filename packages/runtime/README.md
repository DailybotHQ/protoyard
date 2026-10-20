# @protoyard/runtime

Framework-agnostic runtime that composes `@protoyard/database` and `@protoyard/scenarios`
with the core clock, environment, session and policy into one `PrototypeRuntime` (the
contract in `@protoyard/core/runtime.ts`). Renderers (Svelte today) wrap it in reactive
state. The runtime only computes state and never touches the DOM.

```ts
import { createPrototypeRuntime } from '@protoyard/runtime';
import { parseScenarioLink } from '@protoyard/core';

const runtime = await createPrototypeRuntime(definition, {
  themes, // built-in presets + definition.themes (missing definition themes are added)
  link: parseScenarioLink(location.search),
});
await runtime.scenarios.ensureSeeded(); // first visit seeds; reopening never resets edits
```

Options: `themes`, `link`, `indexedDB` / `IDBKeyRange` (tests), `allowMemoryFallback`
(default `true`), `matchMedia`, `sleep`, `now` (wall clock for metadata only), `integrity`
(defaults to `definition.integrity`), `validation: 'throw' | 'warn' | 'off'` (default
`throw`), `onError`, `resolveTheme` (async loader for theme ids that are not in `themes`,
see below).

`createPrototypeRuntime` can throw `StorageError` (`version-newer`, `quota-exceeded`,
`blocked`, `unknown`). When IndexedDB is unavailable it falls back to memory and
`runtime.storage()` reports `{ backend: 'memory', persistent: false, warning }`. Show that
warning.

## Three operations that are never conflated

| | Operation | Effect |
| --- | --- | --- |
| A | `scenarios.load(id, { seed?, snapshotFirst? })` / `reset()` | Destructive and scoped to this prototype: generate → `validateWorld` → clear + insert in ONE transaction → record scenario, seed, version and `generatorVersion` → clock to `referenceTime`, overrides cleared, actor = scenario actor |
| B | `overrides.set()`, `session.switchActor()`, `theme.*`, `environment.set()` | Non-destructive and persisted in the control DB; domain rows are never written |
| C | `snapshots.save / restore / exportJson / importJson` | Captures and restores the actual world, records and session together |

## Sandboxed worlds

`?sandbox=<name>` (validated by core's `SANDBOX_PATTERN`) gives the runtime its own pair of
databases, `protoyard.<namespace>~<name>.{data,control}`. Use it to show two scenarios side by
side on one origin, for example two iframes with `?sandbox=a&scenario=X` and
`?sandbox=b&scenario=Y`.

- The default world is never read or written from a sandbox, and sandboxes never see each
  other.
- `ensureSeeded()` seeds the link's scenario in a new sandbox. When an existing sandbox gets
  a link to a *different* scenario or seed, it loads it directly (sandboxes are disposable),
  instead of showing the pending-link prompt. A plain reload keeps the sandbox's edits.
- `runtime.sandbox` holds the name, or `undefined` in the default world.
  `runtime.discardSandbox()` deletes only this sandbox's two databases, and throws outside a
  sandbox.
- An invalid name is ignored, and the runtime uses the default world.
- `listProtoyardDatabases(namespace)` from `@protoyard/database` lists the default world and
  every sandbox (`{ supported, databases, sandboxes }`), for cleanup UIs. It needs
  `indexedDB.databases()`; otherwise it reports `supported: false`.

## Large worlds and progress

Loads run in phases: **generate → validate → write → done**. The runtime yields to the event
loop between phases, then writes the whole world in **one transaction** with chunked
`bulkAdd` calls (`DEFAULT_WRITE_CHUNK = 1000`, overridable via `RuntimeOptions.writeChunkSize`
or per load). Atomicity is kept: if any chunk fails, the previous world is untouched. Chunk
completions are separate tasks, so the browser can paint and progress can be reported.

```ts
await runtime.scenarios.load('enterprise-scale', {
  onProgress: ({ phase, done, total }) => bar.update(phase, done / total),
});
runtime.scenarios.subscribeProgress((p) => /* LoadProgress | null (null = settled) */);
runtime.scenarios.progress(); // current load, or null
runtime.scenarios.lastLoadTimings(); // { generateMs, validateMs, writeMs, rows }
```

With `crm-demo` → `enterprise-scale` (16,075 rows), on an M1 Max in headless Chromium, a load
takes about 630 ms with 0 long tasks. A single `bulkAdd` produced an 85 ms long task. Method
and full numbers are in `docs/PERFORMANCE.md`.

## Controllers

- **scenarios**: `list/get/active/ensureSeeded/load/reset/advance/subscribe`, plus
  `pendingLink()`. If a `?scenario=` link asks for a different world than the one stored,
  nothing is replaced: `pendingLink()` returns `{ scenario, seed?, reason }` so the UI can
  offer "Load linked scenario". `advance(duration)` runs `definition.timeline` for
  `(committed, committed + duration]`, skips event ids already in `py_events`, applies new
  ones with `definition.applyEvent` inside one transaction, stores them, then commits the
  clock and a checkpoint. Without a timeline it only commits the clock and returns
  `{ applied: 0, skipped: 0 }`.
- **session**: `principal()` via core `resolvePrincipal`, with `actorId` / `organizationId` /
  `role` overrides. `switchActor` / `switchOrganization` persist ids only. `can` / `assert`
  use `definition.policy` or `DEFAULT_POLICY`. Services must call `assert`.
- **overrides**: validated with `OverridesSchema`. Only provided environment keys are kept.
- **theme**: `appearance()` resolves theme, mode, reduced motion and viewport through
  override → persona preference → scenario → manifest default, each with its `source`.
  `resolvedMode` follows `prefers-color-scheme` live. `setPreference` is stored per persona.
  It also resolves the presentation `shell`, `device` and `orientation` (ADR-016) through
  override → scenario → `preview.*`; `auto` becomes `phone` for mobile prototypes and `none`
  otherwise, and a device or orientation that cannot apply (a phone in a desktop window)
  falls back to the default with source `default`. `setOverride({ shell, device,
  orientation })` persists in the control DB only, and `?shell=` applies as an override.
  The app `layout` (ADR-023) resolves the same way (override → scenario →
  `preview.layout.id`, default `custom`); a layout outside `layoutChoices(preview.layout)`
  falls back to the manifest layout with source `default`. `setOverride({ layout })` persists
  in the control DB only, and `?layout=` applies as an override only when the prototype offers
  that layout.
  The style presets `radius`, `elevation`, `font` and `motion` resolve override → scenario
  `appearance` → the theme's own value (`{ value: null, source: 'default' }`).
  `setOverride({ radius: 'round' })` accepts preset ids only (`OverridesSchema`), persists in
  the control DB only and is cleared by `clearOverride()`; the renderer merges them on top of
  the theme (`applyStylePresets` from `@protoyard/themes`).
  **Custom themes** (the DevTools Theme Studio): `saveCustom(theme)`, `removeCustom(id)`,
  `customThemes()`, `isCustom(id)`, `exportTheme(id)` (JSON with `format:
  "protoyard-theme/v1"`) and `importTheme(json)`. They are stored in the control DB
  (`customThemes`), validated with `ThemeSchema` on save, on import (64 KB cap, `JSON.parse`
  only, untrusted input) and again on every boot, where invalid or clashing entries are
  skipped and reported. Ids of built-in or prototype themes are refused, the list is capped at
  24, and removing the active custom theme falls back to the default. Saving re-applies the
  appearance even when the id stays the same.
  **Library themes on demand** (ADR-023): with `resolveTheme(id)` set, an unknown theme id
  from `setOverride`, `setPreference`, a scenario's `appearance.themeId`, a `?theme=` link, a
  restored snapshot or a stored preference at boot is loaded first (shown in `pending` as
  `Loading theme “<id>”…`), validated with `ThemeSchema`, required to carry the requested
  id and registered once; `themes()` then lists it and `isLibrary(id)` is `true`. Boot
  awaits the stored id, so a reload never flashes the default. `theme.ensure(id)` loads one
  explicitly and resolves `undefined` instead of rejecting. A resolver that returns
  `undefined`, throws or returns an invalid theme is reported through `onError` and the
  appearance keeps the visible fallback to the manifest default (source `default`).
  Without `resolveTheme`, behavior is unchanged.
- **environment**: effective state = defaults + scenario environment + org subscription and
  feature flags + `overrides.environment`. `environment.set()` / `reset()` write overrides,
  so they persist and are reversible.
- **clock**: the core clock. Preview never writes data. State is persisted on change.
- **snapshots**: `build/save/list/restore/remove/exportJson/previewImport/importJson`, plus
  `lastWarnings()`. Imports are validated with core `parseSnapshotText` (prototype id must
  match, 25 MB limit). Unknown tables are skipped with a warning. Records are restored in one
  transaction, so a failed import leaves current data untouched. Filenames follow
  `<slug>-<name>-<YYYY-MM-DD>.protoyard.json`.
  A snapshot restores records, active scenario, actor/organization, clock and overrides.
  Per-persona **preferences are not captured**. So the world looks the same as when it was
  saved, the recorded `appearance` (theme, mode) is re-applied as visible, clearable
  **overrides**, but only when it would otherwise differ. Restoring your own snapshot adds
  nothing; a colleague's snapshot shows their theme until you clear the override.
- **data**: `tables()`, `counts()`, `rows(table, { limit ≤ 500, offset })` for the inspector.
- `destroy()` waits for in-flight work, then deletes only this prototype's two databases.
  `close()` closes them.

Mutating scenario operations (`load`, `reset`, `advance`, `restore`, `importJson`) run
serially, so they never interleave. `applyEvent` and `upgrade` run inside IndexedDB
transactions: await only the provided context or Dexie calls there, never `fetch` or timers.

## Tests

`pnpm vitest run packages/runtime` uses the fixture in `tests/fixtures/tasks-prototype.ts`
and covers determinism, integrity across all presets, permissions, non-destructive
overrides, snapshot round-trips and rejections, v1→v2 migration, appearance isolation,
shell precedence/persistence, idempotent advance (7×1 == 1×7), cross-prototype isolation and reopen safety.

## Package output

The manifest keeps TypeScript source exports for workspace development. `pnpm build:packages --filter engine` creates the ESM and declaration files under `dist/` that the packed manifest exposes.
