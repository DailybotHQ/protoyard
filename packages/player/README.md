# @protoyard/player

A prebuilt, static app that runs a Protoyard blueprint in the browser with no
build and no install (level 1, [ADR-029](../../docs/DECISIONS.md)). It loads a
blueprint, derives a complete prototype definition from it at runtime, and runs
it on the same engine as a generated prototype:
- IndexedDB data;
- personas, scenarios, simulated time and environment;
- DevTools, themes, layouts and shells.

Everything it shows is simulated. Every page carries the "Prototype · simulated
data" badge.

## How it boots

`src/boot.ts` exports `bootPlayer({ blueprint, target })`:

1. `blueprintIdentity(blueprint)` gives the content namespace `bp-<26 base32>`.
   Each blueprint stores its data in its own IndexedDB databases
   (`protoyard.bp-….data` and `.control`), so two blueprints on one origin never
   share rows, and an edited blueprint opens a fresh world.
   `?keep=<name>` opts into a stable `keep-…` namespace; opening a newer
   blueprint with the same name uses its derived database versions to migrate
   that world's schema instead of creating a fresh content namespace.
2. `definePrototypeFromBlueprint(blueprint, { namespace })` builds the manifest,
   database versions, policy, integrity, scenarios, brand theme, world generator
   and app model, all from `@protoyard/blueprint`.
3. `mountPrototype({ definition, App, target, build })` from
   `@protoyard/renderer-svelte` boots the runtime, seeds the default scenario,
   and mounts the app. The runtime `build` options set the namespace and the
   demo badge for this blueprint.
4. The app (`src/PlayerApp.svelte`) lazily loads `BlueprintApp` from
   `@protoyard/crud/app`, the same routes, navigation and screens a generated
   prototype has. The settings screen gets the theme library on demand.

The page reaches `performance.mark('protoyard:ready')` and
`<html data-protoyard-ready="1">` like any prototype.

The player keeps a small `protoyard.player.index` database with the stored
exploration name, last-opened time, content identity and a best-effort origin
storage estimate. `listExplorations()` reads it, while
`clearExploration(namespace, { confirmed: true })` deletes only that
exploration's `.data` and `.control` databases and its index row. Clearing
without confirmation is rejected. The estimate is origin-wide because browser
storage APIs do not expose per-IndexedDB-database byte counts.

Today `src/main.ts` boots the bundled demo blueprint
(`src/fixtures/demo.blueprint.json`, a copy of the fictional
`blueprints/field-service-dispatch.json`). Loading a blueprint from a `#bp=` share
link, an adjacent `blueprint.json`, a picked file or an embedding page's
`postMessage` is not wired yet. Those sources go through
`loadUntrustedBlueprint` and `decodeBlueprintShare` (see
[SECURITY](../../docs/SECURITY.md)).

## Build settings

The player builds like a prototype with `defineProtoyardConfig`. Its own
`protoyard.json` holds build settings only:
- base `./`, so the output is relocatable;
- DevTools included, and shown unless `?devtools=0`;
- the demo badge.

Its `storage.namespace` (`player`) is never used for a blueprint's data.
`src/app.css` registers the crud, views, charts and analytics sources with
Tailwind, so every screen kind is styled.

```bash
pnpm --filter @protoyard/player build     # → packages/player/dist (static, base ./)
pnpm --filter @protoyard/player dev
pnpm --filter @protoyard/player preview
pnpm vitest run packages/player/tests/boot.test.ts
```

## Size

Measured on the first build of this package:
- **Initial JavaScript:** 176.9 KB gzip, against the 250 KB budget. The app shell, entity pages, data tables, forms, screen kits, Faker, DevTools and the theme library are all lazy chunks.
- **Initial CSS:** 18.2 KB gzip, against the 30 KB budget.

These budgets are enforced by a dedicated player budget gate, which is planned and not yet written.

## Honest limits

- The player replays the most recently active blueprint's appearance cache
  before the runtime paints, keyed by its `bp-…` or `keep-…` namespace. A first
  visit without a cached appearance still follows the system color preference.
- Only the bundled demo blueprint loads until the source resolution lands.
- Storage isolation is by namespace on one origin. That is not a security
  boundary (see [SECURITY](../../docs/SECURITY.md)).
