# Changelog

All notable changes to Protoyard are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-17

The foundation: an open-source, browser-first workspace for building functional
prototypes — real behavior, fake infrastructure — and exporting each one as a
static site.

### Added

- **Core contracts** (`@protoyard/core`): the data-only `protoyard.json`
  manifest, strict slugs, seeded PRNG and deterministic ids, simulation clock and
  time helpers, simulated environment (network modes, failure injection),
  composable scenario schema with reproducible `?scenario=` links,
  personas/organizations/memberships with a permission policy, domain events,
  overrides with effective-value resolution, snapshots and themes. Workspace
  TypeScript is erasable-syntax only, so it runs under Node type stripping.
- **Database** (`@protoyard/database`): namespaced Dexie storage per prototype
  (`protoyard.<namespace>.data` / `.control`), a control store, cumulative
  migrations, an in-memory fallback with honest storage status, and snapshot I/O.
- **Scenarios** (`@protoyard/scenarios`): a seeded generator SDK (faker, PRNG,
  fixed reference time, density scaling), presets and fragments with `extends`,
  referential-integrity validation and timeline helpers.
- **Runtime** (`@protoyard/runtime`): one `PrototypeRuntime` composing scenario
  load/reset/advance, session switching, overrides, clock, environment, themes,
  snapshots and a data inspector; chunked writes with progress for large worlds;
  link theme/mode/density overrides; generator versions recorded per world.
- **Themes** (`@protoyard/themes`): six WCAG AA-checked presets, light/dark/system,
  reduced motion, density and a no-flash boot script.
- **UI kit** (`@protoyard/ui`): accessible Svelte 5 components (dialogs, bottom
  sheets with swipe-to-dismiss, selects, combobox, data tables, kanban, pagination,
  app shell, chat and mobile navigation).
- **Renderer** (`@protoyard/renderer-svelte`): `defineProtoyardConfig` for Vite,
  `mountPrototype`, reactive runtime bindings, live queries, a hash router,
  persistent-storage requests and scenario load progress.
- **DevTools** (`@protoyard/devtools`): a floating panel for scenarios, personas,
  time travel, environment, appearance, snapshots, data, share links and storage
  status.
- **CLI** (`@protoyard/cli`): `doctor`, `list`, `index` (manifests parsed as data,
  incremental cache), `new` (retry-safe, path-guarded scaffolding), `dev`,
  `validate`, `build` / `build --all` (build manifest with sha256 per file),
  `export` (deterministic ZIP with a cross-prototype isolation check), `preview`,
  `publish` (Cloudflare Pages; Netlify and Vercel experimental; static; `--dry-run`),
  `scenario list|validate`, `snapshot list`, `showcase` (gallery + every prototype
  as one static site), `gallery` and a localhost control server. Every command
  supports `--json` with a stable envelope and documented exit codes; templates
  are valid targets for run/validate/build.
- **Gallery** (`apps/gallery`): a static Astro site reading only the generated
  registry — instant search, filters, sort, favorites and recent, pagination for
  1,000+ entries, prototype and template detail pages, device preview frames,
  thumbnails, live demos in showcase builds, a create-command builder and a
  light/dark/system theme.
- **Templates**: blank, mobile app, SaaS dashboard, chat, onboarding wizard,
  task manager and e-commerce storefront.
- **Example prototypes**: Pipeline CRM (`crm-demo`, including an enterprise-scale
  scenario), Lumen Bank (`mobile-banking-demo`, atomic transfers and scheduled
  ledger events on time advance), Relay (`ai-chat-demo`, scripted streaming agents)
  and the Protoyard UI Kit showcase.
- **Quality gates**: unit and integration tests on the real runtime, Playwright
  E2E against real static builds (Chromium desktop and mobile, including the
  showcase under a sub-path), a public-hygiene check, a 1,000-manifest index
  benchmark and thumbnail generation from the real built apps.
- **Project infrastructure**: CI (hygiene, lint, types, tests, builds, E2E) with
  SHA-pinned actions, a manual GitHub Pages deploy of the showcase, a tag-driven
  release workflow, Dependabot, issue and pull request templates, and docs
  (product spec, architecture decisions, security model, standards, testing,
  command reference, guides for agents, performance measurements).

### Fixed

- Environment overrides use a defaults-free patch schema, so partial overrides no
  longer reset other fields.
- Restoring a snapshot re-applies its captured appearance; older snapshots are
  reported truthfully on import.
- UI fixes: announced Select values, synchronized Combobox input, DevTools usable
  above app modals and bottom navigation, composable AppShell/headers/Kanban.
- The gallery no longer ignores input typed before hydration and does not overflow
  horizontally on phones.

[Unreleased]: https://github.com/DailybotHQ/protoyard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/DailybotHQ/protoyard/releases/tag/v0.1.0
