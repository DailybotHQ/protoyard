# Protoyard Player

The player is the no-install way to explore a blueprint. It derives a working
prototype in the browser and uses IndexedDB for simulated data; it does not
connect to a product backend. Generated prototypes remain the second level:
they are ordinary Vite apps that can be edited, validated and exported.

## What level 1 gives you

A blueprint (`blueprint.json`) is data only. The player turns it into a running
prototype with no build and no install:
- The same app a generated prototype renders: `BlueprintApp` from
  `@protoyard/crud/app`, with the blueprint's routes, navigation, layout and
  every screen kind. Assistant and team-chat archetypes get the conversational
  workspace.
- A real runtime: IndexedDB data, personas and simulated roles, the blueprint's
  scenarios (`empty`, `active`, `viewer`, `massive`), simulated time and
  environment, themes (including a brand theme), layouts, device shells, and
  DevTools (hide them with `?devtools=0`).
- Entity services that validate every write
  (`session.assert` → zod → `environment.run` → `db.transaction`).

Everything is simulated, and every page shows the "Prototype · simulated data"
badge. Promote an exploration to level 2 with `protoyard generate` (see
[Validate and promote](#validate-and-promote)).

## Entry points

- Run the workspace player with `pnpm --filter @protoyard/player dev`.
- Build a hosted showcase with
  `pnpm protoyard showcase --site https://protoyard.app`; the build contains
  `/play/` and the standalone player assets at `/player/`.
- Open an eligible prototype or blueprint from its gallery detail page with
  **Open in player**. The gallery builds a `/play/#bp=…` link from validated
  blueprint data; entries without a blueprint file or links over the share
  limit do not show the action. The configured site base is preserved.
- `/play/` accepts a pasted blueprint JSON document up to 256 KB and opens
  share links. Its frame uses the player's exact-origin `protoyard-player/1`
  bridge. Share fragments stay in the browser URL and are not sent to the
  server.
- The hosted gallery publishes this guide and the other user-facing guides at
  `/docs/`; contributor and internal guides are not included. A search box on
  the docs pages finds sections by guide title, heading and text, and opens
  the matching heading.
  - The index is a static file (`/docs/search-index.json`), generated at build
    time and fetched only when a reader focuses or types in the box.
  - Nothing is sent to a remote service.
  - Arrow keys choose a result, Enter opens it, Escape closes the list and
    then clears the query, and a live region announces the result count.
- With a configured site (`--site` or `GALLERY_SITE`), `sitemap.xml` lists
  `/play/`, `/docs/` and every published guide as absolute, base-aware URLs,
  and `robots.txt` points at it. Share instances (`/play/#bp=…`, `?src=…`) are
  never listed: each one is a viewer's blueprint, not a page of the site.

The player also supports a `?src=./blueprint.json` URL for a JSON file next to
the player. The picker accepts a local file or the bundled fictional demo.
Every source passes the bounded, untrusted blueprint loader before it is used.
See [SECURITY](SECURITY.md) for the trust boundaries and
[the player package README](../packages/player/README.md) for the runtime and
embed protocol.

## Share links and browser support

Share links use `CompressionStream('deflate-raw')` to create and
`DecompressionStream('deflate-raw')` to open a link. Both are available in
Chrome 103+, Safari 16.4+ and Firefox 113+. The hosted playground disables
share-link creation with a clear message when compression is unavailable; the
player explains when decompression is unavailable and still offers file
loading. Use the blueprint file when a link is too large. The encoded bytes
may differ across browser engines, so never compare share URLs byte for byte;
compare the decoded blueprint data.

`decodeBlueprintShare` (`@protoyard/blueprint`) reports this case itself as an
`unsupported-browser` issue naming those browsers, and `encodeBlueprintShare`
throws an equally clear error. So the CLI, the site and the player all say the
same thing instead of "invalid link". `supportsShareLinks()` checks support
before trying.

Share links contain the blueprint itself. The player refuses links longer
than 16 KB and decoded input larger than 256 KB. Pasted text is capped at 256
KB before JSON parsing. The `/play/` landing page is indexable, but a visit
with a share fragment is marked `noindex`.

The hosted player sends a Content Security Policy from the showcase root
`_headers` file under `/player/*`; this includes `frame-ancestors` because a
meta policy cannot set it. Its `style-src` keeps `'unsafe-inline'` for the
runtime style attributes and elements Svelte and the theme engine create.
Cloudflare Pages reads `_headers` only at the output root, so showcase builds
merge the player rules there rather than relying on the nested player file.

A local `pnpm --filter @protoyard/player build` writes the app to
`packages/player/dist/app/`, next to the published embed client in
`dist/embed/`. The folder holds `_headers` and `protoyard-player-assets.json`,
the sha256 list of every other file that `protoyard quick` verifies before it
copies the player.

## Where a blueprint comes from

The player resolves its source in a fixed order: a `#bp=` share link, then
`?src=./blueprint.json` (a same-origin relative path next to the player, at most
256 KB, redirects refused), then a picker for a local file or the bundled
fictional demo. A framed player also accepts blueprints from its embedding page
over `protoyard-player/1`:
- `load` and `replace` messages;
- only from the player's own origin, or from an `?embedder=` origin that also
  matches the build-time allowlist (`https://protoyard.app`, `localhost`,
  `127.0.0.1`), never `*`;
- every request answered exactly once, with `loaded` or typed issues.

The message table, limits and the typed `connectPlayer` client are in
[the player package README](../packages/player/README.md#embedding-protoyard-player1).

Every source ends in the bounded loader (`loadUntrustedBlueprint`). A blueprint
that cannot be opened shows an accessible error screen with every issue and its
fix, never a blank page.

### Embedded apps in decks and pages

A content document may include an `embed-app` block (opaque app JSON, bounded
by the blocks untrusted limits). The blocks-ui embed family shows a framed
preview and a **Start the app** button. Only after that click does the host
call `mountEmbed(target, app)`. KINDS is expected to provide that callback:
validate with `loadUntrustedBlueprint`, then mount a **level-1** app runtime
into `target` (never a nested deck). Until the click, no app code is
downloaded with the deck or page. A missing host shows an accessible note;
unmount runs the disposer returned by `mountEmbed`. Slide keyboard navigation
must not leak into the running frame — the embed family traps Tab inside the
frame while the app is open. Full mount wiring lives with the player / KINDS
runtime, not inside `@protoyard/blocks`.

## Storage: identity and keep mode

Each blueprint runs in its own IndexedDB databases, named by its content:
- **Content mode (default):** `blueprintIdentity` hashes the canonical JSON
  (SHA-256) into a `bp-<26 base32>` namespace. Key order and formatting don't
  matter, but any content edit opens a fresh world. Two blueprints on one origin
  never share rows.
- **Keep mode (`?keep=<name>`):** a stable `keep-…` namespace. Opening a newer
  version of the blueprint migrates the stored world through the blueprint's
  derived database versions instead of starting over. This is for iterating on
  one idea.

The player lists stored explorations (`protoyard.player.index`) and deletes one
only with confirmation. Namespaces isolate data; they are not a security
boundary.

## Worlds: worker generation and cache

The player generates worlds in a module Web Worker. The worker graph is 200 KB
gzip, with Faker's English locale only, and
`packages/player/tests/worker-bundle.test.ts` budgets it at 250 KB.

Page and doc runtimes come from `@protoyard/blueprint/kinds` (`defineKindRuntime`, or `definePrototypeFromPage` / `definePrototypeFromDoc` wrappers). See [`@protoyard/blueprint/kinds`](../packages/blueprint/README.md) and [`@protoyard/pages`](../packages/pages/README.md).

Generated worlds are cached by content address in `protoyard.player.worlds`:
- **Key:** blueprint SHA-256, scenario id, seed, scenario digest and generator
  version.
- **Format and eviction:** gzip, least recently used past 48 MB.
- **Effect:** switching back to a scenario, resetting it, or opening a variant of
  the same blueprint reloads the stored world without regenerating.
- **Untrusted reads:** cache entries are read back as untrusted data (25 MB
  inflated, 250,000 rows, shape and id checks); a bad entry is dropped and the
  world regenerates.

## Parity with generated prototypes

Level 1 and level 2 are one app (ADR-029). For each of the 40 catalog
blueprints, `packages/blueprint/tests/runtime-parity.test.ts` generates a real
prototype with the CLI and compares it with the player's runtime definition:
- database versions, policy, integrity and scenarios;
- the generator version and the default and brand themes;
- routes, navigation and layout (generated apps render the same `BlueprintApp`
  from the same blueprint);
- the seeded world, byte for byte, for a fixed seed.

Three blueprints also boot both definitions on the real runtime and compare
every table.

The limits of that guarantee:
- A generated prototype's owned files (`src/App.svelte`, extra screens, wrapped
  generators such as the help desk's) can add behavior the player doesn't have.
  `BlueprintApp`'s `home`, `extraRoutes`, `recordHref` and `actions` props are
  where those additions plug in.
- The player runs only what the blueprint declares; it has no hand-written
  screens or custom generators.

## Guided tours (simulated time)

The player and DevTools share a reusable guided-tour model from
`@protoyard/devtools` (`packages/devtools/src/tours`). A tour is a data-only
definition: ordered steps with a title, body, optional CSS `target`, and an
optional absolute story `day`. The controller advances step by step, is
dismissible, and never mutates the simulation clock itself.

When a step declares a higher `day` than the previous beat, the controller
emits a `ClockAdvanceRequest`. The host fulfills it through the public
scenario API:

```ts
import {
  createScenarioClockHandler,
  createTourController,
  TourPlayer,
} from '@protoyard/devtools';
import { mount } from 'svelte';

const controller = createTourController(myTour, {
  onClockAdvance: createScenarioClockHandler((duration) =>
    runtime.scenarios.advance(duration)
  ),
});
mount(TourPlayer, { target: document.body, props: { controller } });
```

Rules that keep tours safe and deterministic:
- Step order and day offsets come only from the definition (no `Math.random`
  or wall clock).
- Moving **back** never reverses time; story day stays at the highest day
  reached so a later forward step only requests the remaining delta.
- A missing or invalid `target` selector returns `null`; the card still
  renders and Next / Dismiss keep working (no throw, no blank screen).
- `Dismiss` ends the session; call `reset()` before starting again.
- Clock failures (for example no active scenario) reject the step change and
  leave the previous state in place.

Unit coverage lives in `packages/devtools/tests/tours.test.ts` (step
progression, clock requests, missing targets, dismiss).

## Offline

The built player is installable from a secure origin and works offline after one
online visit:
- the service worker precaches the shell, every lazy screen chunk and the bundled
  assets;
- `#bp=` links then open from the cache, and blueprint data stays in IndexedDB;
- `?offline=0` unregisters the worker and clears only the player's offline cache.

Claude artifact exports reject offline service workers.

## Search engines

`/play/` is the indexable landing page. The standalone player (`/player/`, and
every `/player/#bp=` link) is an app, not a page: its `index.html` carries
`<meta name="robots" content="noindex">`
(`packages/player/tests/indexing.test.ts` checks the built HTML).
`robots.txt` still allows crawling, so crawlers can read that tag. The sitemap
lists `/play/` and the guides, never `/player/` or share instances. A full
`pnpm build:showcase` on 2026-10-20 produced 192 sitemap entries, each mapped
to a built page.

## Measured size and speed

All numbers come from real runs on 2026-10-20 (Apple M1 Max, macOS, Chromium 156,
with other builds running). They are not calibrated budgets.

| Measure | Value | Gate |
| --- | --- | --- |
| Initial JavaScript (gzip) | 178.1 KB | 250 KB (`packages/player/tests/budget.test.ts`) |
| Initial CSS (gzip) | 18.1 KB | 30 KB (same test) |
| World-generation worker graph (gzip) | 200.2 KB | 250 KB (`worker-bundle.test.ts`) |
| First visit through `#bp=`, catalog blueprints (median) | 190–232 ms | report only |
| Repeat visit (stored world) | 76–107 ms | report only |
| Scenario switch that generates | 55–74 ms | report only |
| Scenario switch served by the world cache | 7.9–9.8 ms | report only |
| Large fixture (40 entities): first visit / cache hit | 368 ms / 66 ms | report only |

Reproduce the timings with `pnpm exec tsx scripts/bench-player.ts --runs 3` after
building the player. The method, every phase and the main-thread long-task
trace are in [PERFORMANCE](PERFORMANCE.md#player-blueprint-to-ready-measured-2026-10-20).

## Honest boundaries

- **Simulated, not secure:** roles, sign-in and permissions are a UX
  simulation, not security. Data is fictional and lives in this browser only.
- **Shared origin:** isolation between blueprints is by IndexedDB namespace on
  one origin. Any script on that origin can read every namespace.
- **Embedding trust:** the embed protocol trusts the allowed origin, not the
  person behind it. Any page on protoyard.app or localhost can send a blueprint
  to a player that names it in `?embedder=`. A blueprint is data and never runs
  code, but it replaces what the player shows.
- **Share links:** they need a current browser (see above) and may encode to
  different bytes in different engines.
- **Main-thread work:** generation runs in a worker, but the runtime still
  builds a main-thread generation context (and loads Faker there) before each
  generation. On very large worlds the main thread spends about 55 ms receiving
  the worker's result.
- **First paint:** the no-flash appearance script replays the most recently
  active blueprint's appearance; a first visit follows the system color
  preference.

## Validate and promote

```bash
pnpm vitest run packages/player/tests/sources.test.ts
pnpm --filter @protoyard/player typecheck
pnpm protoyard showcase --site https://protoyard.app
```

When the exploration is ready to become a full project, generate a prototype
from its blueprint and validate the generated application:

```bash
pnpm protoyard generate my-prototype --blueprint path/to/blueprint.json
pnpm protoyard validate my-prototype --build
```

## Content kinds (page and doc)

When the blueprint `kind` is `page` or `doc`, the player mounts
`@protoyard/pages-ui` `PageApp` / `DocApp` with the runtime from
`defineKindRuntime` (`@protoyard/blueprint/kinds`). Form responses use
`createFormServices` from `@protoyard/pages` (same store and capabilities as
the kind services layer).

