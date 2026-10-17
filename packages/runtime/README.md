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
`throw`), `onError`.

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
- **environment**: effective state = defaults + scenario environment + org subscription and
  feature flags + `overrides.environment`. `environment.set()` / `reset()` write overrides,
  so they persist and are reversible.
- **clock**: the core clock. Preview never writes data. State is persisted on change.
- **snapshots**: `build/save/list/restore/remove/exportJson/previewImport/importJson`, plus
  `lastWarnings()`. Imports are validated with core `parseSnapshotText` (prototype id must
  match, 25 MB limit). Unknown tables are skipped with a warning. Records are restored in one
  transaction, so a failed import leaves current data untouched. Filenames follow
  `<slug>-<name>-<YYYY-MM-DD>.protoyard.json`.
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
idempotent advance (7×1 == 1×7), cross-prototype isolation and reopen safety.
