# Architecture

Protoyard is a pnpm workspace with three kinds of code:

1. **The engine.** Framework-agnostic TypeScript packages that give every
   prototype a database, scenarios, sessions, time, environment, themes and
   snapshots.
2. **The experience.** Svelte 5 packages that render prototypes: the renderer,
   the UI library and the DevTools panel.
3. **The tooling.** The `protoyard` CLI and the Astro gallery.

Prototypes and templates sit beside these as independent Vite apps.

## Repository layout

```text
protoyard/
├── packages/
│   ├── core/             contracts: zod schemas + interfaces, PRNG, clock, environment, policy
│   ├── database/         Dexie/IndexedDB: per-prototype data + control DBs, world I/O, storage errors
│   ├── scenarios/        generator SDK (seeded faker/rng/ids/time), presets, integrity, timeline
│   ├── runtime/          createPrototypeRuntime(): composes everything into one PrototypeRuntime
│   ├── themes/           six presets, appearance engine (CSS vars), no-flash script, base.css
│   ├── ui/               Svelte 5 components (Bits UI + Tailwind 4 + Lucide)
│   ├── devtools/         the in-browser control center
│   ├── renderer-svelte/  Vite config factory, mountPrototype(), reactive bindings, hash router
│   ├── http/             optional fetch-compatible mock API over prototype services (no server, no service worker)
│   ├── offline/          optional build-time service worker for exported prototypes (opt-in)
│   └── cli/              the `protoyard` command (index, new, dev, validate, build, export, publish…)
├── apps/gallery/         Astro static site — reads the metadata registry only
├── templates/<name>/     functional starting points (same layout as a prototype)
├── prototypes/<slug>/    independent apps (crm-demo, mobile-banking-demo, ai-chat-demo, yours…)
├── tests/                shared test support, unit tests and Playwright E2E
├── scripts/              repository scripts (index benchmark, hygiene check)
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
  ├─ parseScenarioLink(location.search)       ?scenario=&actor=&seed=&theme=&mode=&shell=&devtools=
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
2. Runs `generate(ctx)` with a seeded `GenerateContext`.
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
  `.protoyard/registry.json`.
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
