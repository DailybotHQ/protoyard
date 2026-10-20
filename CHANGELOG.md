# Changelog

All notable changes to Protoyard are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-20

The first stable release: Protoyard grows from a prototype runtime into a
workspace where people and agents can imagine almost any product, generate it
from a brief or a blueprint, review it with pinned comments and share it. The
platform packages, the CLI and the gallery move to 1.0.0. Prototypes and
templates keep their own app versions.

### Added

- **Kits beyond CRUD**, each on lazy subpaths so a prototype pays only for
  what it uses:
  - **Rich views** (`@protoyard/views`, `@protoyard/views-ui`): board with WIP
    limits, calendar with recurrence, Gantt timeline with dependencies, a
    virtualized data grid (measured on 100,000 rows), trees, an offline
    fictional map, a Markdown editor, activity, a file manager and a command
    palette.
  - **Charts** (`@protoyard/charts`, `@protoyard/charts-ui`): Protoyard's own
    chart kit (cartesian, part-whole, matrix, compact, Canvas and geo) with
    keyboard access, "View as table" fallbacks and theme-token palettes.
  - **Analytics** (`@protoyard/analytics`, `@protoyard/analytics-ui`): events,
    metrics, date ranges, filters and segments, funnels, cohorts, drill-down
    and an editable dashboard grid over deterministic generators.
  - **SaaS kits** (`@protoyard/saas`, `@protoyard/saas-ui`): simulated sign-up
    and sign-in, a fake OAuth round trip, magic links, MFA, invitations,
    workspaces, onboarding, plans, checkout, invoices and an in-app inbox.
  - **AI kits** (`@protoyard/ai`, `@protoyard/ai-ui`): scripted streaming
    assistants, agents with tool calls and approvals, safe rich answers
    (including validated chart answers), a canvas, voice mode and widget modes.
  - **Avatars** (`@protoyard/avatars`): 175 fictional portraits with a verified
    manifest, assigned deterministically by every people generator.
- **Blueprints and the generator** (`@protoyard/blueprint`, `@protoyard/crud`):
  data-only `blueprint.json` files become working prototypes with
  `protoyard generate`: list, detail and form screens plus dashboard, board,
  calendar, timeline, map, analytics and settings screens, selectable layouts,
  brand themes, avatar fields and regeneration with ownership and drift checks.
  A catalog of 40 product blueprints ships in `blueprints/`.
- **Brief to prototype**: `protoyard blueprint new --from-brief` turns a prose
  brief into a validated blueprint offline, ready to review and generate.
- **Layouts and shells**: twelve shared lazy layouts (sidebar, rail, top nav,
  dual sidebar, master-detail, dashboard grid, docs, wizard, mobile tabs,
  mobile drawer…) and device and host shells (phone, tablet, desktop window,
  browser, widget host, extension popup, side panel), switchable from DevTools
  or with `?layout=` and `?shell=`.
- **Theme library and Theme Studio**: 64 lazy library themes in six
  collections (including AAA high contrast and colorblind-safe), a palette
  engine from one brand color, style presets, Theme Studio with color
  harmonies and shareable theme links, and the `protoyard theme` CLI.
- **Review comments** (`@protoyard/review`, `@protoyard/review-ui`): opt-in
  comments pinned to screens of a built prototype, with local, HTTP/Cloudflare
  and Claude artifact adapters, a server handler, DevTools hosting, import and
  export, and `protoyard comments pull` to turn them into a `REVIEW.md`.
- **Sharing as a private Claude artifact**: `export --target artifact` packs one
  prototype and checks every artifact rule; `artifact record` and
  `artifact list` keep a local share ledger.
- **Showcase**: `protoyard showcase` builds the gallery, the marketplace and a
  live demo of every prototype and template as one static site.
- **Specs**: every prototype carries an `AGENTS.md` and a `docs/` spec whose
  generated regions stay in sync with the code (`protoyard spec --check`), plus
  a rebuild kit.
- **Templates**: 27 templates in total, now including admin console, agent
  console, AI assistant, analytics, B2B SaaS, booking calendar, chat widget,
  clinic, course LMS, CRUD app, desktop app, docs wiki, fintech dashboard, IoT
  monitoring, logistics map, marketplace, plugin panel, project management,
  social feed and team chat.
- **Flagship prototypes**: Lattice (B2B SaaS), Nova Assistant, Relay Chat,
  Northwind Help (support widget), Keel Projects, Pebblestat Analytics, Atlas
  Workspace, and the blueprint-generated Beacon Help Desk, Harborlight
  Dispatch, Cadence Studio and Pulse Revenue — 15 prototypes in total.
- **Gallery**: a marketplace with filters and theme facets, a searchable theme
  explorer with "try in theme", review counts and shared-artifact links.
- **CLI**: `generate`, `blueprint`, `theme`, `budget`, `affected`, `spec`,
  `comments`, `artifact`, `showcase` and `scenario bench`, all with `--json`.
- **Benchmarks and QA scripts**: index, cold-start, charts, grid and idea
  benchmarks, a visual sweep across prototypes, templates and themes, and
  thumbnail generation.

### Changed

- Every template and flagship prototype adopted the shared layout host and
  shows seeded avatar photos wherever people appear.
- DevTools gained a layout picker, shell and device controls, the theme
  browser, Theme Studio and lazy extension tabs, and its share link carries
  theme, mode, layout and style overrides.

### Fixed

- Artifact packs escape the U+FFFD replacement character that a bundled
  dependency ships, so the Artifact host accepts them.
- A security review of PLAN_003 closed findings across the CLI (symlinks,
  output confinement, `__proto__` keys), review comments (rate limits, anchor
  sanitizing, untrusted `REVIEW.md`), blueprints (CSV formula guards, fictional
  contact data), themes (control and bidi characters) and views (nested filter
  limits), each with a regression test.
- Accessibility and contrast fixes across charts, the timeline, the gallery and
  the demo badge.

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

[Unreleased]: https://github.com/DailybotHQ/protoyard/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/DailybotHQ/protoyard/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/DailybotHQ/protoyard/releases/tag/v0.1.0
