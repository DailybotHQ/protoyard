# Changelog

All notable changes to Protoyard are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.1] - 2026-11-06

Generic gaps from a consumer, batches 6 and 7. Texuli stays at 0.14.1.

### Added

- **Texuli adoption check:** the `component-scoped-class` rule flags a scoped
  `<style>` rule for a class the markup only passes to a component (such as
  `<Button class="save">`). Svelte never applies it and says nothing; use
  `:global()` under a scoped parent ([TEXULI](docs/TEXULI.md)) (G-060).

### Fixed

- **Demo badge:** it keeps clear of pinned edge chrome, any `fixed` or
  `sticky` bar or rail, even a plain element. On phones, the compact badge
  keeps a 16 px disc on theme surface tokens inside the 44 px touch target,
  and clears every top-level heading (G-057).
- **`EmojiPicker`:** inside a `Field`, the trigger's accessible name includes
  its visible prompt or emoji (axe `label-content-name-mismatch`).
- **Type scale:** with `typography.scaleRatio`, `text-xs` and `text-sm` never
  go below 12 px and 13 px, so a steep ratio on a small body stays readable
  ([THEMES](docs/THEMES.md)) (G-061).

## [1.4.0] - 2026-11-05

Universal gaps from Corag's register (PLAN_012): what a downstream team had to
build locally is now in Protoyard, so any product can localize, theme and
compose the kits without local copies. Texuli 0.14.1.

### Added

- **One dictionary for the whole prototype.** `@protoyard/ui` wrappers no
  longer pass English defaults over Texuli's dictionary, and their own words
  use `protoyard.ui.*` ids (UG-01). The gamification, SaaS account gate, pages
  and docs, views, review and AI kits resolve theirs through
  `protoyard.<kit>.*` ids (UG-02, 04, 05, 06, 11, 56). Every id is listed in
  [TEXULI](docs/TEXULI.md). English stays the fallback, and props still win.
- **Renderer:**
  - `mountPrototype({ toaster })` places the toast stack (UG-12).
  - `mountPrototype({ i18n })` also labels the review UI (UG-06).
  - Adaptive presentation reads link values in the product's language
    (`values`), and `PresentationToggle` switches phone and desktop in the
    app (UG-13).
  - `PrototypeNote` puts the prototype label in the page flow (UG-50).
  - The linked-scenario prompt says its reason in the chrome language
    (`PendingLink.code`, UG-47).
- **Kits:**
  - Gamification accepts runtime ids (`deal_0007`, `pts_u…`), and a mission
    with `requiresAcceptance: false` completes at goal (UG-03).
  - `PointsChip`/`StreakChip` take `icon`; `AchievementBadge` takes
    `earnedAt` and `href` (UG-02).
  - `AccountGate` takes copy props and a `content` snippet (UG-04).
- **ui:**
  - Sidebar renders item icons on the collapsed rail (UG-21).
  - `ChipGroup` takes `variant` (UG-49).
  - `Select` takes `fullWidth` (UG-20).
  - `--tx-safe-*` and `--tx-app-height` are declared on `:root` (UG-15).
- **Decks and design systems:**
  - `DeckApp` takes `messages` and `designSystems`, with a
    `deckDesignSystems(compiled)` helper (UG-09, UG-10).
  - `ds use` modules export `compiled`, and `designSystemVars` was added
    (UG-48).
  - Tailwind gets every Texuli color role (`bg-primary-soft`, `text-link`,
    `border-border-strong`, UG-16).
- **Tooling:**
  - `@protoyard/cli/adoption` exposes the Texuli adoption rules (UG-14).
  - `kit sync --from <dir>` syncs a kit folder outside `src/components`
    (UG-19).
  - Deck, page and doc prototypes get measured budget defaults by
    `blueprintKind`, plus an optional `contentKinds` block (UG-57).
- **Board and Calendar on Texuli 0.14.1:**
  - A collapsed lane still counts in column totals and WIP.
  - On a board with lanes, "Add card" sits in each cell and
    `onCreate(column, lane)` receives the lane.
  - CalendarView forwards `event`, `onMoreEvents` and `maxPerDay` to the
    grid views.

### Fixed

- **The full screen hint** shows only after the person enters full screen, no
  longer on every desktop load of an adaptive app (UG-46).
- **A failed build** no longer reports the offline plugin's ENOENT (UG-53).
- **The docs** say Protoyard is on npm, and `npm create protoyard` is the
  first-run path (UG-18).

### Changed

- **Texuli 0.14.1** (exact pins).
- **Drawer and DetailPanel close button.** It now uses the Dialog's size
  token: 2.25rem on a mouse, unchanged on touch.

### Not in this release

- CSS scanning per component (UG-17) waits on Texuli's per-component CSS.
- `ChipGroup` `tone` and `required`, and `Select` `block`, wait on Texuli
  0.14.2.
- A few chrome controls still have English-only names. They are listed in
  TEXULI.

## [1.3.0] - 2026-11-05

Kit screens on domain adapters ([ADR-046](docs/DECISIONS.md)): a product's
own session, services and data can drive the kits, so a prototype of any
domain reuses them without the simulated engine. Texuli 0.14.0.

### Added

- **saas-ui ports.** `provideSaas({ ports })` runs the route guards,
  `AccountGate`, `SsoButtons`, `TrialBanner` and `WorkspaceSwitcher` (now
  without `runtime`) on plain `session`, `now`, `workspaces`, `oauth` and
  `billing` ports. `provideSaas(runtime)` is unchanged and builds the same
  ports with `saasPortsFromRuntime`. The auth, MFA, onboarding, inbox, billing
  and settings screens still need the engine and say so when it is missing.
- **flows-ui, gamification-ui and pages-ui ports.** `@protoyard/flows-ui/ports`
  (`FlowsPort`, `RunPanel` `port`), `@protoyard/gamification-ui/ports`
  (leaderboard and mission types, opt-in and accept ports), and `FormPort` and
  `ResponsesPort` from `@protoyard/pages-ui/form`.
- **BoardView:** `onCreate(column)` adds an "Add card" button per column,
  `columnHeader` and `columnFooter` snippets, and opt-in lane collapse
  (`collapsibleLanes`, bindable `collapsedLanes`).
- **CalendarView:** a `phone` agenda with a `chip` snippet, "+N more events"
  per day (`maxPerDay`) and "Add event" per day; `agendaDays` and `labels`
  pass through.
- **TimelineView** passes through `onOpen`, `getGroup` (group bands and header
  rows), `maxRows`, `bind:collapsed`, `onGroupAdd`, `bind:selectedRow`,
  `onRowSelect` and `markers`.
- **VoiceMode:** hold-to-talk, bindable `muted`, and dictation into a `draft`
  instead of sending; the voice engine gains `press`, `release` and
  `setMuted`. All simulated, no microphone.

### Changed

- **`FilePreview` is a real preview** (thumbnails and a lightbox for images,
  PDF, text, video and audio, with previous/next and focus return). It was a
  deprecated alias of `FileBrowser`; code that used it as a browser should
  import `FileBrowser`.
- **Texuli 0.14.0** (exact pins). See [TEXULI](docs/TEXULI.md) for what it
  adds for prototypes.

### Fixed

- **`EmojiPicker`:** Enter in its search moves to the first match instead of
  submitting the surrounding form.
- **The demo badge** never covers navigation bars or images such as logos, and
  stays invisible until it has been placed.

## [1.2.4] - 2026-11-05

### Fixed

- **Floating chrome no longer freezes dense pages.** Placing the review
  launcher probed `elementsFromPoint` for every 8 px sample of every candidate
  spot (about 34,500 probes worst case), and a busy DOM re-placed it
  constantly: 9.8 of 11.7 s on a page of 15,000 to 27,000 elements. Probes are
  now cached on a 4 px grid and capped at 240 (corners first), and
  re-placement runs at most every 500 ms.
- **`protoyard sweep` dark shots are dark.** Each shot opens `?mode=light|dark`
  (which wins over a fixed `defaultMode`) and `?devtools=0`; `sweep` takes
  several slugs.
- **Package fonts in a production build.**
  `defineDesignSystemTheme(compiled, { fontFiles: { 'fonts/x.woff2': new URL('./fonts/x.woff2', import.meta.url) } })`
  gives one bundled URL per file; a directory `fontBase` emitted nothing in a
  Vite build, so the fonts 404ed.
- **Visible active sidebar item from a theme.** `designSystemFromTheme` drops a
  `sidebarPrimary` that only copies `primary`, so the compiler derives it.
- **`WeekdayPicker` passes axe** label-content-name-mismatch (WCAG 2.5.3): the
  name is "Mon Monday", the long name visually hidden.
- **`Dialog` forwards `onCloseAutoFocus`**; `preventDefault()` keeps focus
  where the caller put it.
- **A flaky CI test**: review-ui preloads the lazily imported editor, so it
  never resolves after the environment is torn down.

## [1.2.3] - 2026-11-05

### Fixed

- **DocApp speaks the prototype's language.** 1.2.0 said DocApp's outline
  followed `mountPrototype({ i18n })`, but `DocHost` and `DocApp` had fixed
  English strings (reported by the Corag consumer). They now resolve through
  Texuli's dictionary: the outline uses `pages.outline`; the toolbar (Edit,
  Reset, Download, "Download as {format}"), the edit notices and the document
  landmark use `protoyard.doc.*` and `protoyard.pages.*` ids. English stays
  the default. The ids are listed in the Texuli guide.

## [1.2.2] - 2026-11-05

### Changed

- **Texuli 0.13.1.** Every Texuli dependency moves to 0.13.1, an additive
  patch that ships the consumers' second Texuli gap batch: icons registered by
  name (`registerIcons` / `IconsProvider` from `texuli/icons`, then
  `<Icon icon="name" />`), an editable `CodeField`
  (`@texuli/blocks/code-field`), `Image srcDark` (`@texuli/media/image`) and
  `AvatarGroupGrid` (`texuli/avatar`). See the Texuli guide.

## [1.2.1] - 2026-11-05

### Fixed

- **A prototype generated in a consumer workspace builds.** `generate` and
  `blueprint new --generate` no longer write the starter
  `tests/services.test.ts` there: it imports this repository's
  `tests/support/` harness, so `validate --build` failed its svelte-check.
  `tests/generators.test.ts` is still written. Found by generating a
  prototype in a real `npm create protoyard@1.2.0` workspace;
  `verify:packages` now generates a catalog blueprint in the packed consumer
  and builds it.

## [1.2.0] - 2026-11-05

Protoyard from npm, without patches: the gaps two real consumers (Dailybot and
Corag) reported while rebuilding on 1.1.3 and Texuli 0.12.3.

### Added

- **Consumer gates.** `protoyard check texuli [--scope] [--strict]` runs the
  Texuli adoption rules in any workspace, and `protoyard sweep <slug>` captures
  light and dark, desktop and phone PNGs of a built prototype.
  `protoyard/capture` (`capture`, `withReadyPage`, `launchChromium`) and
  `protoyard/static-server` (`serveStatic`) are public subpaths.
- **Gallery from npm.** `protoyard gallery build` and `gallery preview` build
  and serve the gallery for a workspace (`artifacts/gallery/dist/`). The
  gallery package ships the guides, so `/docs/` works offline.
- **Workspace settings.** `protoyard.workspace.json` accepts local `templates`
  globs (found by `new --template` and `list`) and
  `showcase: { templates: false }`, a default that keeps a showcase under a
  host's file limit.
- **`validate --all [--build]`** validates every prototype.
- **The blueprint catalog from npm.** Catalog blueprints ship in
  `@protoyard/templates`, so `list --kind blueprint` and
  `generate --blueprint <id>` work in a consumer.
- **Design systems for every kind.** `ds use` wires deck, page and doc
  prototypes, adds `@protoyard/themes` at the installed version when needed and
  refreshes the generated spec regions. `ds new --from-theme-file <path>`
  imports a prototype's own theme.
  `defineDesignSystemTheme(compiled, { fontBase, description })` resolves
  fonts from a package and shows the document's description.
- **Configurable runtime chrome.** `devtools.launcher` (`hidden`, `offset`,
  `tone`) and `demoBadge: { layer, avoid, phone }` in the manifest and
  `mountPrototype`; the compact phone badge keeps clear of headings and the
  bottom navigation.

### Fixed

- **No `workspace:*` in a consumer.** `generate`, `blueprint new --from-brief
  --generate`, `quick promote` and `new --from` write the installed version, and
  a remix keeps a consumer's own `workspace:` packages.
- **`showcase` in a consumer** copies the player build the npm package ships
  instead of running Vite on source that is not installed.

### Changed

- **Texuli 0.13.0.** Every Texuli dependency moves to 0.13.0, which ships
  the consumers' Texuli gaps: `ds check --render` in any workspace, product
  tokens (`extensions` → `--tx-ext-<name>`, carried by `ds use`), 1–8 chart
  colors, shadow shapes, timeline styling hooks, chart heading levels and one
  label dictionary. Compiled design-system hashes change (compiler version 2);
  documents stay valid. The `LayoutHost` initial delta grows to 3,972 B (cap
  4,080 B).
- **Labels in another language.** `mountPrototype({ i18n: { labels, locale } })`
  wraps the app in Texuli's `LabelsProvider`, so the toaster, DocApp's outline,
  block tones and every Texuli component speak the prototype's language.

### Not in this release

- Texuli 0.13.1 (registered icons, an editable code field, a theme-aware
  image pair, a grid avatar group) is still in progress; Protoyard adopts it in
  1.2.x. Decks do not pass a `designSystems` resolver to Texuli's deck stage
  yet (`ds use` paints them through the brand theme), and Protoyard's own kit
  strings are not mapped onto the label dictionary yet.

## [1.1.3] - 2026-11-03

### Fixed

- **`npm create protoyard` starter passes `validate`.** The scaffolder ran
  `protoyard new` before installing, so the starter's generated `AGENTS.md`
  and `docs/SPEC.md` regions still described the `blank` template and
  `validate starter` failed its spec check. It now refreshes them with
  `protoyard spec starter --write` after the install, and with `--no-install`
  the printed next steps include that command. `verify:packages` validates
  the starter in the pnpm and npm consumers.
- **Docs say the packages are on npm.** The README, AGENTS.md, PACKAGES.md
  and the gallery's features page no longer say "not on npm yet".

## [1.1.2] - 2026-11-03

### Changed

- **Texuli 0.12.3.** Every Texuli dependency moves to 0.12.3. Texuli 0.12.2
  and 0.12.3 have no package code change since 0.12.1.
- **Stricter release check.** The npm job installs npm 11.20.0 before
  publishing, and its last step fails unless every package shows the new
  version under its dist-tag with a provenance attestation. Tests guard the
  workflow against npm tokens, secrets, dist-tag moves and push or tag
  triggers.

## [1.1.1] - 2026-11-02

The first release published by CI, with npm Trusted Publishing and
provenance.

### Changed

- **Texuli 0.12.1.** Every Texuli dependency moves to 0.12.1, and the vendored
  Texuli agent skill to 0.3.13. Texuli 0.12.1 only adds `coverHeadingLevel`
  to the slide stage, which Protoyard doesn't need: pages and docs refuse
  inline decks.
- **Releases run in CI.** Merging a version bump into `main` is the release:
  after `ci` passes, `release.yml` publishes every package with Trusted
  Publishing and provenance, then tags the commit and creates the GitHub
  Release. Publishing retries transient failures, never publishes a version
  twice, and checks the registry at the end.
- **Faster CI.** Pull requests run in about five minutes, and so does a push to
  `main`: the pnpm and npm tarball-consumer checks now run in parallel.

### Fixed

- The Texuli gap register lists G48 to G85 (fixed in Texuli 0.6.0), and the
  docs no longer describe workarounds for G48 to G52.

## [1.1.0] - 2026-11-01

Protoyard on Texuli 0.12.0 from npm (PLAN_008), with Texuli's design systems,
documents, forms, sheets, canvas, motion and full theme library adopted where
they replace Protoyard code or add real value.

### Added

- **Design systems.** Create a Texuli design system from a brief or a few
  inputs (brand colors, fonts, shape, density, motion, contrast), or import any
  Protoyard theme. Then apply it to a prototype from Theme Studio's Design system
  panel, `protoyard ds new|validate|export|use`, or `protoyard mcp`
  (`ds_create`, `ds_validate`, `ds_export`, `ds_use`). Documents from agents or
  share links are validated as untrusted. The compiler loads only on demand.
- **Spreadsheets and an infinite canvas.** `@protoyard/views-ui/sheet`
  (formulas, totals, CSV download and import) and `@protoyard/views-ui/canvas`
  (frames, sticky notes, shapes, connectors, SVG export), each a lazy view that
  saves through a service and validates stored data as untrusted input.
  Blueprints gain `sheet` and `canvas` screen types; `@protoyard/views/scenarios`
  gains `generateSheetWorkbook` and `generateCanvasBoard`.
- **The `canvas-board-demo` prototype**: planning boards on the canvas, with
  owner and viewer personas and five scenarios (including 1,500 notes).
- **Three catalog blueprints** with sheet and canvas screens
  (home renovation, product discovery and lesson planning): 43 in all.
- **Doc editing and downloads.** Docs open in Texuli's `PageEditor` and download
  as Word, PDF or Markdown. Applied edits are saved per doc and world in the new
  `docEdits` store (content-kind database version 2) and survive a reload;
  "Reset to the original" removes them.
- **Blueprint motion.** An optional, closed `motion: { level }` on every kind
  caps every Texuli animation and a deck's own transitions.
- **Streamed drafts under `quick serve`.** A deck, page or doc paints the part of
  its file that has arrived while an agent is still writing it.
- **Every library theme by default**: 204 library themes (the 64-theme catalog
  and Texuli's expanded set) in the `theme` CLI, DevTools, Deck Studio, the
  player and generated-app settings, the gallery and every theme id.
- **Templates.** `fintech-dashboard` shows its transactions as a read-only
  spreadsheet with a net total and CSV download; `design-kit` has a Sketches
  section on the canvas.
- **Texuli agent tooling.** The vendored Texuli skill is `skill-v0.3.4`, and
  `docs/MCP.md` shows how to run `@texuli/mcp` as a companion server next to
  `protoyard mcp`.

### Changed

- **Texuli 0.12.0.** Every Texuli dependency is pinned to `0.12.0` from npm, and
  every `@protoyard/ui` component takes Texuli's uniform contract (`bind:ref`,
  rest attributes, caller handlers first). Additive props: `ref` and rest
  everywhere, `CommandPalette` `bind:open`, `FileDropzone` `id`,
  `TabItem.badgeLabel`.
- **Forms render through Texuli's `SchemaForm`**: generated entity forms, page
  and doc form blocks, and every SaaS kit form (sign-in, sign-up, password
  reset, magic link, phone, MFA, profile, preferences, invite, and the
  onboarding wizard as one multi-step form).
  Required and range errors now show before the service runs. Relation,
  persona, geo, avatar and file pickers are Texuli `custom` fields painted with
  Protoyard's controls.
- **Chart variables use Texuli's names**: `--tx-chart-1…8`,
  `--tx-chart-sequential-1…9` and `--tx-chart-diverging-1…9` (were
  `--tx-chart1`, `--tx-seq-N`, `--tx-div-N`). Update custom CSS that read the old
  names.
- **Motion comes from Texuli** (`MotionProvider`, the `motion` prop and the
  `--tx-motion-*` tokens); the prototype's reduced-motion setting turns every
  animation into an instant change.
- **Decks run on `@texuli/slides/stage-core`** with a prepared deck; the Debug
  for agents button is in the stage toolbar's host-tools group.
- **Kits on Texuli**: the notification inbox, analytics filters
  (`FilterBuilder`), cohort heat cells, the analytics dashboard grid and the AI
  message list's reading position and day rows.
- **Generated decks, pages and docs** record the content-kind storage schema
  (version 2); regenerating an older one upgrades it.
- **Bundles and budgets.** Each player kind page and single-file export carries
  only its own kind's code (a deck file no longer carries the doc editor and
  forms). Ceilings raised for earlier Texuli versions are lowered to measured
  + 5 % where the measurements allow; see `docs/PERFORMANCE.md`.

### Fixed

- A doc's Edit and Reset follow a persona switch without a reload.
- The sheet view's "Import CSV" accepts a second file after the first.
- Kanban column descriptions are back in the header, and cards settle in
  `items` order after a move; date fields report a typed short year as invalid;
  a read-only tags-and-email input stays focusable.

### Removed

- Most adapters for the Texuli gaps that 0.8 to 0.12 fixed (G53–G136); the few
  kept on purpose (for example `DataTable` on Texuli's table parts) say why in
  their package README. Also the charts-ui color map.

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

[Unreleased]: https://github.com/DailybotHQ/protoyard/compare/v1.1.3...HEAD
[1.1.3]: https://github.com/DailybotHQ/protoyard/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/DailybotHQ/protoyard/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/DailybotHQ/protoyard/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/DailybotHQ/protoyard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/DailybotHQ/protoyard/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/DailybotHQ/protoyard/releases/tag/v0.1.0
