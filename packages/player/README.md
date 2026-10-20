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
   Worlds generate in a module worker (`src/worker/`). Generated worlds are
   cached by content address in IndexedDB (`src/cache/`, `protoyard.player.worlds`):
   switching back to a scenario, resetting it, or opening a variant of the same
   blueprint, scenario and generator version reloads the stored world instead of
   regenerating. Cache entries are read back as untrusted data (snapshot size and
   row limits, shape checks), and a corrupt entry is dropped and regenerated.
4. The app (`src/PlayerApp.svelte`) lazily loads `BlueprintApp` from
   `@protoyard/crud/app`, the same routes, navigation and screens a generated
   prototype has. The settings screen gets the theme library on demand.

Blueprints with an `assistant` or `team-chat` archetype lazily load the
conversational player entry. It binds the assistant workspace kit to the
archetype's entity slots and persists messages through the normal blueprint
services. Team chat uses the same safe, deterministic simulated assistant
adapter because `@protoyard/ai-ui` has no dedicated team-chat screen. CRUD-only
blueprints never load the AI kit entry.

The page reaches `performance.mark('protoyard:ready')` and
`<html data-protoyard-ready="1">` like any prototype.

## Where the blueprint comes from

`src/main.ts` calls `runPlayer` (`src/run.ts`), which starts `startPlayer`
(`src/sources/start.ts`). `startPlayer` resolves the
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
reloads the page, so the new blueprint boots on a clean runtime. Only when the
player is framed, `runPlayer` also loads the embed chunk and starts
`protoyard-player/1`, so the embedding page can load or replace the blueprint
(see below).

The boot code (renderer and runtime) is its own chunk, fetched in parallel
with source resolution.

```bash
pnpm vitest run packages/player/tests/sources.test.ts
```
The player keeps a small `protoyard.player.index` database with the stored
exploration name, last-opened time, content identity and a best-effort origin
storage estimate. `listExplorations()` reads it, while
`clearExploration(namespace, { confirmed: true })` deletes only that
exploration's `.data`, `.control` and `.validation` databases and its index row. Clearing
without confirmation is rejected. The estimate is origin-wide because browser
storage APIs do not expose per-IndexedDB-database byte counts.

The bundled fictional demo (`src/fixtures/demo.blueprint.json`, a copy of
`blueprints/field-service-dispatch.json`) loads only from the picker. Every source goes through `loadUntrustedBlueprint` (and
`decodeBlueprintShare` for links; see [SECURITY](../../docs/SECURITY.md)).

## Embedding: `protoyard-player/1`

A page that frames the player can hand it blueprints over `postMessage`
(`src/embed/`). It is meant for protoyard.app/play, `protoyard quick` live
iterate, and local tools.

| Direction | Message | Fields |
| --- | --- | --- |
| player → parent | `ready` | `accepts: ['load', 'replace']`, `maxBytes` |
| parent → player | `load` | `id`, `blueprint` (an object or its JSON text) |
| parent → player | `replace` | `id`, `blueprint` (live iterate: swaps the running prototype) |
| player → parent | `loaded` | `id`, `namespace` (`bp-…`), `name` |
| player → parent | `error` | `id`, `issues` (`code`, `path`, `message`, `fix`) |

Every message has `protocol: 'protoyard-player/1'`.

**Who may send.** The player listens only when it is framed. It accepts
messages only from its parent window, and only from the player's own origin
or an origin named in `?embedder=<origin>` that also matches the build-time
allowlist: `https://protoyard.app`, and `localhost` / `127.0.0.1` on any port.
Origins must match exactly, so a path, credentials, another scheme or a
look-alike host never qualifies, and `*` is never accepted. Replies always
name the sender's exact origin.

**What it accepts.**
- A request has exactly `protocol`, `type`, `id` (1 to 64 characters of
  `A-Za-z0-9._:-`) and `blueprint`.
- The blueprint is at most 256 KB of UTF-8 JSON. It goes through
  `loadUntrustedBlueprint` (limits, unsafe keys, control and bidi characters,
  the schema) before anything derives or renders it.
- Anything else from an allowed origin with a usable id is answered with
  `error`, and the issues say how to fix it. Messages that are not this
  protocol are ignored without a reply.

**Each request is answered exactly once.** Requests run one at a time. While
one runs, only the newest waiting request is kept, and the dropped one is
answered `superseded`. A blueprint that validates but fails to start is
answered `boot-failed`, never `loaded`.

The embedding side uses the typed client:

```ts
import { connectPlayer } from '@protoyard/player/src/embed/index.ts';

const iframe = document.querySelector('iframe')!; // src: …/player/?embedder=<this page's origin>
const player = connectPlayer({ frame: iframe, playerOrigin: 'https://protoyard.app' });
await player.ready;
const { namespace } = await player.load(blueprint); // rejects with PlayerEmbedError { issues }
await player.replace(editedBlueprint);
```

The client checks both the sender window and the origin. `playerOrigin` must be
an exact origin, and every request times out (30 s by default).

## Validation tasks

A blueprint with `validation.tasks` (see [GENERATOR](../../docs/GENERATOR.md#validation-tasks))
gets a task panel in a corner of the prototype (`src/validation/`). `bootPlayer` imports it only
for such blueprints, so others download none of it (a 3.5 KB gzip lazy chunk).

- **Flow:** the participant reads the task, presses **Start task**, works in the prototype, and
  either succeeds, presses **Give up**, or runs out of time; **Next task** moves on. All buttons
  are `@protoyard/ui` `Button`s with pending feedback.
- **Success** is evaluated with `evaluateValidationSuccess` on the current hash route and the live
  rows (Dexie `liveQuery`) of the entities the tasks name, counted from when the task started;
  soft-deleted rows do not count.
- **Progress:** which task is current lives in memory, so reloading the page starts again at the
  first task. Recorded attempts persist and stay in the download.
- **Metrics:** outcome, wall-clock duration and steps (route changes plus completed service calls
  from the runtime's pending tracker). Nothing a person types is recorded. Attempts are stored per
  blueprint in IndexedDB (`protoyard.<namespace>.validation`), never sent anywhere, and
  **Download metrics** saves a `protoyard-validation-metrics` v1 JSON file for
  `protoyard quick report`.

```bash
pnpm vitest run packages/player/tests/validation.test.ts
```

## Security

The built `index.html` starts with a strict Content-Security-Policy meta tag, and `dist/_headers`
repeats it as an HTTP header with `frame-ancestors` (a meta tag cannot set it). Hosts other than
Cloudflare Pages or Netlify must send that header themselves; see
[SECURITY](../../docs/SECURITY.md). Clearing an exploration (`clearExploration`) and the boot
error screen's "Reset prototype data" delete the blueprint's data, control and validation
databases, and nothing else on the origin.

```bash
pnpm --filter @protoyard/player build && pnpm vitest run packages/player/tests/security.test.ts
```

## Build settings

The player builds like a prototype with `defineProtoyardConfig`. Its own
`protoyard.json` holds build settings only:
- base `./`, so the output is relocatable;
- DevTools included, and shown unless `?devtools=0`;
- the demo badge;
- offline support, which emits a service worker and precaches the complete build.

Its `storage.namespace` (`player`) is never used for a blueprint's data.
`src/app.css` registers the crud, views, charts and analytics sources with
Tailwind, so every screen kind is styled.

```bash
pnpm --filter @protoyard/player build     # → packages/player/dist (static, base ./)
pnpm --filter @protoyard/player dev
pnpm --filter @protoyard/player preview
pnpm vitest run packages/player/tests/boot.test.ts
pnpm vitest run packages/player/tests/postmessage.test.ts packages/player/tests/run.test.ts
pnpm vitest run packages/player/tests/offline.test.ts
```

The built player is installable from a secure origin. The first visit must be
online so the service worker can precache the shell, manifest, every lazy
screen chunk and the bundled assets; after that, `#bp=` navigations use the
cached shell and keep blueprint data in IndexedDB. Open the player with
`?offline=0` to unregister its worker and clear only this player's offline
cache. This opt-in build behavior is not used by Claude artifact exports,
which reject offline service workers.

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
- The player replays the most recently active blueprint's appearance cache
  before the runtime paints, keyed by its `bp-…` or `keep-…` namespace. A first
  visit without a cached appearance still follows the system color preference.
- Only the bundled demo blueprint loads until the source resolution lands.
- The embed protocol trusts the allowed origin, not the person behind it: any
  page on protoyard.app or on localhost can send blueprints to a player that
  names it in `?embedder=`. A blueprint is data and never runs code, but it
  replaces what the player shows.
- Storage isolation is by namespace on one origin. That is not a security
  boundary (see [SECURITY](../../docs/SECURITY.md)).
