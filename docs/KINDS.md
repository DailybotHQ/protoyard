# Blueprint kinds

Protoyard blueprints declare a **kind** that selects the renderer, synthesizer,
validation summary and catalog shelf. One JSON format covers four kinds
([ADR-036](DECISIONS.md#adr-036--blueprint-kinds-app-deck-page-and-doc)).

| Kind | Meaning | Body key | Missing `kind` |
| --- | --- | --- | --- |
| `app` | Entity CRUD product (the original shape) | entities, roles, screens… | **Yes — default** |
| `deck` | Slide presentation of blocks | `deck` | No |
| `page` | Single-scroll landing / marketing page of blocks | `page` | No |
| `doc` | Continuous report / one-pager of blocks | `doc` | No |

This is **not** the registry `ProjectKind` (prototype, template, blueprint) in
`@protoyard/core`. That names where a project lives; `BlueprintKind` names what
the blueprint **renders as**.

The constants live in `@protoyard/blueprint` (the `/kinds` subpath holds the
content-kind runtime: `defineKindRuntime`, `createKindServices` and the
personas):

```ts
import {
  BLUEPRINT_KINDS, // ['app', 'deck', 'page', 'doc']
  CONTENT_KINDS,   // ['deck', 'page', 'doc']
  DEFAULT_BLUEPRINT_KIND, // 'app'
  detectBlueprintKind,
  parseAnyBlueprint, // async: loads the kind's body schema on demand
} from '@protoyard/blueprint';
```

`formatVersion` stays **1**. An unknown `kind` fails with a friendly “needs a
newer Protoyard” message. Existing app blueprints never carried `kind`; a
missing field still means `app`, and share links / `bp-` namespaces keep their
content identity ([ADR-036](DECISIONS.md#adr-036--blueprint-kinds-app-deck-page-and-doc)).

## Two levels

| Level | How you run it | Runtime entry |
| --- | --- | --- |
| **1 — Player** | Paste, file, share link, or `?src=` on the prebuilt player / hosted `/play/` | Apps: CRUD shell. Content kinds: `defineKindRuntime` + kind app shell |
| **2 — Generate** | `pnpm protoyard generate <slug> --blueprint <file>` | Same kind definition and the same UI shells as level 1 |

Content kinds share one kind runtime (`defineKindRuntime` in
`@protoyard/blueprint/kinds`): IndexedDB stores for interactive block state and
form responses, three simulated personas (presenter, audience, viewer), and a
single default scenario. They do **not** use the app entity generator or Faker
world.

| Kind | Level 1 shell | Level 2 template |
| --- | --- | --- |
| `app` | `@protoyard/crud/app` (`BlueprintApp`) | `templates/crud-app` (and archetype remixes) |
| `deck` | `@protoyard/decks-ui/app` (`DeckApp`) | `templates/deck` |
| `page` | `@protoyard/pages-ui/page` (`PageApp`) | `templates/page` |
| `doc` | `@protoyard/pages-ui/doc` (`DocApp`) | `templates/doc` |

The player routes by kind **before** loading the app shell
(`packages/player/src/kinds/KindApp.svelte`). Generated prototypes import the
same shells so behavior matches
([Player](PLAYER.md), [Generator](GENERATOR.md)).

## App kind

An **app** blueprint describes entities, roles, screens and optional kits
(SaaS, analytics, AI). It is the format every pre-kind catalog blueprint still
uses.

- **Schema:** `parseBlueprint` / `BlueprintSchema` (app-only). Prefer
  `parseAnyBlueprint` when the file might be any kind.
- **Runtime:** entity services, scenario generators, policy from roles.
- **UI:** list / detail / form screens and layout chrome from the CRUD kit.
- **Honest limits:** roles are UX, not security; data is fictional and
  browser-local. See [Generator](GENERATOR.md), [Database](DATABASE.md),
  [Scenarios](SCENARIOS.md).

```bash
pnpm protoyard blueprint validate blueprints/crm.json
pnpm protoyard generate my-crm --blueprint blueprints/crm.json --dry-run
```

## Deck kind

A **deck** is a bounded slide presentation of [blocks](BLOCKS.md).

- **Body:** `deck` object (slides with stable ids, steps, notes, layouts).
- **Engine / UI:** `@protoyard/decks`, `@protoyard/decks-ui`.
- **Navigation:** hash `#/<slide-id>/<step>`; keyboard, overview, presenter and
  print paths are documented in [Decks](DECKS.md).
- **Catalog:** `blueprints/decks/`.
- **Custom slides (level 2 only):** a `layout: "custom"` slide renders a
  component the generated deck registers in its own `src/custom-slides.ts`
  (loaded lazily, given `{ slide, step, stepCount, data }`). The player has
  no owned code and shows a labelled placeholder; see
  [Decks: Custom slides](DECKS.md#custom-slides).
- **Honest limits:** speaker notes and overlays are simulation chrome; there is
  no live multiplayer presenter backend.

```bash
pnpm protoyard list --kind blueprint
pnpm protoyard blueprint validate blueprints/decks/lumen-launch.json
pnpm protoyard generate lumen-deck --blueprint blueprints/decks/lumen-launch.json --dry-run
```

## Page kind

A **page** is one scrolling marketing or landing document: ordered sections of
blocks, optional top nav and form refs.

- **Body:** `page` (`PageDocument` from `@protoyard/pages`).
- **UI:** `PageHost` / `PageApp` with marketing layout chrome ([Pages](PAGES.md),
  [Layouts](LAYOUTS.md)).
- **Forms:** public form blocks store responses through `createFormServices`
  (simulated capabilities `form:submit`, `form:read`, `form:admin`). Not real
  auth or email delivery.
- **Catalog:** `blueprints/pages/`.
- **Honest limits:** one document scroll, not a multi-route website; no real
  analytics or CRM pipeline.

```bash
pnpm protoyard blueprint validate blueprints/pages/tidewater-roasters-landing.json
pnpm protoyard generate tidewater --blueprint blueprints/pages/tidewater-roasters-landing.json --dry-run
```

## Doc kind

A **doc** is one continuous flow of blocks (report, guide, one-pager) with an
optional TOC and print preferences.

- **Body:** `doc` (`DocDocument` from `@protoyard/pages`).
- **UI:** `DocHost` / `DocApp` with docs layout chrome and heading TOC
  ([Pages](PAGES.md)).
- **Print:** continuous flow print CSS (not deck slide-per-page).
- **Catalog:** `blueprints/docs/`.
- **Honest limits:** not a full wiki or CMS; versioning and multi-author
  editing are product stories you model with app kinds if needed.

```bash
pnpm protoyard blueprint validate blueprints/docs/northwind-quarterly-report.json
pnpm protoyard generate northwind-report --blueprint blueprints/docs/northwind-quarterly-report.json --dry-run
```

## Authoring by kind

| Step | Command / API | Notes |
| --- | --- | --- |
| List catalog blueprints | `pnpm protoyard list --kind blueprint` | Includes app and content examples under `blueprints/` |
| Brief → draft | `pnpm protoyard blueprint new <file> --from-brief …` | App blueprints only: a deck, page or doc brief is detected and refused (exit 4). Use `quick` (it detects the kind, or pass `--kind`) for content kinds ([Brief to prototype](BRIEF_TO_PROTOTYPE.md)) |
| Validate | `pnpm protoyard blueprint validate <file>` | Exit 4 lists path-specific issues; content kinds use body schemas from decks/pages engines |
| Authoring diagnostics | `validateBlueprintForAuthoring(input)` from `@protoyard/blueprint` | JSON path + hint; same package as the CLI |
| Generate | `pnpm protoyard generate <slug> --blueprint <file>` | Picks `templates/deck`, `templates/page` or `templates/doc` from kind; apps use `crud-app` unless remixed |
| Quick exploration | `pnpm protoyard quick "<brief>"` | Disposable level-1 play on the prebuilt player ([Quick](QUICK.md)) |
| Play without generate | Player / `/play/` | Paste or load JSON; kind routes before the app shell ([Player](PLAYER.md)) |

```bash
# Kind-aware brief: quick detects deck, page or doc (or pass --kind)
pnpm protoyard quick "A one-page quarterly report with charts for a fictional analytics product"

# Validate any kind (quick writes .protoyard/quick/<slug>/blueprint.json)
pnpm protoyard blueprint validate .protoyard/quick/<slug>/blueprint.json

# Plan a generated prototype
pnpm protoyard generate q3-report --blueprint .protoyard/quick/<slug>/blueprint.json --dry-run
```

Shared content primitives for deck/page/doc are documented in
[Blocks](BLOCKS.md). Deck-only structure lint and layouts are in
[Decks](DECKS.md) and the blueprint package README.

## Rendering and packages

| Concern | Package / path |
| --- | --- |
| Kind union and untrusted load | `@protoyard/blueprint` (`parseAnyBlueprint`, untrusted loader) |
| Content runtime + services | `@protoyard/blueprint/kinds` (`defineKindRuntime`, `createKindServices`) |
| Page/doc bodies, forms, TOC | `@protoyard/pages` |
| Page/doc Svelte shells | `@protoyard/pages-ui` (`PageApp`, `DocApp`, hosts, form UI, print) |
| Deck bodies + canvas math | `@protoyard/decks` |
| Deck Svelte shell | `@protoyard/decks-ui` |
| Block schemas + families | `@protoyard/blocks`, `@protoyard/blocks-ui` |
| App entities + CRUD UI | `@protoyard/blueprint`, `@protoyard/crud` |
| No-install runner | `@protoyard/player` |

Page and doc document helpers that wrap a body into a kind runtime without a
full envelope:

```ts
import {
  definePrototypeFromPage,
  definePrototypeFromDoc,
} from '@protoyard/blueprint/kinds';
```

Those wrappers call `defineKindRuntime`. Prefer `defineKindRuntime` when you
already have a full content blueprint (`formatVersion`, `name`, `kind`, body).

## Catalog discovery

| Location | Contents |
| --- | --- |
| `blueprints/*.json` | App product blueprints |
| `blueprints/decks/` | Deck examples |
| `blueprints/pages/` | Page examples |
| `blueprints/docs/` | Doc examples |
| `blueprints/quick/` | Compact starters for `quick` |
| `templates/deck`, `templates/page`, `templates/doc` | Level-2 scaffolds selected by `generate` |
| `templates/crud-app` (and others) | App scaffolds |

```bash
pnpm protoyard list --kind blueprint
pnpm protoyard list --kind template
```

## Validation and honesty

- **Untrusted input:** share links, pasted JSON and `?src=` files pass a bounded
  loader (size, depth, stripped controls) before schema parse
  ([Security](SECURITY.md)).
- **Simulated only:** personas, form responses, decks presenter channels and
  billing kits are prototype UX. Never describe them as production security or
  real multiplayer infrastructure.
- **Fictional data:** use `.example` / `example.com` identities in catalog and
  fixtures.
- **Unknown kinds:** fail closed with an upgrade message; do not invent a
  renderer.
- **App vs content storage:** apps use entity tables; content kinds use
  `blockStates` and `formResponses` only. Switching kind identity changes the
  world namespace story — see [Player](PLAYER.md) storage notes.

## Related guides

| Guide | Kind focus |
| --- | --- |
| [Blocks](BLOCKS.md) | Shared block vocabulary for deck/page/doc |
| [Decks](DECKS.md) | Slide navigation, presenter, print |
| [Pages](PAGES.md) | Page and doc bodies, forms, TOC, print |
| [Layouts](LAYOUTS.md) | Marketing and docs chrome used by page/doc hosts |
| [Player](PLAYER.md) | Level 1 entry points and parity |
| [Generator](GENERATOR.md) | Level 2 generate / regenerate |
| [Brief to prototype](BRIEF_TO_PROTOTYPE.md) | Offline brief synthesizer |
| [Quick](QUICK.md) | Disposable explorations |
| [Development commands](DEVELOPMENT_COMMANDS.md) | Full CLI table |
| [Decisions](DECISIONS.md) | ADR-036 and follow-ons |

## Commands quick reference

Documented in [Development commands](DEVELOPMENT_COMMANDS.md); common kind
paths:

```bash
pnpm protoyard list --kind blueprint
pnpm protoyard blueprint validate <file>
pnpm protoyard blueprint new <file> --from-brief <brief> [--generate <slug>] [--dry-run]   # app briefs only
pnpm protoyard generate <slug> --blueprint <file> [--dry-run]
pnpm protoyard quick "<brief>"
pnpm --filter @protoyard/player dev
pnpm protoyard validate <slug> --build
```
