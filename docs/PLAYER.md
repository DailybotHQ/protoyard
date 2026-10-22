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

The example kind blueprints fit comfortably in the current link cap. The
following encoded payload lengths were measured by
`packages/blueprint/tests/kinds/share-kinds.test.ts` with Node 26.11.1; browser
compression engines may produce different lengths.

| Example | Encoded payload characters |
| --- | ---: |
| `decks/cedar-training.json` | 1,666 |
| `decks/example.json` | 844 |
| `decks/harbor-ops-pitch.json` | 1,782 |
| `decks/lumen-launch.json` | 1,512 |
| `decks/northwind-qbr.json` | 1,500 |
| `pages/tidewater-roasters-landing.json` | 1,638 |
| `docs/northwind-quarterly-report.json` | 1,368 |

When a blueprint exceeds the link cap, `protoyard quick` opens its local
`blueprint.json` file and prints that path plus a
`protoyard quick export <slug> --single-file` alternative. The player explains
that an oversized share link should be opened from a blueprint file.

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
1 MiB for a deck, page or doc and 256 KB for an app, redirects refused), then a picker for a local file or the bundled
fictional demo. A framed player also accepts blueprints from its embedding page
over `protoyard-player/1`:
- `load` and `replace` messages;
- only from the player's own origin, or from an `?embedder=` origin that also
  matches the build-time allowlist (`https://protoyard.app`, `localhost`,
  `127.0.0.1`), never `*`;
- every request answered exactly once, with `loaded` or typed issues.

The message table, limits and the typed `connectPlayer` client are in
[the player package README](../packages/player/README.md#embedding-protoyard-player1).

Every source ends in the bounded, kind-aware loader (`loadUntrustedDocument`;
share links through `decodeDocumentShare`). Apps keep the exact
`loadUntrustedBlueprint` limits, and decks, pages and docs get their own (see
[SECURITY](SECURITY.md)). A blueprint that cannot be opened shows an
accessible error screen with every issue and its fix, never a blank page.

### Embedded apps in decks and pages

A content document may include an `embed-app` block (opaque app JSON, bounded
by the blocks untrusted limits). The blocks-ui embed family shows a framed
preview and a **Start the app** button. Only after that click does the host
call `mountEmbed(target, app)`. The player provides that callback
([`kinds/mount-embed.ts`](../packages/player/src/kinds/mount-embed.ts)):

1. It checks the app with `loadUntrustedBlueprint`. Only an app is accepted,
   never a deck, page or doc, so embedding is one level deep.
2. It opens this same player in a frame (`./index.html?devtools=0`, same
   origin, http(s) only).
3. It sends the app over `protoyard-player/1` with the `connectPlayer` client.

The frame gives the embedded app its own runtime, its own content namespace
(`bp-…` from its identity) and its own URL hash, so it never fights the deck
for slide links or storage. Until the click, no app code is downloaded with
the deck or page. A missing host shows an accessible note, and unmount runs the
disposer, which closes the connection and removes the frame. Slide keyboard
navigation must not leak into the running frame: the embed family traps Tab
inside it while the app is open. **Not supported:** the single-file export and
the Claude artifact, which have no `index.html` to frame (the block shows the
error), and `file://` pages.

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

## Content kinds (deck, page and doc)

The player routes by blueprint `kind` (ADR-036) before any boot code loads
([`sources/boot-any.ts`](../packages/player/src/sources/boot-any.ts)):

- An app (no `kind`, or `"app"`) boots through `boot.ts`: the CRUD shell, the
  world worker and Faker, unchanged.
- A deck, page or doc boots through
  [`boot-kind.ts`](../packages/player/src/boot-kind.ts), which never imports
  `boot.ts`, so the CRUD shell, Faker and the worker never download for a
  kind.
- The boot chunk is prefetched only once the source has resolved, for that
  kind alone.

A kind boots like an app around the edges: a content-identity namespace
(`bp-…`, or `?keep=`), the exploration index, the demo badge, themes, shells,
DevTools (`?devtools=0` hides them) and review comments under `quick serve`.
Inside, it runs `defineKindRuntime` (`@protoyard/blueprint/kinds`): one Dexie
version for block state and form responses, the `default` scenario, the
presenter, audience and viewer personas, and no world generator.
[`KindApp`](../packages/player/src/kinds/KindApp.svelte) renders the shared
renderer, the same component a generated kind prototype mounts:

- decks: `DeckApp` (`@protoyard/decks-ui/app`);
- pages: `PageApp` (`@protoyard/pages-ui/page`);
- docs: `DocApp` (`@protoyard/pages-ui/doc`).

Each renderer is its own chunk. KindApp provides the blocks-ui host:

- **Block state:** interactive blocks persist through `createKindServices`
  (resolve the block from the document → `session.assert` → reducer, with the
  active persona as the viewer → `environment.run` → `db.transaction`). The
  host answers at once and attaches to IndexedDB when it is ready.
- **Embedded apps:** `mountEmbed`, as described above.

Form responses use `createFormServices` from `@protoyard/pages`, the same
store and capabilities as the kind services layer.

**Swaps:** live reload (`quick serve`) and `protoyard-player/1` `load` and
`replace` messages accept any kind, and each swap tears the running document
or app down exactly once. A change between two content kinds keeps the world
(they share one store layout). A change to or from an app starts a fresh one.

### Per-kind pages: deck.html, page.html and doc.html

The player build writes three more pages next to `index.html`:
`deck.html`, `page.html` and `doc.html`
([`src/entries/`](../packages/player/src/entries/)). Each page runs one kind:

- It takes the same sources as `index.html` (`#bp=`, `?src=`, the picker, an
  embedding page over `protoyard-player/1`) and the same live reload under
  `quick serve`.
- Every blueprint boots through `boot-kind.ts` only. The kind boot chunk is
  fetched while the source resolves. The app boot is never loaded.
- The stylesheet holds the shared chrome, `@protoyard/blocks-ui/styles.css`
  and the kind's renderer styles: decks-ui for a deck, pages-ui for a page or
  doc. It never holds the crud, views, charts or analytics styles.
  Embedded apps open `index.html` in a frame, which has them.
- The pages share chunks and the one asset manifest
  (`protoyard-player-assets.json`) with `index.html`.
- Each page gets the same CSP meta as `index.html`, with the hashes of its
  own inline scripts. `_headers` allows the inline scripts of all four pages.

A page handed a blueprint of another kind does not run it. It shows
**This blueprint is an app, not a deck** (or the matching kinds) and a link
to the page that runs it (`index.html` for an app), keeping the same query
and hash. In the same tab, a `?src=` file and the share link this tab opened
carry over. Measured sizes are in
[PERFORMANCE](PERFORMANCE.md#player-bundle-budget-measured-2026-10-20).

**Limits.**
- The picker's bundled demo is an app, so on a kind page it leads to that
  link.
- Nothing links to the kind pages yet: the gallery, `/play/` and share links
  still open `index.html`, which runs every kind.

### Deck Studio in the player

A deck with DevTools on (the default; `?devtools=0` turns it off) gets the
**Deck** DevTools tab (`@protoyard/decks-ui/studio`, ADR-038). The deck on
screen is the Studio's live preview. The exported RFC 6902 patch is rooted at
`/deck`, so it applies to the blueprint file (`{ "kind": "deck", "deck": … }`)
rather than to the bare deck document. Edits stay in memory. Without DevTools,
and for pages and docs, the Studio module and its state are never loaded or
created.

