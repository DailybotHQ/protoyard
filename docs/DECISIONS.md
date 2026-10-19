# Architecture Decisions

Short ADRs. Each records the context, the decision, and the trade-off we
accepted. New decisions append; superseded ones are marked, never deleted.

---

## ADR-001 — Astro for the gallery, standalone Vite + Svelte apps for prototypes

**Context.** The gallery must list thousands of prototypes. Each prototype
must run, build and publish on its own.

**Decision.** The gallery (`apps/gallery`) is a static Astro site that reads
only a metadata registry. Every prototype is an independent Vite + Svelte 5
app, with its own `vite.config.ts`, built through `@protoyard/renderer-svelte`.

**Trade-off.** There are two build systems instead of one. In exchange, the
gallery never compiles prototype code, building one prototype never touches
another, and each artifact contains only its own domain code.

## ADR-002 — Framework-agnostic core, one renderer today

**Decision.** `@protoyard/core` (zod schemas and interfaces) and
`@protoyard/runtime` (the composed engine) do not import Svelte. Svelte lives
only in `renderer-svelte`, `ui` and `devtools`. The manifest `renderer` field
is an enum with one value today: `svelte-vite`.

**Trade-off.** There is a small layer of indirection (controllers with
`subscribe`). A future React or Vue renderer only needs bindings and a mount
function.

## ADR-003 — Data-only `protoyard.json` instead of an executable `protoyard.config.ts`

**Context.** The original brief suggested `protoyard.config.ts`. Indexing
thousands of TypeScript configs means executing arbitrary code just to list
prototypes. That is slow, and unsafe for prototypes downloaded from elsewhere.

**Decision.** Metadata lives in a static `protoyard.json`, validated with zod
at index time without executing anything. Runtime wiring (schema, scenarios,
generator, policy) lives in `src/prototype.ts`, which imports the same JSON.
There is one source of truth and no code execution during discovery.

**Trade-off.** No computed metadata. `validate` checks that the two files
agree (for example, scenario ids and schema version).

## ADR-004 — Workspace packages ship TypeScript source

**Decision.** `@protoyard/*` packages export `./src/index.ts` directly. Vite,
Vitest, Astro and tsx all compile TypeScript, so there is no build step to
forget and source maps lead straight to source. The CLI runs through `tsx`.

**Trade-off.** Publishing the packages to npm later needs a build step (for
example, `tsdown`). This is recorded as a roadmap item.

## ADR-005 — Dexie over IndexedDB, two databases per prototype

**Decision.** Each prototype gets `protoyard.<namespace>.data` for domain
tables plus the reserved `py_*` identity and event tables, and
`protoyard.<namespace>.control` for the active scenario, overrides, clock,
session, preferences and snapshots.

**Why two.** Scenario loads and snapshot restores replace the data DB
atomically, while control state (and the snapshots themselves) survive. Theme
and persona changes never write to the data DB, and tests assert this.

**Trade-off.** Two connections per app. Snapshot payloads live in IndexedDB,
which is fine at prototype scale and counts against the origin quota.

## ADR-006 — Seeded generators, deterministic ids, versioned output

**Decision.** Generators receive a `GenerateContext` with a seeded PRNG
(mulberry32), a private seeded Faker instance with a fixed reference date, and
an id factory (`deal_0007`). Every scenario declares `seed`, `referenceTime`
and `version`, and every load records the generator SDK version. Records
created at runtime use random ids with a `u` marker (`deal_u3f9…`) so they can
never collide with seeded ids.

**Trade-off.** We promise reproducibility for the same versions, not identical
output across generator changes. Bumping the version makes that explicit.

## ADR-007 — Three operations never conflated: load, override, snapshot

**Decision.** `scenarios.load()` rebuilds the world from a seed (destructive,
confirmed, scoped). `overrides.set()` toggles actor, role, environment or
appearance without writing domain rows. `snapshots.*` capture and restore the
actual world after edits. DevTools shows each value with its source:
override › persona preference › scenario › default.

## ADR-008 — Permissions are capabilities, enforced in services

**Decision.** Roles map to capability lists (`*`, `deals:update`, denials such
as `-billing:manage`), with optional record rules (for example, "reps edit only
their own deals"). Services call `session.assert()`, so a forbidden action fails
even from the browser console. The UI uses `can()` to hide or disable
controls.

**Honesty.** This is simulation for UX, not security. The docs say so wherever
roles appear.

## ADR-009 — Hash routing for prototypes

**Decision.** Prototypes use hash routes (`#/deals/42`). Any static host,
including a ZIP unpacked into a sub-folder, serves them with no rewrite rules,
and refreshes and back/forward work everywhere. Builds use a relative base
(`./`) by default, so the same output runs at `/` or `/any/sub/path/`.

**Trade-off.** URLs contain `#`. Pretty paths would need host rewrites, which
we document but do not require.

## ADR-010 — Time: preview vs committed advance

**Decision.** `clock.setTime()` and `preview()` only change what the UI sees.
`scenarios.advance()` runs the prototype's optional `timeline`. Events get
deterministic ids (`evt:<scenario>:<day>:<n>`) and are recorded in `py_events`,
so 7×1 day equals 1×7 days and replaying a window applies nothing twice.
Prototypes without a timeline get preview-only time, stated in the UI.

## ADR-011 — The environment simulator is opt-in per service call

**Decision.** `environment.run(name, fn)` applies latency, offline mode and
reproducible failures (keyed by operation name and call count). It does not
intercept native `fetch`. MSW is not bundled; a prototype that needs HTTP
mocking can add it.

## ADR-012 — Biome instead of ESLint + Prettier

**Context.** The brief suggested ESLint and Prettier. The maintainers' other
Astro + Svelte projects (xergioalex.com, pereiratechtalks.com,
deepworkplan.com) standardize on Biome.

**Decision.** Biome 2 lints and formats TypeScript, JSON and CSS. `svelte-check`
and `astro check` type-check components.

**Trade-off.** Biome's Svelte and Astro support covers the script blocks; the
template rules come from svelte-check.

## ADR-013 — Local control server for the gallery, read-only when hosted

**Decision.** `pnpm dev` starts the gallery plus a small control server bound
to 127.0.0.1. It checks the Origin header strictly, accepts only slugs from the
registry, and never interpolates input into a shell. It can start or stop a
prototype's dev server. Hosted as a static site, the gallery is read-only and
shows terminal commands instead.

**Amendment (PLAN_002): creating prototypes.** The control server can also
create a prototype: `POST /api/new` copies a registry template or prototype
into a new `prototypes/<slug>/` (never over existing files), runs
`pnpm install --offline`, fills the spec by running the copy's code, and
starts its dev server. Because that writes files and runs code, it is
**opt-in**: the endpoint answers 403 with a hint unless the server runs with
`--allow-create` (`protoyard gallery --allow-create` or `control-server
--allow-create`). On top of the loopback bind, Host check and exact Origin
allow-list (missing and `null` origins refused), each request needs an
`X-Protoyard-Token` header matching a random token generated per run and
compared in constant time. The token reaches only allowed origins, through
`GET /api/status`; the custom header also forces a CORS preflight. The body is
JSON only, at most 8 KB, with a strict schema; blueprints are never copied.
*Why:* the default allow-list is identified by port, and 4321 is Astro's
default, so another local site on that port should not be able to write files
just because the gallery is not running. *Reversal:* drop the flag and token
only together with a fresh security review.

## ADR-014 — Publishing adapters report only what providers report

**Decision.** `publish` builds, verifies, then calls a provider adapter, and
prints the URL the provider returned. `--dry-run` prints the exact command
without contacting anyone. Cloudflare Pages (via Wrangler direct upload) is the
first adapter. Netlify and Vercel are labeled experimental until tested
end to end.

## ADR-015 — Parallel multi-agent construction under a Deep Work Plan

**Context.** The foundation was built by four coding agents (a lead plus
three lanes) coordinated through Herdr.

**Decision.** Work was split by path ownership: engine, experience, tooling,
and lead (core, demos, docs). Each path had a single writer, only the lead
changed the lockfile, and every task was tracked in
`PLAN_001_protoyard_foundation` with evidence-backed gates. See
[AI_AGENT_COLLAB.md](AI_AGENT_COLLAB.md).

## ADR-016 — Device and host shells render in the same document

**Context.** Protoyard must make a prototype look like the product it
simulates: a phone, a tablet, a desktop window, a browser, a chat widget on a
customer site, a browser-extension popup or a plugin side panel. A shell can
either wrap `#app` in the same document or load the prototype inside an
iframe it draws around.

**Options.** (1) In-document frames around `#app`. (2) A self-framing iframe
per shell (honest media queries, but two runtimes on one IndexedDB and a new
cross-frame protocol for DevTools).

**Decision.** In-document frames. The manifest gains `preview.shell`
(`none`, `auto`, `phone`, `tablet`, `desktop-window`, `browser`,
`widget-host`, `extension-popup`, `side-panel`) plus a device, orientation
and chrome; a `?shell=` link parameter overrides it, and the runtime reports
the effective shell with its source. The renderer's `ShellHost` lazy-loads
the selected frame, so `none` costs nothing. Layout code uses the
`--py-app-height` token and container queries instead of `dvh`, which
mitigates media queries that follow the window. `auto` frames the app when
the viewport is wider than the device (dev, gallery and published builds)
and goes full-bleed on a real phone or inside an iframe.

**Consequences.** One runtime, DevTools unchanged, no extra boot. Media
queries still see the window; prototypes that need device breakpoints use
container queries. Frames are brand-neutral (no real device or OS marks).
**Reverse:** set `preview.shell: none` (per prototype) or drop `ShellHost`
from the renderer root.

**Amendment (sizing and full screen).** Devices keep their catalog size and
only scale down. Window-like frames (`browser`, `desktop-window`) are fluid:
they fill the stage minus their margin, with the catalog size as the minimum,
because a fixed 1280 × 800 window left most of a large screen empty. Every
framed shell gets a Full screen control beside the frame (never over app
pixels); full screen is the same `shell: none` override as DevTools' "Device
frame" switch, so there is one state, persisted by the runtime and settable
with `?frame=none`. The published-build badge moved out of the screen (below
the stage when framed, a control-free corner when full-bleed). **Reverse:**
drop `fluid` from the registry entries; remove the control from `ShellHost`.

## ADR-017 — Data-only blueprints generate prototypes

**Context.** "Generate anything" needs a description of a product that
humans and agents can write, review and regenerate safely.

**Decision.** A prototype can be described by a data-only `blueprint.json`
(entities, fields, relations, roles, screens, notifications, brand),
validated by `@protoyard/blueprint` (framework-agnostic: zod and JSON Schema,
derived Dexie stores and integrity rules, appended migrations, zod inputs,
capability policy, deterministic generators and entity services that follow
`session.assert` → zod → `environment.run` → `db.transaction`).
`@protoyard/crud` provides the Svelte CRUD kit. `protoyard generate` writes
generated code only under `src/generated/**`, guarded by a content hash, so
regeneration never overwrites hand-written code. Like manifests (ADR-002),
blueprints contain no executable code.

**Consequences.** Generated prototypes are ordinary prototypes: they can be
edited, exported and published. Schema changes produce appended migrations,
never edits of shipped versions. **Reverse:** a prototype can drop its
blueprint and keep the generated code as hand-written code.

## ADR-018 — Simulated authentication, OAuth, MFA and billing kits

**Context.** SaaS prototypes need sign in, sign up, SSO, magic links, MFA,
invitations, workspaces, onboarding and billing that feel real without any
backend, provider account or payment processor.

**Decision.** `@protoyard/saas` (engine, no Svelte) and `@protoyard/saas-ui`
(screens) simulate those flows inside the prototype: a simulated OAuth round
trip (provider consent screen, redirect back, account linking, deny and
error outcomes) never leaves the app; email-like messages land in a
simulated inbox; MFA codes derive from the simulated clock; billing amounts
are integer cents. SSO buttons show provider names with neutral icons and a
persistent "Simulated" label: no official logos. The core session gains an
optional signed-out state, used by templates that opt in; existing
prototypes keep a signed-in persona.

**Consequences.** Simulated auth is never security (same as personas,
ADR-007): no real credential is captured or sent anywhere, and docs say so.
**Reverse:** a prototype that does not opt in is unaffected; the kits are
separate packages.

## ADR-019 — Prototype specs and performance budgets are part of the contract

**Context.** Every prototype should be rebuildable as a real app by any
agent, and speed is non-negotiable.

**Decision.** Each prototype carries an `AGENTS.md` and a `docs/` spec
(SPEC, data model, flows, screens, simulated boundaries, rebuild path) with
generated regions that `protoyard spec --check` keeps in sync with the code.
Performance budgets live in a workspace `protoyard.budgets.json` (default:
initial JS ≤ 250 KB gzip per prototype) with per-prototype overrides, and
`protoyard budget` enforces them on built artifacts. Cold-start timing is
report-only in CI until a calibration run sets its threshold; locally it is
measured with the method in PERFORMANCE.md.

**Consequences.** Spec drift and budget regressions fail validation instead
of surfacing in review. **Reverse:** budgets can be raised per prototype
with a recorded reason; spec checks can be made advisory with
`--no-strict-spec`.

## ADR-020 — Lane worktrees with lead-owned integration

**Context.** PLAN_002 runs twelve agents (Claude, Codex and Grok lanes)
whose areas still touch a few shared files (`packages/cli/src/program.ts`,
`packages/ui/src/index.ts`, `tests/e2e/targets.ts`).

**Decision.** Each lane works in its own git worktree under the git-ignored
`tmp/lanes/<lane>` on branch `plan002/lane-<lane>`. The lead merges each
finished task into `main`, is the only one who runs `pnpm install` on `main`
and commits `pnpm-lock.yaml`, owns `packages/core`, `packages/runtime` and
the index docs, and runs every plan gate on the integrated `main`. E2E runs
one session per machine (fixed ports), scheduled by the lead.

**Consequences.** No two writers share a checkout; conflicts surface as
ordinary merges the lead resolves. **Reverse:** remove the worktrees
(`git worktree remove`) once the lane branches are merged.

## ADR-021 — Charts and analytics as four lazy packages with theme-owned chart tokens

**Context.** Prototypes need charts of every kind and analytics screens. Only
a hover-only div bar chart exists (`templates/dashboard`); the theme tokens
`chart1..5` are never contrast-checked. Chart libraries are large and would
break the 250 KB initial JS budget.

**Decision.** Add `@protoyard/charts` (pure TypeScript: scales, shapes,
downsampling, layouts; testable in Node), `@protoyard/charts-ui` (Svelte, one
subpath per family: `./cartesian`, `./part-whole`, `./matrix`, `./compact`,
`./canvas`, `./geo`), `@protoyard/analytics` (date ranges, comparison,
bucketing, filters, funnels, cohorts, deterministic generators) and
`@protoyard/analytics-ui` (KPIs, date range, filters, explore views, a
keyboard-editable dashboard grid). No third-party chart dependency, and
nothing is re-exported from the `@protoyard/ui` barrel. Chart palettes
(categorical 8, sequential and diverging ramps) are optional `ThemePalette`
tokens owned by `@protoyard/themes` and validated there (3:1 non-text
contrast, colour-vision-deficiency distance); charts read `--py-chart-*`
variables with a derived fallback.

**Consequences.** A prototype pays for a chart family only on the screen that
uses it. **Reverse:** remove the packages; prototypes fall back to tables.

## ADR-022 — The views kit: an engine package plus per-view Svelte subpaths

**Context.** Products need more than CRUD: boards, calendars, timelines, big
grids, trees, maps, editors, comments, notifications, files, settings and
state patterns. Growing `@protoyard/ui` would grow every prototype's barrel.

**Decision.** Add `@protoyard/views` (framework-free engines: board ranks and
WIP, calendar recurrence subset, schedule dependencies and critical path,
grid virtualization and filters, tree, offline geo, comments) and
`@protoyard/views-ui` with one subpath per view, never in the `ui` barrel.
The map uses a fully fictional, hand-authored offline basemap (no tiles, no
licensing, no network). The markdown parser is shared through a `./markdown`
subpath of `@protoyard/ai`. One explicit time zone per prototype. The old
`ui` Kanban stays; `BoardView` is the new board.

**Consequences.** Each view is a 3–16 KB lazy chunk with 0 KB initial cost.
**Reverse:** remove the packages; templates keep their own screens.

## ADR-023 — Layouts are a data-only contract with a lazy host

**Context.** Prototypes need multiple app layouts (sidebar, rail, top nav,
master-detail, dashboard, docs, landing, wizard, auth split, mobile tab bar
and drawer), switchable live like shells and choosable by generated apps.

**Decision.** `@protoyard/core` adds a manifest `preview.layout`, a `?layout=`
link parameter and a runtime override (lead-owned seam), plus a data-only
`NavModel`. `LayoutHost` lives in `@protoyard/ui` next to `AppShell` with a
lazy registry (host ≤ 2 KB, each layout ≤ 4 KB). Existing prototypes keep a
`custom` layout; templates and new flagships adopt `LayoutHost`. The theme
library index loads lazily on first library use (DevTools browser, an unknown
`?theme=` id), never at boot.

**Consequences.** DevTools can switch layouts live; blueprints can choose one.
**Reverse:** set `preview.layout: custom` everywhere and drop the host.

## ADR-024 — Blueprint screens v2, the geo field and an offline brief synthesizer

**Context.** Blueprint screens are hints only and every catalog blueprint is
three-entity CRUD; turning an idea into a prototype still takes hand work.

**Decision.** Blueprints gain optional screen kinds (dashboard, board,
calendar, timeline, map, analytics, detail tabs, settings), a `geo` field
kind, realistic value distributions and aggregate queries, and a layout
choice. Additions are optional keys; `formatVersion` stays 1 unless a key
changes meaning. A deterministic, offline brief → blueprint synthesizer
backs `protoyard blueprint new --from-brief`; no model or network call.
Templates stay hand-written owned code built on the kits.

**Consequences.** One command turns a short brief into a running, multi-view
prototype; an idea → running time budget is measured.
**Reverse:** ignore the optional keys; the generator falls back to CRUD screens.
