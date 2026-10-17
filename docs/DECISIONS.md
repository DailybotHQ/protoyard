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
