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

*Note (PLAN_003 integration).* `Theme.charts` is optional. Presets ship only
valid `chart1..5`; library and generated themes ship the full block (8
series, sequential and diverging ramps, grid, axis). CSS names follow the
charts kit (`--py-chart1..8`, `--py-seq-N`, `--py-div-N`). Kit overlays
(menus, popovers, dialogs) in the views and analytics kits load on first use
through shared lazy chunks; in-cell editors use native controls.

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

*Note (PLAN_003 integration).* `LayoutProps` carries `mountScreen`, `nav`,
`path`, `options`, `storageKey` and `aside`; layouts read breakpoints as
container queries on their own root. Twelve layouts are registered lazily in
`LAYOUT_REGISTRY`. Measured `top-nav` and `mobile-tabs` chunks are above the
4 KB per-layout reference target ([PERFORMANCE.md](PERFORMANCE.md)); they stay
lazy and outside initial JS. Blueprint library theme ids are checked on the
CLI side (`brandLibraryThemeId`), not in the zod schema, so `parseBlueprint`
in prototype bundles never loads the theme library.

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

## ADR-025 — Review comments are an opt-in, lazy overlay with pluggable storage

**Context.** Reviewers want Figma-style comments on published prototypes:
pins anywhere on a screen that stay visible while navigating, and a list
that jumps to each pin. Published builds ship without DevTools by default
(`build.includeDevtools: false`). Scenario loads rewrite the data DB, and
snapshots restore it. There is no backend. Options considered: comments
inside DevTools (absent from published builds), an external comments SaaS
(a third-party dependency, outbound requests and accounts), or a new package
pair loaded lazily.

**Decision.** Add `@protoyard/review` (engine: anchors, the `ReviewAdapter`
contract with a conformance suite, adapters and a plain Request/Response
server handler, with no Svelte or DOM in `./server`) and
`@protoyard/review-ui` (Svelte: overlay, pins, threads, list panel and a
floating toolbar). DevTools only hosts the same panel in a thin Comments tab.
The contract lives in `@protoyard/core`. The comment, anchor and context
schemas (`formatVersion` 1) are on the `@protoyard/core/review` subpath,
outside the core barrel. The manifest field is `build.review`
(`{ enabled, adapter, endpoint?, store? }`); it is absent by default, so
every existing manifest parses to the same value. The links are
`?comments=1` and `?review=<key>` in `parseScenarioLink`. The renderer
loads review only when the build flag is on (`build.review.enabled` or
`PROTOYARD_REVIEW=1`), or when DevTools are present and `?comments=1` is set.
With the flag off, the code is folded away like DevTools.

- **Adapters.** `local` (default): a third Dexie database
  `protoyard.<ns>.review`, with file export and import. `cloudflare`: the
  same-origin `/api/comments` handler on Pages, KV by default (eventually
  consistent, which review notes tolerate), D1 optional. `http`: any
  endpoint that serves the same REST shape. `artifact`: the Claude artifact
  `db` and `user` capabilities (ADR-026). Every adapter is a document store
  keyed by client-generated ids with last-write-wins, and all of them pass
  one conformance suite.
- **Separate review DB.** Comments survive scenario loads, resets and
  snapshot restores, and they are never in snapshot files. Runtime
  operations never touch that database.
- **Wall-clock timestamps.** `createdAt`, `editedAt` and `resolvedAt` record
  when the reviewer acted. They do not use the simulated clock (ADR-010).
  The determinism rule covers generators and timelines, not reviewer facts.
  The server stamps its own times.
- **Honest identity.** The display name is self-declared, and the client id
  is a per-browser random id. The optional review key keeps casual visitors
  from writing to a shared API, but anyone who has the link can read and
  write. Own-edit and own-delete are UX, not security. None of this is
  authentication. The key never appears in the manifest, the build manifest
  or a ledger. It is read from the link, kept in `sessionStorage` and
  stripped from the address bar.
- **Sanitization and limits.** Comments are untrusted plain text and are
  never rendered as markup (no `{@html}`). Links go through the shared safe
  link filter. The core schema caps bodies at 2,000 characters and names at
  60, and it rejects control and bidi-override characters, unknown keys and
  malformed ids, slugs and timestamps. It bounds the anchor offsets, the
  locator ladder and reactions. The server adds a request size cap, a
  same-origin check for writes and rate limits. Endpoints in the manifest
  must be `https://` (or `http://localhost`) or root-relative, with no
  credentials, query or fragment.

**Consequences.** Builds without review pay 0 bytes. A review build pays a
small loader, and the overlay, panel and thread chunks load lazily. Local
comments are visible to other prototypes on the same origin (same-origin
IndexedDB is not a boundary). Real Cloudflare deploys and bindings are run by
the developer; tests cover the handler in Node and the dry runs.
**Reverse:** drop `build.review` from manifests and remove the two packages,
the renderer flag, the `review` link field and the `@protoyard/core/review`
subpath. The `protoyard.<ns>.review` databases are orphaned and can be
deleted from the browser.

## ADR-026 — Sharing prototypes as Claude artifacts

**Context.** People want to share a prototype with a link, without a hosting
account. A Claude artifact hosts a page plus supporting files, framed in the
claude.ai viewer, private by default. Only an agent can call the Artifact
tool. The CLI cannot. Artifacts load scripts only from a CDN allow-list,
wrap the page in their own document skeleton, and give each viewer
browser-local storage. Options considered: a ZIP upload, self-hosting
(already covered by `export` and the publish adapters), or packing for
Artifact publish.

**Decision.** `protoyard export <slug> --target artifact` packs a verified
build into an artifact-ready folder. It turns the page into body content,
writes a files map with relative published paths, and adds an
`artifact-manifest.json` with sizes, sha256 and batches. It checks every
artifact rule with exact reasons: no absolute script, style or font URLs,
no service worker, standard web media types, and the size and file-count
caps. The CLI never publishes. The repository skill `share-as-artifact`
(with a slash command) runs the pack, reads every packed file in full (the
tool's rule for files the agent did not write), publishes with the Artifact
tool, and re-shares to the same URL later. It then records the URL the tool
returned in a strict JSONL share ledger (`artifacts/share/ledger.jsonl`,
through `protoyard artifact record` and `list`). The ledger refuses URLs that
do not match the artifact pattern, a pack whose files no longer match its
manifest, and credential-looking fields. The review index shows these links as private by
default.

- **Comments in an artifact.** The `artifact` review adapter (ADR-025) uses
  the documented `db` capability for shared threads and the `user`
  capability for author ids. It stores only ids and resolves names at render
  time. It starts on the local adapter and switches when `claude.use('db')`
  resolves. Writes need Contributor access, so the skill asks the owner to
  share as Contributor. The write-only `comments` capability is only a
  composer fallback.
- **Embedded frame.** The prototype runs framed. An opt-in build flag,
  `build.frameWhenEmbedded` (set by the artifact target), keeps an explicit
  manifest shell instead of always going full-bleed. Storage that throws on access (a
  `localStorage` getter, IndexedDB open) degrades to memory with the existing
  storage banner, never fake persistence. Artifact builds live in
  `artifacts/<slug>/artifact-dist` and never overwrite the plain `dist/`.
  Whether query parameters (`?scenario=`, `?comments=1`) reach the framed
  page is not yet verified: the one private publish so far did not exercise
  it ([PUBLISHING.md](PUBLISHING.md#verified-and-not-verified)).
- **Private by default.** An artifact is visible only to the people the owner
  shares it with. Each viewer's prototype data stays in their own browser.
  Shared comments are visible to everyone admitted and are erased with the
  artifact. Roles inside the prototype are still simulated and are never
  security.

**Consequences.** A link with no hosting account, at the cost of the agent
reading every packed file on each share. The real publish is an
outward-facing action and needs the developer's confirmation, like any
publish. **Reverse:** drop the `artifact` target, the skill and the share
ledger. Existing artifacts stay where the owner left them on claude.ai, and
the owner deletes them there.

## ADR-027 — Blueprint-declared screens emit lazy CRUD subpath routes

**Context.** ADR-024 lets a blueprint declare dashboard, board, calendar,
timeline, map, analytics, tabbed detail and settings screens and a layout.
The generator must turn them into routes without copying screen code into
every prototype, and regeneration must stay safe.

**Decision.** `protoyard generate` writes one small typed wrapper per declared
screen. It reads the screen's config from `blueprint.screens[<index>]`
through `useCrudApp()` (and throws "regenerate" when the type no longer
matches) and imports the matching `@protoyard/crud/screens/<kind>` subpath;
tabbed detail screens use `EntityDetail`. Routes and grouped navigation are
generated into `src/generated/routes.ts` and `src/generated/layout.ts`, loaded
lazily; a dashboard at `/` owns the home route. Custom workflows stay in
owned files, and the CRUD template keeps the views, charts and analytics CSS
imports and Tailwind sources the screens need.

**Consequences.** The blueprint stays the source of truth for standard
screens; each screen kind is a lazy chunk, and a legacy owned `App` that does
not consume the generated layout gets a warning instead of a silent change.
**Reverse:** remove the screen kinds from the blueprint and regenerate; the
generator falls back to list, detail and form screens.

## ADR-028 — Packages publish dist through publishConfig; the repository keeps source exports

**Context.** Every package exports `./src/*.ts`. Node does not strip types inside
`node_modules`. Several packages also reach into a sibling's `src` (crud imports blueprint
search; the renderer resolves `../../avatars/assets`). Inside the repository nothing needs a
build today, and PLAN_004 must keep it that way.

**Options.** (1) Bundle each package with a bundler. (2) Make dist the only export and add a
build step to development. (3) Emit per-file ESM with `tsc` and `svelte-package`, and swap the
exports at pack time through `publishConfig`.

**Decision.**
- **Build:** option 3. `tsc` emits ESM and `.d.ts` for the engine packages, with
  `rewriteRelativeImportExtensions`. It emits no source or declaration maps: the tarballs do
  not ship `src/`, so maps would point at files that are not there. `svelte-package` ships the Svelte packages. Lazy subpaths
  stay separate entry points.
- **Exports:** `publishConfig` replaces `exports`, `types` and `files` when packed, so the
  workspace keeps importing `src/`.
- **Versions:** all public packages version in lockstep on **1.x** through one Changesets fixed
  group: `@protoyard/*`, `protoyard` and `create-protoyard`.
- **Publishing:** `pnpm pack`, then `npm publish --provenance` per tarball, from a GitHub
  Actions job with `id-token: write` (npm Trusted Publishing, no stored token). The first live
  publish waits for the developer's GO.
- **What ships:** prototypes and individual templates stay private; `@protoyard/templates`
  packs the template folders, and `apps/gallery` publishes as `@protoyard/gallery`.
- **Package managers:** pnpm is first-class and npm is supported.

**Consequences.** Contributors never build. Consumers get standard ESM with types. A tarball
end-to-end run with no registry is the proof. Cross-package `src` imports must become real
package imports first.
**Reverse:** drop `publishConfig` and the release job; the repository is unaffected.

## ADR-029 — One app model for the generator and the player; a runtime prototype definition

**Context.** Storage, services, policy and worlds already derive from a blueprint at runtime.
Routes, navigation and layout exist only as strings the generator emits (`emit.ts`), and the
app shell lives in `templates/crud-app`.

**Options.** (1) Keep codegen and write a second, runtime-only path for the player. (2) Derive
one data model that both render.

**Decision.** Option 2:
- `deriveAppModel(blueprint)` returns routes, navigation groups and layout as data, and the
  generator renders its files from that model.
- `definePrototypeFromBlueprint(blueprint, options)` returns a complete, `definePrototype`-valid
  definition: manifest, database versions, policy, integrity, brand theme, scenarios, generator
  and app model.
- Screen kinds resolve through one typed, lazy registry, and the app shell ships as
  `@protoyard/crud/app`.
- Parity is proven over every catalog blueprint, down to byte-identical generated worlds.
- `templates/crud-app` and the generated prototypes then move onto `@protoyard/crud/app`, so the
  two levels share the app structurally.

**Consequences.** Level 1 (the player) and level 2 (generated prototypes) cannot drift without
a failing parity test. New screen kinds plug in through the registry.
**Reverse:** the generator can keep emitting its own strings; the model is additive.

## ADR-030 — Untrusted blueprints, content identity and share links

**Context.** The player loads blueprints from files, links, pasted text and `postMessage`. The
schema has no array maxima, and the repository has never had a `message` listener.

**Decision.**
- **One hardened loader** is the only entry. It applies size, depth, count and string caps, strips
  control and bidi characters, rejects prototype keys, caps the world size, never executes and
  never renders HTML.
- **Identity:** a blueprint's identity is the SHA-256 of its canonical JSON. Its storage
  namespace is `bp-<base32>`, so every edit gets a fresh world by default. `?keep=<name>` opts
  into a stable namespace that migrates through the blueprint history, for iteration.
- **Share links:** versioned `#bp=` fragments, deflate-raw then base64url. Links over 16 KB
  encoded or 256 KB decompressed are refused before parsing, with file or `postMessage` offered
  instead.
- **`postMessage`:** accepted only from the player's own origin, plus `?embedder=` origins that
  also match a build-time allowlist (protoyard.app, localhost, 127.0.0.1). `*` is never accepted.
- **Page hardening:** the player ships a strict CSP and a no-code-execution guard.

**Consequences.** Every untrusted path shares one set of tested limits. Links stay short enough
for chat tools.
**Reverse:** raise the caps in one module; the protocol is versioned.

## ADR-031 — Quick explorations live in a marked .protoyard/quick zone

**Context.** `protoyard quick` writes disposable prototypes. Output confinement allows only
`artifacts/` and `tmp/` today. Explorations are not builds.

**Decision.**
- **Location:** explorations go to `.protoyard/quick/<slug>/` with a `.protoyard-quick` marker,
  a third zone in the output guard. Outside a workspace they go to `./.protoyard/quick/`, never
  `$HOME`.
- **Player files:** one shared `.protoyard/quick/_player/<version>/` holds the prebuilt player,
  and `--standalone` copies it in for a self-contained folder.
- **Metadata:** each exploration records `quick.json` (zod-validated).
- **Pruning:** it needs `--yes`, `--json` without `--yes` only reports, and prune never touches
  a promoted exploration.
- **Validation tasks:** success conditions are a restricted data predicate plus a route match,
  never an expression language.

**Consequences.** Explorations never land in `prototypes/`. They are cheap to create and safe
to delete, and promotion is explicit.
**Reverse:** the zone is one entry in the guard; removing it disables quick outputs.

## ADR-032 — Format extensions: archetypes, workflows, computed fields, relations, per-entity screens

**Context.** Practically any prototype needs more than entity CRUD. The format must stay data
only, deterministic and safe to load from untrusted sources.

**Decision.**
- **Archetypes:** an `archetype` block (assistant, team-chat, saas-onboarding, analytics) is
  portable runtime data. The player and the generator both read it, and it binds to the
  existing lazy kits.
- **Workflows:** explicit state machines (states, transitions, guards over roles and fields),
  with no executable logic.
- **Computed fields:** read-time expressions from a small allow-listed grammar (arithmetic,
  concatenation, date difference, aggregates over relations). They are never persisted, so no
  migration is needed.
- **Relations:** cardinality, inverse and on-delete behavior are explicit.
- **Per-entity screens:** each entity can set screen defaults and overrides.
- **Imports:** CSV, JSON and SQLite DDL imports produce a complete playable draft and never copy
  values.

**Consequences.** One format expresses far more products, and every extension stays inside the
hardened loader's limits.
**Reverse:** each extension is optional; omitting it yields today's blueprints.

## ADR-033 — A distributable skill lives in this repository

**Context.** The developer's other skills (deepworkplan-skill, agent-skill) ship a router plus
sub-skills, a trust file, validated frontmatter, pinned installs, checksums and a consent-gated
upgrade. A Protoyard skill must not drift from the CLI it teaches.

**Decision.**
- **Location:** `skills/protoyard/` holds a short router and sub-skills (install, quick, new,
  iterate, kits, review, ship, upgrade), plus `TRUST.md` and references.
- **Install:** pin by tree URL (`npx skills add https://github.com/DailybotHQ/protoyard/tree/vX.Y.Z --skill protoyard`).
  A bash-3.2 `setup.sh` covers claude, cursor, codex, gemini, copilot, opencode and windsurf, and
  OpenClaw gets native instructions.
- **Release:** releases stamp the version into every SKILL.md, attach `SHA256SUMS` for the skill
  tree, and smoke-install the tag.
- **Docs:** `documentation_url` is `https://protoyard.app/docs/`.
- **Validation:** CI checks the frontmatter, the links, and that every command and flag the skill
  names exists in `protoyard help`.

**Consequences.** One tag versions the CLI, the packages and the skill together.
**Reverse:** the skill folder can move to its own repository; install URLs change.

## ADR-034 — A versioned machine interface and an MCP server

**Context.** DeepWorkPlan addons detect a product by a command and an interface number. Agents
without shell glue need typed tools.

**Decision.**
- **Interface:** `protoyard doctor --json` adds top-level `interface` (1) and `capabilities`
  beside `ok`, `command` and `data`. `protoyard --version --json` prints `{version, interface}`,
  and plain `--version` stays semver.
- **Capabilities:** the stable ids are `quick`, `player`, `generate`, `mcp`, `blueprint-schema`
  and `import`; other fields are discovery metadata.
- **Versioning:** the interface major is independent of the package version and bumps only on a
  breaking change (`docs/INTERFACE.md`).
- **MCP:** `protoyard mcp` is a stdio MCP server on the current stable protocol revision. Its
  tools map to the CLI's JSON envelopes, are confined to the workspace like the CLI, and return
  failures as tool results with `isError: true`.

**Consequences.** Detectors and agents have a contract they can test against. The CLI stays the
only source of behavior.
**Reverse:** additive fields; dropping them only removes the guarantees.

## ADR-035 — Protoyard stays independent; DeepWorkPlan gets an addon

**Context.** The developer wants DeepWorkPlan plans to spin up throwaway prototypes to validate
ideas. DWP loads addons only from its own pack (`addons/<key>/` with an `addon.json`).

**Decision.**
- **Independence:** Protoyard never depends on DWP.
- **The addon packet:** a Protoyard-side packet in `integrations/deepworkplan/protoyard/` holds
  the addon: a descriptor valid against DWP's addon-descriptor schema (`detect: protoyard
  --version --json`, `interface_from: json:interface`), `SKILL.md`, `SPEC.md`, and
  exploration-task templates with ready gates. Detection uses `--version --json` because it exits
  0 wherever the CLI is installed; `doctor --json` exits 1 on a failed check and 3 outside a
  workspace (amended 2026-10-20, see `docs/INTERFACE.md`).
- **Upstream:** it is contributed to deepworkplan-skill after a GO.
- **How an exploration runs:** in a temporary directory, with only validated artifacts copied
  into the plan's `analysis_results/prototypes/`. A missing browser is a recorded
  `playwright-unavailable` skip, never a failed gate.

**Consequences.** DWP can validate ideas with level-1 prototypes and record the decision, while
Protoyard ships on its own cadence.
**Reverse:** remove the addon from DWP; Protoyard is unaffected.

## ADR-036 — Blueprint kinds: app, deck, page and doc

**Context.** "Protoyard creates anything" was true only for apps. Every blueprint requires
`entities` and `roles`, and the player and `generate` render one app shape. Decks, landing pages
and documents need the same JSON-in-minutes path. Existing identities must not change: share
links, `bp-` namespaces and world caches all hash the parsed blueprint.

**Decision.**
- **The discriminator:** a top-level `kind`: `app`, `deck`, `page` or `doc`.
  - A missing `kind` means `app`.
  - The app schema accepts an optional `kind: "app"` with no default, and the parse step deletes
    it, so every existing blueprint keeps its content identity.
  - A golden identity file freezes this.
- **Types:** `Blueprint` stays the app type, and `parseBlueprint` stays app-only, because about
  two dozen consumers read `.entities`.
  - `AnyBlueprint` and `parseAnyBlueprint` add the union.
  - The type is `BlueprintKind`; the registry's `ProjectKind` is unrelated.
- **Schema ownership:** each kind's body schema lives in its engine package, with no Svelte:
  - `@protoyard/decks/schema`;
  - `@protoyard/blocks`;
  - `@protoyard/pages`.

  `@protoyard/blueprint` owns the union.
- **Format version:** `formatVersion` stays 1, following ADR-024's additive policy. An unknown
  `kind` gets a friendly "needs a newer Protoyard" error.
- **The untrusted loader:**
  - It keeps stripping C0 and bidi controls.
  - It preserves `\n` only in schema-declared content paths (markdown, notes, quotes) and `\t`
    only in code, normalizing `\r\n`.
  - It adds per-kind caps for slides, blocks, depth and embedded bytes.
- **What the kind selects:** the renderer at both levels, plus the synthesizer, variants,
  validation summary, doctor capability, MCP inputs and gallery shelf.

**Consequences.** One format and one loader cover four kinds. Apps are untouched.
**Reverse:** drop the non-app branches; app blueprints never carried `kind`.

## ADR-037 — Blocks are the shared content primitive

**Context.** Decks, pages and docs all need headings, rich text, charts, stats, media, code,
diagrams and interactive pieces. Three separate renderers would drift, and untrusted content
needs a single hardened surface.

**Decision.**
- **Packages:** `@protoyard/blocks` (engine: zod union, limits, untrusted guard, JSON Schema,
  `BLOCK_CATALOG` with use-when metadata, text and outline helpers, a closed-AST formula engine, a
  tiny code tokenizer, diagram layout math) and `@protoyard/blocks-ui` (one lazy subpath per
  family behind a small dispatcher).
- **Content:**
  - Rich text is a markdown string (at most 4,000 characters) parsed by `@protoyard/ai/markdown`.
  - Charts use `@protoyard/ai/chart` `ChartSpecSchema` on charts-ui.
  - Both are imported, not moved.
- **No styles in data:** colors are **tones** (neutral, accent, info, success, warning, danger)
  mapped to theme tokens. Blocks never accept CSS, hex values or style strings.
- **Media at level 1:** avatar ids, raster data URIs (png, jpeg, webp, gif) and video data URIs
  (mp4, webm), at most 192 KB each and 512 KB per document. There is no SVG, no remote `https` and no iframe. Relative
  assets are level 2 only.
- **Interactive state:** pure reducers plus a `BlockStateHost` contract (`read`, `dispatch`) that
  the kind runtime implements as a service (`environment.run` → `db.transaction`). blocks-ui
  never imports the database.
- **Formulas:** a closed AST evaluated by a pure interpreter. Never `eval` or `new Function`.
- **embed-app:**
  - an opaque, bounded app blueprint;
  - mounted through a host-injected `mountEmbed`;
  - app kind only, one level deep, in its own namespace.
- **Unknown block types:** strict authoring rejects them, and the renderer shows a "needs a newer
  Protoyard" note.

**Consequences.** One safe vocabulary serves every content kind, and new kinds compose blocks
instead of re-implementing them.
**Reverse:** blocks is additive; removing it removes the content kinds.

## ADR-038 — Decks: a native engine, one DeckApp for both levels

**Context.** The developer's site renders decks with Reveal.js and Markdown parsed in the
browser. That gives an empty first paint, a 303 KB highlight.js bundle, KaTeX from a CDN, and
Tailwind conflicts that needed workarounds. Protoyard decks must also work offline as
single-file artifacts and render identically at level 2.

**Decision.**
- **Packages:** `@protoyard/decks` (engine) and `@protoyard/decks-ui`, with no Reveal.js.
- **Slides:** a slide is `{ layout: <catalog id>, props }` or `{ layout: "free", blocks }`.
  - `@protoyard/decks` owns the layout catalog: the 19 layouts and 8 backgrounds (13 presets today) ported from the
    developer's site, plus `chart` and `free`.
  - Each entry has a props schema, limits, use-when and don't-use-when text, and pacing types.
  - Authoring tools consume the catalog; they do not copy it.
- **Canvas:** a fixed virtual canvas (1280×720, 1024×768, 720×1280, 1080×1080) scaled by a
  transform. Lint thresholds are in canvas pixels: 24 px body text, 18 px labels.
- **Navigation:** a pure model; guarded click, keyboard and swipe; deep links
  `#/<slide-id>/<step>`; an overview grid.
- **Presenting:** a presenter view over `BroadcastChannel`, with an in-page fallback when the
  popup is blocked (the artifact sandbox, for example); blackout, laser and fullscreen; print to
  PDF with one slide per page.
- **Motion:** steps and fragments, View Transitions with a CSS fallback, and reduced motion.
- **Code:** highlighted by the blocks tokenizer. No KaTeX in v1.
- **Customization:**
  - A deck `style` block: theme or palette seed, fonts, aspect, transition, backgrounds, density,
    radius, motion level, logo and footer, numbering, progress.
  - Per-slide overrides.
  - **Deck Studio**, a lazy DevTools tab that exports RFC 6902 patches. `mountPrototype` gains an
    extra-tabs option, so DevTools stays deck-agnostic.
- **One component:** `DeckApp` is the only deck component. The player's deck entry and generated
  deck prototypes both mount it.

**Consequences.** Decks are fast, offline-safe, themeable and identical at both levels.
**Reverse:** a Reveal adapter could render the same deck JSON; the schema does not depend on the
engine.

## ADR-039 — Pages and docs

**Context.** Landing pages, reports, one-pagers and data stories are common things to prototype.
They need block flow, navigation, print and a form that persists.

**Decision.**
- **Packages:** `@protoyard/pages` (engine: page and doc documents, limits, a TOC builder from
  heading and section ids, form-response schema, services) and `@protoyard/pages-ui` (`PageApp`,
  `DocApp`, a form block, a responses panel with CSV export, print CSS).
- **Pages:** a single scroll with anchor navigation in v1. Multi-route sites are level 2.
- **Forms:** the form block schema lives in `@protoyard/blocks`, with a public-form field subset.
  Responses persist in a `formResponses` feature table through services, so snapshots include
  them.

**Consequences.** Two more kinds with almost no new rendering code.
**Reverse:** remove the packages and the union branches.

## ADR-040 — Per-kind player entries, single-file pruning, kind templates and level parity

**Context.** The player always loads the crud app shell (about 108 KB), Faker and the generation
worker. Single-file exports inline every chunk (about 3.2 MB). Kit archetypes render only in the
player, which splits level 1 from level 2.

**Decision.**
- **Routing:** the player routes by kind before the app boot chunk loads. `index.html` injects
  `bootByKind` (`sources/boot-any.ts`) into the shared loop (`run.ts`); `deck.html`, `page.html`
  and `doc.html` inject only the kind boot (`sources/kind-boot.ts`), so their reachable graph
  never names the app boot, the CRUD shell, the world worker or the app generator.
- **Entries:** one Vite build with several HTML inputs. `index.html` stays universal, and
  `deck.html`, `page.html` and `doc.html` are minimal entries.
- **Single-file pruning:** exports embed only the chunks reachable from the chosen entry.
- **Budgets:** the provisional limits are 150 KB initial JS gzip and 30 KB CSS for kind entries,
  and 1.5 MiB for a deck single file. Measured numbers replace them in `protoyard.budgets.json`.
  *Outcome (2026-10-22):* the kind JS and CSS budgets stayed at 150 KB and 30 KB. The 1.5 MiB
  single file was not met (about 1.61 MB, because DevTools, Deck Studio and the theme tools
  stay); the enforced cap is 2.5 MiB per kind (2 MiB until the npm Texuli 0.3.0, ADR-045) (`QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES` in
  `packages/cli/src/lib/quick/single-file.ts`), and `kinds.*.singleFileKb` is recorded but not
  read by any gate. The player worker graph cap is one constant, `WORKER_GRAPH_GZIP_KB = 220`
  (`packages/player/tests/player-budgets.ts`).
- **Runtime:** non-app kinds mount a minimal runtime, `defineKindRuntime`: one database version
  with interactive-state and form-response stores, a default scenario, and presenter, audience
  and viewer personas. Themes, DevTools, snapshots and review keep working.
- **Level 2:**
  - `generate` picks `templates/deck`, `templates/page` or `templates/doc` by kind; an explicit
    template must declare the same `blueprintKind`.
  - Generated prototypes import the same `DeckApp`, `PageApp` and `DocApp`.
  - A parity test proves both levels render the same thing.

**Consequences.** Light artifacts, identical rendering at both levels, and no archetype-style
split for kinds.
**Reverse:** kind entries are additive; the universal entry still renders every kind.

## ADR-041 — Promoting fork capabilities into generic core

**Context.** Two product forks built capabilities upstream lacked: a command palette, a rich
editor, workflows, adaptive phone/desktop presentation, OTP sign-in, gamification, design kits
and more. They also worked around upstream bugs. The developer wants these as defaults, kept
product-agnostic.

**Decision.**
- **Generic only:** capabilities are rewritten generically, never copied with names, copy,
  tokens, assets or domain terms. This is a review rule, checked at each plan checkpoint and in
  the final review; `pnpm hygiene` covers private emails, personal paths and secrets, not
  product names.
- **Where things land:**

  | Capability | Package |
  |---|---|
  | command palette and hotkeys | `@protoyard/views/commands` (+ views-ui) |
  | rich editor | `@protoyard/views/editor` (+ views-ui) |
  | workflows | a new `@protoyard/flows` (+ flows-ui) |
  | gamification | a new `@protoyard/gamification` (+ gamification-ui) |
  | phone OTP and the account gate | saas and saas-ui |
  | controls, notices, overlays and the carousel | ui |
  | timeline registry, scripted counterparts and life-stage presets | scenarios |
  | clock ticks and the scenario switcher | renderer-svelte |

- **Safety:**
  - Rule ASTs replace executable expressions.
  - Autonomy levels and approvals are simulations; effects run only through service callbacks.
  - The rich editor stores safe markdown, never HTML.
- **Bug fixes:** the forks' upstream fixes land with regression tests, after reconciling against
  current upstream.

**Consequences.** Every new prototype starts with what two product teams had to build by hand.
**Reverse:** each kit is a separate package or subpath; removing one affects only its users.

## ADR-042 — Adaptive presentation and modal routes

**Context.** A product prototype often needs one app with a phone and a desktop presentation.
Overlays become a sheet on phones and a dialog on desktop, and some routes open as sheets over
the previous screen.

**Decision.**
- **Adaptive presentation:** `renderer-svelte` owns an adaptive presentation store. The view is
  resolved from `?view=`, then the phone frame, then a saved preference, then width, and
  `runtime.overrides` `{shell, viewport}` keeps the frame and layout in agreement. `ui` adds a
  thin toggle and an `AdaptiveOverlay` (sheet, dialog or side panel, resolved by
  `resolveAdaptiveOverlayPresentation` with a 768 px breakpoint).
- **Modal routes:** routes may declare `overlay: true` and a desktop layout hint. The router
  draws them over the last full-screen route, and closing returns to it.
- **Floating chrome** (the demo badge, DevTools launcher, review toolbar and toasts) stays inside
  the visible viewport and above bottom navigation.

**Consequences.** Adaptive products prototype naturally in device frames.
**Reverse:** opt-in; apps that ignore it render as today.

## ADR-043 — Design-system kits

**Context.** Product teams start by turning a design system into a kit prototype. A downstream
fork built foundations pages, a props table, review status, token conversion and a byte-copy sync,
because export isolation forbids importing across prototypes.

**Decision.**
- **Token import:** `protoyard theme import <tokens.json>` produces a validated theme with a
  contrast report, and the palette input type is exported so token-built palettes need no cast.
- **Template:** `templates/design-kit` scaffolds foundations pages, a component catalog with a
  generated props table, copy snippets, persisted review status and phone/desktop demos.
- **Sharing:** `protoyard kit sync <kit> <prototype> [--check]` copies a kit into a
  prototype-owned folder with recorded hashes and detects drift, so isolation holds.

**Consequences.** "Turn our design system into a kit, then prototype with it" becomes a first-class
loop.
**Reverse:** the template and commands are additive.

## ADR-044 — Adopt Texuli as the component library

**Context.** Protoyard's components, themes, charts, rich views, content blocks and layouts grew
inside `@protoyard/*` packages. They were extracted into Texuli, a standalone MIT Svelte 5
component library (sibling checkout `../texuli`), so the same owned components serve Protoyard
and any other app. Keeping two copies would mean fixing every bug and accessibility gap twice.

**Decision.**
- **Linked, not copied.** The root `package.json` declares ten `link:` dev dependencies on
  `../texuli/packages/*`. Packages import Texuli by name; texels come through their subpaths
  (`@texuli/core/<texel>`), never the root barrel.
- **What moved to Texuli** (details in [TEXULI.md](TEXULI.md)):
  - theme tokens: `@protoyard/themes` wraps `@texuli/tokens`;
  - generic styled components: `@protoyard/ui` re-exports them from `texuli`, and its simple,
    floating and dialog-family controls are wrappers on `@texuli/primitives`;
  - layouts: `LayoutHost` wraps `texuli/layouts`, which registers 11 of the 12 layouts;
  - charts, rich views and content blocks: `@protoyard/charts`, `charts-ui`, `views`,
    `views-ui`, `blocks` and `blocks-ui` re-export Texuli with thin adapters.
- **What stays Protoyard's:** the prototype pieces (device frames and shells, `ScenarioSwitcher`,
  honesty tags, actors), the overlay stack and undo toaster, the `docs` layout, the components
  whose APIs still differ (listed in [TEXULI.md](TEXULI.md#follow-ups-components-that-stay-protoyard-wrappers)),
  and the host-only view and block kits.
- **Public APIs are kept.** Prototypes import from `@protoyard/*` as before; the look of the
  re-exported components is Texuli's (`tx-*` classes on `--tx-*` variables, which the renderer
  writes next to `--py-*`).

**Consequences.**
- Fixes and new components land once, in Texuli, and reach every prototype.
- Installing Protoyard needs the Texuli checkout at `../texuli`, installed first. A fresh clone
  of Protoyard alone cannot install until Texuli is published or vendored, which is a later
  decision.
- **The npm packages cannot be released yet.** Eight packages (`themes`, `devtools`, `charts`,
  `charts-ui`, `views`, `views-ui`, `blocks`, `blocks-ui`) declare their Texuli dependencies as
  `link:` specifiers, and `pnpm check:packages` refuses a packed manifest that carries one
  (`LOCAL_DEPENDENCY`). `@protoyard/ui` resolves Texuli through the root links without declaring
  it. Both change when Texuli is published.
- Protoyard's typecheck covers its own code; Texuli's sources are checked by Texuli's gates.

**Reverse:** the adoption lives on the `texuli-adoption` branch. Reverting its merges restores
Protoyard's own copies; because the `@protoyard/*` APIs were kept, prototypes need no change.

## ADR-045 — Install Texuli from npm

**Context.** ADR-044 linked Texuli from a sibling checkout. Texuli is now published on npm
(`texuli` and `@texuli/*` at 0.3.0). Under `link:`, a fresh clone could not install, packages
with `link:` dependencies could not be packed, and `svelte-check` never type-checked the
linked Texuli sources.

**Decision.**
- **npm only.** Every Texuli dependency is an exact npm version, the same for every package.
  No manifest uses `link:` or `file:` for Texuli. A package declares the Texuli packages it
  imports.
- **Release-age guard.** `minimumReleaseAge` (3 days) still applies to every third-party
  dependency. `texuli` and `@texuli/*` are excluded, because the same owner releases them and
  Protoyard adopts each release the day it ships.
- **Texuli first.** `scripts/check-texuli-adoption.ts` ratchets Protoyard toward Texuli and
  blocks new duplicates ([TEXULI.md](TEXULI.md#texuli-first-the-adoption-check)). Lucide
  stays the glyph source behind `texuli/icons`, which is Texuli's documented icon model.
- **Gaps go upstream.** When Texuli lacks an API, Protoyard keeps a minimal adapter, records
  the gap, and the Texuli maintainers fix it in a release.

**Consequences.**
- A fresh clone installs with `pnpm install` alone.
- Protoyard type-checks against Texuli's published `.d.ts` files, which catches mismatches
  the links hid. The charts `format` prop was one.
- Each Texuli upgrade is one coordinated version bump across the workspace.
- **How to reverse:** point the specifiers back at `link:` paths (ADR-044) and remove the
  release-age exclusion.
