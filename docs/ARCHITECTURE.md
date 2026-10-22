# Architecture

Protoyard is a pnpm workspace with four kinds of code:

1. **The engine.** Framework-agnostic TypeScript packages that give every
   prototype a database, scenarios, sessions, time, environment, themes and
   snapshots.
2. **The experience.** Svelte 5 packages that render prototypes: the renderer,
   the UI library (with shared layouts and shell frames) and the DevTools
   panel.
3. **The kits.** Optional, lazy packages a prototype opts into: the blueprint
   generator and CRUD screens, rich views, charts, analytics, simulated SaaS
   and AI flows, content blocks, decks, pages and docs, workflows,
   gamification, review comments and fictional avatars. Each engine package
   (no Svelte) has a matching `-ui` package where it renders.
4. **The tooling.** The `protoyard` CLI, the prebuilt player and the Astro
   gallery.

Prototypes and templates sit beside these as independent Vite apps.

## Repository layout

```text
protoyard/
├── packages/
│   ├── core/             contracts: zod schemas + interfaces, PRNG, clock, environment, policy
│   ├── database/         Dexie/IndexedDB: per-prototype data + control DBs, world I/O, storage errors
│   ├── scenarios/        generator SDK (seeded faker/rng/ids/time), presets, integrity, timeline
│   ├── runtime/          createPrototypeRuntime(): composes everything into one PrototypeRuntime
│   ├── themes/           six presets + a lazy 64-theme library, palette engine, fonts, no-flash script
│   ├── ui/               Svelte 5 components (Bits UI + Tailwind 4 + Lucide), shell frames, LayoutHost + 12 layouts
│   ├── devtools/         the in-browser control center (incl. Theme Studio)
│   ├── renderer-svelte/  Vite config factory, mountPrototype(), ShellHost, reactive bindings, hash router
│   ├── http/             optional fetch-compatible mock API over prototype services (no server, no service worker)
│   ├── offline/          optional build-time service worker for exported prototypes (opt-in)
│   ├── blueprint/        data-only blueprints: schema, screens, brief synthesizer, entity services (no Svelte)
│   ├── crud/             EntityList/Detail/Form + lazy dashboard, board, calendar, timeline, map, analytics, settings screens
│   ├── views/ views-ui/  rich view engines (no Svelte) / lazy Svelte views, one subpath each
│   ├── charts/ charts-ui/        chart math (no Svelte) / Svelte charts, one lazy subpath per family
│   ├── analytics/ analytics-ui/  events, metrics, funnels, cohorts (no Svelte) / KPI tiles, filters, dashboard grid
│   ├── saas/ saas-ui/    simulated auth, OAuth, MFA, workspaces, billing / their screens and routes
│   ├── ai/ ai-ui/        simulated assistants, agents, tools, voice / assistant workspace and widget
│   ├── review/ review-ui/        review comments engine and adapters / lazy comment overlay
│   ├── avatars/          175 fictional portraits (WebP) + verified manifest, data only
│   ├── blocks/ blocks-ui/        content block schemas, limits, formulas (no Svelte) / lazy renderers, one subpath per family
│   ├── decks/ decks-ui/          deck schema, 21-layout catalog, style, lint data / DeckApp, presenter, print, Deck Studio
│   ├── pages/ pages-ui/          page and doc schemas, TOC, form responses / PageApp, DocApp, forms, print CSS
│   ├── flows/ flows-ui/          serializable workflows and simulated runs / workflow editor and run panels
│   ├── gamification/ gamification-ui/  points, levels, badges, missions, streaks / their chips and panels
│   ├── player/           prebuilt static player for app, deck, page and doc blueprints (level 1), per-kind entries
│   ├── templates/ protoyard/ create-protoyard/   npm packaging: templates, the unscoped bin, the scaffolder
│   └── cli/              the `protoyard` command (index, new, generate, dev, validate, build, export, publish, showcase…)
├── apps/gallery/         Astro static site + /marketplace/ — reads the metadata registry only
├── templates/<name>/     functional starting points (same layout as a prototype)
├── prototypes/<slug>/    independent apps (crm-demo, mobile-banking-demo, ai-chat-demo, yours…)
├── blueprints/           data-only product blueprints for `protoyard generate`
├── tests/                shared test support, unit tests and Playwright E2E
├── scripts/              benchmarks, visual sweep, thumbnails, avatar import, hygiene check
└── docs/                 this documentation
```

## Package graph

```text
                    ┌──────────────┐
                    │ @protoyard/  │  zod schemas, interfaces, rng, clock,
                    │    core      │  environment, policy (no framework)
                    └──────┬───────┘
          ┌────────────────┼─────────────────┬───────────────┐
          ▼                ▼                 ▼               ▼
   ┌────────────┐   ┌────────────┐    ┌────────────┐   ┌──────────┐
   │  database  │   │ scenarios  │    │   themes   │   │   cli    │──┐
   └─────┬──────┘   └─────┬──────┘    └─────┬──────┘   └──────────┘  │ drives Vite via
         └───────┬────────┘                 │                        │ renderer-svelte/vite
                 ▼                          │                        │
          ┌────────────┐                    │                        │
          │  runtime   │ ◄──────────────────┘ (theme list passed in)  │
          └─────┬──────┘                                             │
                ▼                                                    │
   ┌─────────────────────────┐    ┌──────────┐   ┌──────────┐        │
   │    renderer-svelte      │───►│ devtools │──►│    ui    │        │
   └────────────┬────────────┘    └──────────┘   └──────────┘        │
                ▼                                                    │
     prototypes/<slug>  (Vite + Svelte app) ◄───────────────────────┘
```

`core` has a single runtime dependency, zod, plus Faker for types. Nothing
under `core`, `database`, `scenarios` or `runtime` imports Svelte (ADR-002 in
[DECISIONS.md](DECISIONS.md)).

The kits build on that graph. Their workspace dependencies, from each
`package.json`:

| Package | Depends on (`@protoyard/…`) |
| --- | --- |
| `avatars` | nothing (data only); used by `scenarios`, `views` and `saas` |
| `blueprint` | `blocks`, `core`, `decks`, `pages`, `scenarios`, `themes` |
| `crud` | `blueprint`, `core`, `ui`, `renderer-svelte`, `views`, `views-ui`, `analytics`, `analytics-ui`, `charts-ui` |
| `views` / `views-ui` | `avatars`, `core` / `views`, `ai`, `core`, `renderer-svelte`, `ui` |
| `charts` / `charts-ui` | `core` / `charts` |
| `analytics` / `analytics-ui` | `core`, `scenarios` / `analytics`, `charts-ui`, `renderer-svelte`, `ui` |
| `saas` / `saas-ui` | `avatars`, `core` / `saas`, `core`, `renderer-svelte`, `ui` |
| `ai` / `ai-ui` | `core` / `ai`, `charts-ui` |
| `review` / `review-ui` | `core`, `database` / `review`, `core`, `ui`, `views`, `views-ui` |
| `blocks` / `blocks-ui` | `ai`, `avatars`, `core` / `ai`, `blocks`, `charts-ui`, `core`, `decks`, `renderer-svelte`, `ui`, `views-ui` |
| `decks` / `decks-ui` | `ai`, `blocks`, `themes` / `blocks`, `blocks-ui`, `decks` |
| `pages` / `pages-ui` | `blocks`, `core` / `blocks`, `blocks-ui`, `blueprint`, `pages`, `renderer-svelte`, `ui` |
| `flows` / `flows-ui` | nothing / `flows` |
| `gamification` / `gamification-ui` | nothing / `gamification`, `ui` |
| `player` | `ai`, `ai-ui`, `analytics`, `analytics-ui`, `blocks-ui`, `blueprint`, `charts-ui`, `core`, `crud`, `decks-ui`, `pages-ui`, `renderer-svelte`, `saas`, `saas-ui`, `themes`, `ui`, `views-ui` |

`renderer-svelte` also depends on `review-ui`, which it imports lazily only
when a build turns review comments on, and on `offline`, whose Vite plugin
adds the service worker only to builds that ask for it. The CLI
uses `blueprint`, `core`, `crud`, `offline`, `player`, `renderer-svelte`,
`review`, `scenarios`, `templates` and `themes`.

This graph describes workspace dependencies. For public package names,
supported install paths, export subpaths, and the current npm release status,
see [PACKAGES.md](PACKAGES.md). Workspace development stays source-first;
published engine and Svelte packages map their exports to built `dist/` files.

## The prototype contract

```text
prototypes/<slug>/
├── protoyard.json        data-only manifest (indexed without executing code)
├── package.json          "@prototype/<slug>", private, workspace deps
├── index.html            #app mount point
├── vite.config.ts        defineProtoyardConfig({ root: import.meta.dirname })
├── src/
│   ├── main.ts           mountPrototype({ definition, App, target })
│   ├── prototype.ts      definePrototype({ manifest, database, scenarios, generate, policy, integrity, timeline?, applyEvent? })
│   ├── App.svelte        shell + hash router
│   ├── database/schema.ts   Dexie store definitions + versions/migrations + row types
│   ├── domain/           services (policy assert → validation → environment.run → transaction) + policy
│   ├── scenarios/        scenario list + deterministic generator
│   └── screens/ components/
└── tests/                generator + service tests on the real runtime
```

The manifest schema is `PrototypeManifestSchema` in `packages/core/src/manifest.ts`.
`src/prototype.ts` imports the same JSON, so metadata has a single source of
truth (ADR-003).

## Runtime lifecycle

```text
mountPrototype()
  ├─ parseScenarioLink(location.search)       ?scenario=&actor=&seed=&theme=&mode=&shell=&layout=&sandbox=&devtools=&comments=
  ├─ createPrototypeRuntime(definition, { themes: BUILTIN_THEMES + definition.themes, link })
  │    ├─ open protoyard.<ns>.data      (domain tables + py_organizations/personas/memberships/events)
  │    └─ open protoyard.<ns>.control   (state, preferences, snapshots)
  ├─ runtime.scenarios.ensureSeeded()   seeds ONLY when no scenario was ever loaded
  ├─ bindAppearance()                   applies --py-* tokens to <html>, caches for the no-flash script
  ├─ mount App (runtime in Svelte context)
  └─ if DevTools enabled: import('@protoyard/devtools') → mount panel
```

A scenario load does four things:

1. Optionally saves a safety snapshot.
2. Runs `generate(ctx)` with a seeded `GenerateContext`, or, when the
   definition provides it, `generateWorld(scenario)` with no context built
   (the player uses it to generate in a Web Worker).
3. Validates the declared integrity rules.
4. Clears and rewrites the data DB in a single transaction, then resets the
   clock, overrides and actor.

Nothing outside this prototype's two databases is touched.

## Data flow inside a prototype

```text
UI event ─► domain service ─► session.assert(capability, record)   (simulated policy)
                           ─► zod validation                       (field errors)
                           ─► environment.run(op, …)               (latency / offline / failures)
                           ─► db.transaction('rw', tables…)        (atomic related writes)
Dexie liveQuery ◄───────────────────────────────────────────────── table change
UI re-renders (renderer-svelte `liveQuery()` → `.current/.loading/.error`)
```

Components never write to the database directly; they call services.
`runService()` from the renderer turns permission and simulated-network
errors into toasts, and returns validation errors to the form for inline
display.

While any of this is in flight, `runtime.pending` counts it (every
`environment.run`, scenario load, time advance, snapshot restore and identity
switch), and the renderer shows a global top bar plus `aria-busy` on the app
root after 150 ms. A `@protoyard/ui` `Button` whose `onclick` returns the
service promise shows its own spinner (see
[renderer README → Pending feedback](../packages/renderer-svelte/README.md#pending-feedback)).

## Content-kind runtime (deck, page, doc)

A blueprint with `kind: "deck" | "page" | "doc"` (ADR-036) has no entities, but it
still runs on the same runtime, so themes, shells, DevTools, snapshots and the
persona switcher keep working. `defineKindRuntime(doc, { namespace })` from
`@protoyard/blueprint/kinds` builds its `PrototypeDefinition`. The player and
generated kind prototypes (and the `templates/deck`, `templates/page`,
`templates/doc` starters) share it, so both levels behave the same
([Player → Content kinds](PLAYER.md#content-kinds-deck-page-and-doc),
[Generator → Generated decks, pages and docs](GENERATOR.md#generated-decks-pages-and-docs)).

```text
defineKindRuntime(doc)
  ├─ database   one version: blockStates (key = stateKey(documentId, blockId)),
  │             formResponses (same row contract as @protoyard/pages FormResponse)
  ├─ scenarios  `default` only
  ├─ world      generateWorld(scenario): one organization + presenter, audience, viewer personas
  │             (fixed data; no generation context, no Faker, no blueprint generator)
  ├─ policy     (simulated, not security — FORM_CAPABILITIES from @protoyard/pages)
  │             presenter: blocks:interact, form:submit, form:read, form:admin
  │             audience:  blocks:interact, form:submit, form:read
  │             viewer:    form:submit, form:read
  └─ theme      the brand's built theme, or its library theme id, as for apps
```

`createKindServices(runtime, doc)` implements the `BlockStateHost` contract
from `@protoyard/blocks/interactive`. Interactive blocks render from it and
never touch a table. Each `dispatch(key, block, action)` follows the service
path:

1. It resolves the block from the document by the key's block id, never trusting
   the caller's copy.
2. `session.assert('blocks:interact')`.
3. For poll and quiz actions, it sets the active persona as `viewer`.
4. `reduceBlockState`, which zod-validates the action.
5. `environment.run('blocks.dispatch')` → `db.transaction` writes the new state
   under its key. A refused action rejects with `BlockActionError` and writes
   nothing.

`read` returns the stored raw state from a cache that reloads after scenario
loads, and blocks-ui restores it with `readBlockState`. Form submissions go
through `responses.submit` / `responses.list`, which delegate to
`createFormServices` from `@protoyard/pages` (lead form contract: `id`,
`formId`, `createdAt`, `values`, optional `personaId`):

1. The form is resolved from the document.
2. `session.assert('form:submit')` on submit, `form:read` on list/export,
   `form:admin` on clear.
3. The values are validated against the form's own fields.
4. `environment.run` → `db.transaction` writes or reads them.

Any persona with `form:read` (presenter, audience and viewer) can list every
response for a form. Only the presenter may clear them (`form:admin`).

### Player entries

`packages/player` builds four pages in one Vite build. `index.html` runs any
blueprint: `main.ts` passes `bootByKind` (`sources/boot-any.ts`) into the shared
player loop. `deck.html`, `page.html` and `doc.html` (`entries/*.ts` →
`runKindEntry`) pass only the kind boot (`sources/kind-boot.ts`). The loop
(`run.ts`, `sources/start.ts`) takes its `boot` from the entry, so the kind
pages' module graph never reaches the app boot, the CRUD shell, the world
worker or the app generator. A blueprint of another kind shows a mismatch
screen with a link to the right page. `packages/player/tests/budget.test.ts`
proves these exclusions on the built manifest.

## Optional mock HTTP layer

`@protoyard/http` turns a prototype's services into a fetch-compatible mock
API. `createMockApi(runtime, { baseUrl, routes })` returns real `Response`
objects, with no server, no service worker and no MSW. Each request runs
through `environment.run('http.<METHOD> <route>')`, so DevTools' latency,
offline and failure toggles (including `failureScope: ['http.']`) apply to
HTTP exactly as they do to services.

Errors map to HTTP semantics: 403, 422 with issues, 404, 405, 429 with
`Retry-After`, 500 and 504. Offline requests reject with
`TypeError('Failed to fetch')`. `installGlobalFetch(api)` intercepts only the
API prefix. APIs register per runtime, so DevTools shows a Network log of the
last 200 requests. See [packages/http/README.md](../packages/http/README.md).

## Isolation model

| Layer | Mechanism | Guarantee |
| --- | --- | --- |
| Code | One folder and one Vite app per prototype | Building A never includes B's code. The CLI export checks this. |
| Runtime state | Separate runtime per page load | Sessions, overrides and clocks are per prototype. |
| Data | `protoyard.<namespace>.data` / `.control` per prototype | Logical namespaces. Loads and resets are scoped to one prototype. |
| Security | **Not provided on a shared origin** | Same-origin scripts can read any IndexedDB. Use separate origins for untrusted code. |
| Publishing | Per-prototype `artifacts/<slug>/dist` + ZIP | Each artifact is self-contained and relocatable (`base: './'`). |

## Scale strategy

- **Discovery is metadata-only.** `protoyard index` reads `protoyard.json`
  files one level deep and validates them with zod, without executing
  anything. It caches by path, mtime and size, and writes
  `.protoyard/registry.json`. Both files are written only when their bytes
  change, through a temp file and a rename. An unchanged registry keeps its
  previous `generatedAt`, so a repeated `index` leaves the file and its mtime
  alone and does not reload the gallery dev server.
- **The gallery imports that registry, never prototype code.** Search and
  filtering run client-side over compact entries.
- **Every command targets one slug** (`dev`, `validate`, `build`, `export`,
  `publish`). `build --all` exists for CI smoke runs and is sequential.
- Measured numbers for 1,000 synthetic manifests are in
  [PERFORMANCE.md](PERFORMANCE.md).

## Routing and builds

Prototypes use hash routing (`#/deals/42`), so any static host and any
sub-path work with no rewrites. Builds use `base: './'` unless `--base` is
given. The CLI drives Vite through environment variables (`PROTOYARD_OUT_DIR`,
`PROTOYARD_BASE`, `PROTOYARD_INCLUDE_DEVTOOLS`, `PROTOYARD_DEMO_BADGE`,
`PROTOYARD_PORT`), so `vite.config.ts` stays a one-liner. DevTools are
excluded from builds by default: the `__PROTOYARD_DEVTOOLS__` flag guards a
dynamic import, so the panel is removed from the bundle entirely.

## Gallery

`apps/gallery` is an Astro static site with Svelte islands. In local
development it talks to a control server bound to `127.0.0.1` (ADR-013) to
start and stop prototype dev servers. When hosted, it is read-only and shows
CLI commands. See [apps/gallery/README.md](../apps/gallery/README.md).

## Extending to other frameworks

A new renderer (React, Vue…) needs three things:

- A Vite config factory.
- A `mountPrototype()` that creates the runtime and applies appearance.
- Reactive bindings over the controllers' `subscribe()` methods.

Then add the new value to `RendererSchema` in core. Nothing in the engine
changes.
