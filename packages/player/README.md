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

## Where the blueprint comes from

`src/main.ts` calls `startPlayer` (`src/sources/start.ts`), which resolves the
blueprint in a fixed order:

1. **`#bp=<link>`**: a share link in the URL fragment, decoded with
   `decodeBlueprintShare`. Share links need `DecompressionStream('deflate-raw')`
   (Chrome 103+, Safari 16.4+, Firefox 113+). An older browser gets an error
   screen that says so and suggests opening the `blueprint.json` file instead.
   Compressed bytes may differ between engines, so never compare links
   byte for byte across browsers; compare the decoded blueprints.
2. **`?src=./blueprint.json`**: a file next to the player. Only a relative path
   on the same origin, inside the player's folder and ending in `.json`, is
   fetched (`credentials: 'same-origin'`, redirects refused, at most 256 KB).
   Absolute URLs, `//host`, root-relative paths, `..` escapes and backslashes
   are refused without a request.
3. **The picker**: a lazily loaded screen to drop or browse for a
   `blueprint.json` (up to 256 KB), or to open the bundled demo
   (`src/fixtures/demo.blueprint.json`, a copy of the fictional
   `blueprints/field-service-dispatch.json`).

Every path ends in `loadUntrustedBlueprint`: size, depth, row-estimate and
schema checks always run. When a blueprint cannot be opened, the player shows
an accessible error screen instead of a blank page: a focused heading, every
issue with its location and fix (as text, never HTML), and buttons to open
another file or reload. A brand theme that fails at definition time
(`BrandThemeError`) lands on the same screen. Changing the `#bp=` fragment
reloads the page, so the new blueprint boots on a clean runtime. Loading from
an embedding page's `postMessage` is not wired yet.

The boot code (renderer and runtime) is its own chunk, fetched in parallel
with source resolution.

```bash
pnpm vitest run packages/player/tests/sources.test.ts
```

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

Measured with `pnpm --filter @protoyard/player build` (2026-10-20):
- **Initial JavaScript:** 175.0 KB gzip, against the 250 KB budget (176.9 KB before
  source resolution; the boot code moved to a prefetched chunk, and the picker is a
  5.4 KB lazy chunk). The app shell, entity pages, data tables, forms, screen kits, Faker, DevTools and the theme library are all lazy chunks.
- **Initial CSS:** 18.0 KB gzip, against the 30 KB budget.

These budgets are enforced by a dedicated player budget gate, which is planned and not yet written.

## Honest limits

- The no-flash appearance script is keyed by the build namespace (`player`),
  not the blueprint's, so a saved dark mode can flash on first paint.
- Blueprints from an embedding page's `postMessage` are not loaded yet.
- Storage isolation is by namespace on one origin. That is not a security
  boundary (see [SECURITY](../../docs/SECURITY.md)).
