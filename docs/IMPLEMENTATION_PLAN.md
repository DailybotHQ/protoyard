# Implementation Plan

Living checklist for building Protoyard. Items are marked **[x] verified** only
when a command proved them; **[~] partial** when something works but a gap is
known; **[ ]** otherwise. Deferred work is listed explicitly at the bottom.

The execution record for this work is the Deep Work Plan
`PLAN_001_protoyard_foundation` (kept under the git-ignored `.dwp/plans/`).

## Architecture in one paragraph

A pnpm workspace. `@protoyard/core` holds framework-agnostic contracts (zod
schemas + interfaces). `@protoyard/runtime` composes the engine packages
(`database`, `scenarios`, `themes`) into one `PrototypeRuntime`. Each prototype
is an independent Vite + Svelte 5 app under `prototypes/<slug>/`, described by
a data-only `protoyard.json` manifest and wired by `src/prototype.ts`.
`@protoyard/renderer-svelte` mounts it (with `@protoyard/devtools` and
`@protoyard/ui`). The Astro gallery reads a generated metadata registry and
never imports prototype code. The CLI (`pnpm protoyard …`) discovers, indexes,
scaffolds, runs, validates, builds, exports and publishes ONE target at a time.

## Lanes and path ownership (parallel build)

One writer per path. A lane never edits a path owned by another lane; it sends
the owner a request instead. Only the lead runs `pnpm install` and edits the
root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `biome.json`,
`tsconfig.base.json`, `AGENTS.md`, `README.md` and `docs/` (lanes may add their
own `README.md` inside the packages they own and hand doc notes to the lead).

| Lane | Pane | Owns |
| --- | --- | --- |
| Lead | `wH:p5` | root files, `packages/core`, `docs/`, DWP harness (`.agents/`, `.dwp/`), integration, commits |
| A — Engine | `wH:p6` | `packages/database`, `packages/scenarios`, `packages/runtime` |
| B — Experience | `wH:p8` | `packages/themes`, `packages/ui`, `packages/devtools`, `packages/renderer-svelte`, `templates/` |
| C — Tooling | `wH:p9` | `packages/cli`, `apps/gallery`, `scripts/`, `.github/`, `playwright.config.ts`, `tests/e2e/` |

Later waves move the demos (`prototypes/*`) to lanes as the engine stabilizes.

## Phase 0 — Scaffold

- [x] pnpm workspace, strict TypeScript base, Biome, `.gitignore`, MIT license
- [x] `@protoyard/core` contracts: manifest, slug, PRNG/ids, clock, environment,
      scenario schema + links, session/policy, events, overrides, snapshot, theme,
      prototype definition, runtime interfaces
- [ ] Gallery shell (Astro) and CLI skeleton
- [ ] `pnpm dev`, `pnpm protoyard new hello --template blank` work

## Phase 1 — Vertical slice (MUST)

- [ ] CLI: help, doctor, list, index, new, dev, validate, build, export (+ `--json`)
- [ ] Database: namespaced Dexie DBs, control store, migrations, storage errors
- [ ] Scenarios: presets, seeded generator SDK, referential integrity, load/reset
- [ ] Runtime: session switch, overrides, clock, environment, snapshots
- [ ] Themes engine + baseline DevTools
- [ ] `crm-demo` end to end with permissions and reload persistence
- [ ] One working template (`blank`)
- [ ] Unit tests for critical state flows; static ZIP export; local preview

## Phase 2 — Generalization (MUST)

- [ ] `mobile-banking-demo` (atomic transfers, fictional ledger)
- [ ] 5+ theme presets, light/dark/system, reduced motion
- [ ] Lifecycle + time travel (preview vs committed advance)
- [ ] Templates: dashboard, mobile-app, onboarding, chat
- [ ] Polished gallery, device preview, scoped builds
- [ ] Playwright E2E across domains; stable `--json` output

## Phase 3 — Publication and scale (MUST)

- [ ] Publish adapter contract, Cloudflare Pages adapter, `--dry-run`
- [ ] Portable ZIP, sub-path base support, SPA hash routing
- [ ] 1,000-manifest index benchmark with real measurements
- [ ] CI workflows, OSS docs, security review

## Phase 4 — Stretch

- [ ] `ai-chat-demo`, task-manager and e-commerce templates
- [ ] Netlify / Vercel adapters (only claimed when tested)
- [ ] Scenario comparison, thumbnails, favorites

## Deferred / known gaps

_(filled in as work lands)_
