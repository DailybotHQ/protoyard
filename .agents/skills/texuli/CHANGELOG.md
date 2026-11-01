# Changelog

All notable changes to the Texuli skill pack (`skills/texuli/`) are
documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the pack
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html); before
1.0.0 a breaking change bumps the minor.

Skill releases are tagged `skill-vX.Y.Z`, separately from the npm packages
(tagged `vX.Y.Z`). The skill release workflow writes the version sections
below: do not hand-edit them or the `version:` fields of any `SKILL.md`.
The one hand-written part is the `## [Unreleased]` block: the next release
folds its body into its own section, under the list of commits that touched
the pack, and leaves an empty `## [Unreleased]` block on top.

## [Unreleased]

## [0.3.8] — 2026-11-01

### Changes

- chore(skill): packages on npm at 0.11.2

- The packages are on npm in the 0.11 line, every one at `0.11.2`, a patch
  (a square theme radius keeps `0px`, so radius `calc()` steps stay valid; a
  password field may take `autocomplete` `off`). The skill, install and
  router references read `0.11.2`; installs still pin `^0.11.0`.

## [0.3.7] — 2026-11-01

### Changes

- chore(skill): packages on npm at 0.11.1

- The packages are on npm in the 0.11 line, every one at `0.11.1`, a patch
  (forms: concurrent `next()` calls share one move; `applyDesignSystem`
  refuses a variant on a base compile). The skill, install and router
  references and the in-development packages read `0.11.1`; installs still
  pin `^0.11.0`, and the "new in `0.11.0`" notes stay.

## [0.3.6] — 2026-10-31

### Changes

- chore(skill): the skill pack says 0.11.0 is published - T-final-review of PLAN_011_mcp_and_design_systems
- chore(skill): the skill pack names the 0.10.1 patch releases - T-gaps-125-127 of PLAN_011_mcp_and_design_systems

- The packages are on npm in the 0.11 line, every one at `0.11.0`. The
  router, components, install and build-ui references say so and pin
  `^0.11.0`; the in-development packages read "on npm as `0.11.0`".
- `router/packages.md` gains a "New in `0.11.0`" paragraph, and it and
  `build-ui/references/imports.md` list the `0.11.0` entries
  (`@texuli/tokens/library-ids`,
  `@texuli/tokens/design-system/compile-core`,
  `@texuli/player/design-system-core`, `loadDesignSystemCompilerCore`).
- `upgrade/SKILL.md` gains "0.10 → 0.11: breaking changes": the
  `stage-core`, `export-core`, `reader-core` and `host-core` loader
  migrations, single-mode design systems that never throw,
  `design-system-refused` from the player and pages cores, and
  `DesignSystemProvider`'s `onapplyerror`.

## [0.3.5] — 2026-10-31

### Changes

- docs(docs): apply is 2,040 B after the shared value check; ds.save path codes in the skill - T-final-review of PLAN_011_mcp_and_design_systems
- chore(skill): the skill pack says 0.10.0 is published - T-release-0100 of PLAN_011_mcp_and_design_systems
- docs(skill): a host loads base.css or system.css; system.css in the tokens router entry - T-gaps-107-110 of PLAN_011_mcp_and_design_systems
- docs(skill): the 0.8 tool names and the tree style key are removed in 0.10.0 - T-release-0100 of PLAN_011_mcp_and_design_systems
- docs(skill): a design-systems sub-skill with the codes and MCP references - T-ds-docs-skill of PLAN_011_mcp_and_design_systems
- docs(skill): blueprint.theme and the ds operations in the blueprints skill; ds.save is local only - T-ds-agent-tools of PLAN_011_mcp_and_design_systems
- docs(skill): the blueprints skill explains designSystem (validate with checkDesignSystem, paint with designSystems) - T-ds-blueprint of PLAN_011_mcp_and_design_systems

- New `design-systems/SKILL.md` sub-skill, with `references/codes.md`
  (every design-system code and its fix) and `references/mcp.md` (the
  `ds.*` tools, `blueprint.theme`, the `create-design-system` prompt and
  `texuli://design-system/{id}`): author, validate and repair, apply to a
  blueprint and export a design system, released in `0.10.0`. The router
  and `router/routes.md` route to it.
- `themes/SKILL.md` and `upgrade/SKILL.md`: the seven 0.8 MCP tool names
  and the tree block's `style` key are removed in `0.10.0`; a call or a
  block that uses them is refused with the name to use instead.
- `blueprints/SKILL.md` gains "K — Design systems (spec 0.10.0)": the
  envelope's `designSystem` (`ref` or `inline`), `validateDraft`'s
  `checkDesignSystem` and the player's `designSystems` resolver, new in
  `0.10.0`.
- The packages move to `0.10.0`: all 26 published packages on npm in the
  0.10 line. The router, components, install and build-ui references say
  "on npm as `0.10.0`" and pin `^0.10.0`; the "0.10.0 is in development"
  install note is gone, and the design-systems sub-skill is no longer
  marked in development.
- `router/packages.md` gains a "New in `0.10.0`" paragraph, marks the new
  entries (`@texuli/spec/design-system`, the `@texuli/tokens/design-system/*`
  subpaths, `texuli/design-system`, `@texuli/player/design-system`,
  `@texuli/astro/design-system`, `@texuli/tools/ds-check`,
  `@texuli/slides/export-core`, the `@texuli/pages` `*-core` entries,
  `@texuli/forms/controls`) and checks their imports; `router/hosts.md`
  names the `ds.*` tools on both MCP servers.
- `build-ui/references/imports.md` gains a "New in 0.10.0" table (design
  systems: validate, compile, apply, import and export, blueprints, CI
  checks; `DeckPrintViewCore`, the pages core entries with `loadPlayer`,
  `SCHEMA_FORM_CONTROLS`).
- `upgrade/SKILL.md` lists the `0.10.0` breaking changes an app checks
  before moving from `^0.9.0` (the seven 0.8 MCP tool aliases and the tree
  block's `style` removed, spec 0.10.0 stamps, the forms "None" choice and
  lazy controls, the lazy sheets cell editor, the pages core entries'
  `loadPlayer`). The `0.8.0` to `0.5.0` sections move to
  `upgrade/references/packages.md` to keep `upgrade/SKILL.md` within its
  budget.

## [0.3.4] — 2026-10-30

### Changes

- chore(skill): the skill pack says 0.9.0 is published
- docs(skill): add the MCP hosts section and cite registry operations and published bins

- The packages move to `0.9.0`: 26 published packages, `@texuli/mcp`
  published for the first time. The router, components, install and
  build-ui references say "on npm as `0.9.0`" and pin `^0.9.0`; the
  "0.9.0 is in development" install note is gone.
- `router/packages.md` gains a "New in `0.9.0`" paragraph and marks the new
  entries (`@texuli/tools/ops`, `@texuli/tools/mcp`,
  `@texuli/catalog/manifests/all`, the token contract v2 subpaths of
  `@texuli/tokens`, `texuli/defaults`) and an L9 row for `@texuli/mcp`;
  `router/hosts.md` states that both MCP servers are live from `0.9.0`.
- `build-ui/references/imports.md` gains a "New in 0.9.0" table (component
  and system tokens on a scope, `setDesignDefaults`, scoped portals, the
  chart time axis, keyboard rows in table grids, `useFieldLabel`,
  `composeHandlers`, the operations registry).
- `upgrade/SKILL.md` lists the `0.9.0` breaking changes an app checks
  before moving from `^0.8.0` (spec 0.9.0 stamps, the new catalog hash, the
  MCP tool aliases deprecated until `0.10.0` and `-32600` before
  `initialize`, token contract v2, the `aria-disabled` pending Button,
  `aria-invalid` on date controls, the tree block `variant`).

## [0.3.3] — 2026-10-30

### Changes

- chore(deps): patch releases for G86 (data 0.8.1 and its exact-pin dependents)
- fix(data): load list motion lazily, release @texuli/data 0.8.1

## [0.3.2] — 2026-10-30

### Changes

- chore(slides): release @texuli/slides 0.8.1 with the trust badge row fix

## [0.3.1] — 2026-10-30

### Changes

- chore(deps): release 0.8.0 of all 25 packages, @texuli/forms, @texuli/canvas and @texuli/sheets for the first time

- The packages move to `0.8.0`: 25 published packages, `@texuli/forms`,
  `@texuli/canvas` and `@texuli/sheets` published for the first time. The
  router, components, build-ui and recipes say "on npm as `0.8.0`" and pin
  `^0.8.0`; `build-ui/references/imports.md` gains a "New in 0.8.0" table
  (forms, the canvas, sheets, dashboards, host data sources, the expression
  language, the message catalog, email and PDF, and the player's form,
  canvas and sheet hosts), the build-ui table gains a forms, canvas, sheets
  and dashboard row, the package index lists `@texuli/forms` and
  `@texuli/canvas` (L4) and `@texuli/sheets` (L5) and marks spec 0.8.0 and
  the new subpaths as new in `0.8.0` (and the deck, drag, editor and
  workflows rows name `0.8.0` instead of `0.6.0`), and the layer map lists
  the three packages.
- `upgrade/SKILL.md` lists the `0.8.0` breaking changes an app checks
  before moving from `^0.7.0` (spec 0.8.0 stamps, the new catalog hash,
  `aria-required` only on supporting roles, labels from one catalog).
- `blueprints/SKILL.md` gains stage J: forms, canvases, sheets, dashboards
  and data sources as agent data (spec 0.8.0), refused without the host's
  check.

## [0.3.0] — 2026-10-29

### Changes

- chore(deps): release 0.7.0 of all 22 packages, @texuli/document and @texuli/pages for the first time
- feat(catalog): documents as agent data — a document catalog id, host-validated documents, bounded document patches addressed by node key, a player document host, and texuli document CLI and MCP tools (spec 0.7.0)

## [0.2.5] — 2026-10-29

### Changes

- chore(deps): release 0.6.0 of all 20 packages

### Content

- The packages move to `0.7.0`: 22 published packages, `@texuli/document`
  and `@texuli/pages` published for the first time. The router, components,
  build-ui and blueprints references say "on npm as `0.7.0`" and pin
  `^0.7.0`; `build-ui/references/imports.md` gains a "New in 0.7.0" table
  and a block documents row (`@texuli/pages` editor, reader, paged view,
  export, collaboration and host on the `@texuli/document` engine), the
  build-ui recipes name the document editor, the package index lists
  `@texuli/document` (L1) and `@texuli/pages` (L8) with their entries and
  marks spec 0.7.0, the `document` id, `patchDocument`, the player's
  `documentHost` and `@texuli/tools/document` as new in `0.7.0`, and the
  layer map drops "in the repository only".
- `upgrade/SKILL.md` lists the `0.7.0` breaking changes an app checks
  before moving from `^0.6.0` (spec 0.7.0 stamps, the new catalog hash,
  `patchDocument` in `EditOp`).
- Documents for agents (spec 0.7.0, new in `0.7.0`): `blueprints/SKILL.md` gains stage I (a `document` node whose
  `doc` is a Texuli document, `checkDocument` and the player's
  `documentHost` from `@texuli/pages/host`, `patchDocument` edits with a
  bounded RFC 6902 patch, node keys) and stage C names `patchDocument`;
  the new `blueprints/references/documents.md` has an example, the patch
  shape and the document commands of the `texuli` CLI.
- The packages move to `0.6.0`: the same 20 published packages as `0.5.0`;
  `@texuli/document` and `@texuli/pages` stay in the repository only (not
  on npm, first release planned for `0.7.0`). `0.6.0` ships PLAN_010 so
  far: `build-ui/references/imports.md` gains a "New in 0.6.0" table (the
  `motion` prop and `MotionProvider`, `@texuli/core/motion` and its
  springs, the motion tokens, the one component API contract,
  `<Player stream>` and `validateStreamNode`, spec 0.6.0 motion,
  `DeckStageCore`, prepared decks, `@texuli/core/markup` and
  `@texuli/core/zip`, editor inline extensions and the G48 to G85
  additions); the package index marks the new subpaths, spec 0.6.0 and the
  streaming player as new in `0.6.0`; `blueprints/SKILL.md` gains stage H
  (motion as data and streaming) and states the agent service's provider
  adapters (tested on recorded bytes, never called, not deployed); the
  layer map lists `@texuli/document` and `@texuli/pages`. The router,
  components, blueprints and build-ui references say "on npm as `0.6.0`"
  and pin `^0.6.0`.
- `upgrade/SKILL.md` lists the `0.6.0` breaking changes an app checks
  before moving from `^0.5.0` (Field ids on the focusable control,
  `InputGroup` attributes, caller handlers on more parts, avatar initials,
  four-digit years, reduced motion at `0s`, motion instead of CSS keyframes,
  the empty `Toaster`, chat day separators, widened filter operators, spec
  0.6.0 stamps).

## [0.2.4] — 2026-10-29

### Changes

- chore(deps): release 0.5.0 of all 20 packages, @texuli/editor for the first time
- docs: 0.5.0 release notes with every closed Protoyard gap, the 0.4.0 drag helper correction, new subpaths and the skill

### Content

- The packages move to `0.5.0`: all 20 packable packages, including the
  first publication of `@texuli/editor`. `0.5.0` ships PLAN_009 (the
  Protoyard adoption gaps): `build-ui/references/imports.md` gains a "New in
  0.5.0" table (composer `streaming` and `onStop`, message actions and
  inline edit, `DataGrid` paging and snippets, toast `onSettle`,
  `TimeField`, date pickers' `today`, `@texuli/charts/sparkline-lite`,
  `@texuli/editor/markdown`, the filter builder, notification inbox and
  cohort table, `texuli/layouts/content`), and the package index marks
  those entries, spec 0.5.0 and the 162-id catalog as new in `0.5.0`. The
  router, components, blueprints and build-ui references say "on npm as
  `0.5.0`" and pin `^0.5.0`.
- `upgrade/SKILL.md` lists the `0.5.0` breaking changes an app checks
  before moving from `^0.4.0` (numeric and file inputs, composed caller
  handlers, the `Tag` remove label, toast timers, the lazy `DeckStage`
  defaults, wider TOC levels, camelCase callbacks).

## [0.2.3] — 2026-10-28

### Changes

- chore(deps): release 0.4.0 of all 19 packages, @texuli/deck for the first time

## [0.2.2] — 2026-10-28

### Changes

- docs: @texuli/drag and @texuli/workflows are on npm as 0.3.0

### Content

- The packages move to `0.4.0`: all 19 packable packages, including the
  first publication of `@texuli/deck`. `0.4.0` ships PLAN_007
  (`@texuli/primitives/sortable`, the data drag migrations, spec 0.3.0, the
  player's interaction) and PLAN_008 (`@texuli/deck`, the `@texuli/slides`
  v2 stage with its `components` and `layouts` subpaths, spec 0.4.0, the
  deck CLI and MCP tool). The router, components, blueprints and build-ui
  references say "on npm as `0.4.0`" and pin `^0.4.0`.

## [0.2.1] — 2026-10-28

### Changes

- docs: @texuli/deck and the v2 slides stage, repository docs and the skill's deck recipes

### Content

- The deck generator: a new `build-ui/references/decks.md` with recipes for
  a deck from JSON (model v2: `formatVersion: 2`, `meta`, `style`, layout,
  free and component slides, validated with `parseDeck` and
  `loadUntrustedDeck`), a deck from Markdown (frontmatter, `---` and `--`,
  `Note:`, `.slide` and `.element` comments, `layout=` with `:::` regions,
  `::: component` fences, code steps, `$$` math), presenting with
  `DeckStage`, print and PPTX export, and the `deck` CLI commands and MCP
  tool; plus the 21 layout ids with their `useWhen` guidance.
- The router, the route map, the package index and the layer map know
  `@texuli/deck` (L0) and the `@texuli/slides` stage at L8, marked in
  development and not on npm; npm `@texuli/slides` `0.3.0` stays the v1
  deck model, and spec 0.4.0 is in the repository only.

## [0.2.0] — 2026-10-28

### Changes

- fix(skill): check option values with need_value instead of A && B || C (shellcheck SC2015)
- docs(skill): teach the Texuli skill drag, workflows and interactive JSON
- feat(skill): publish the Texuli skill to the standard of the reference skills
- chore(deps): release 0.3.0 of all 16 packages, @texuli/date for the first time
- docs: 0.2.0 is the current pre-1.0 release; plain installs in every README
- docs: latest tracks the newest preview until 1.0.0; name 0.1.0-next.3
- docs: name 0.1.0-next.2 as the npm preview across docs, site copy and skill
- docs(skill): refresh the texuli skill pack for the current packages and test layout
- fix: final-review website, docs, tests and skill findings (PLAN_006 T-100)
- docs: honesty sweep — state the npm preview and the deploy everywhere (PLAN_006 T-96)
- feat(slides): add fullscreen, a linked presenter screen and slot masters
- feat(slides): play reveal steps (fragments) on the stage
- feat: first version of Texuli

### Content

- Drag and drop: `@texuli/drag` (the framework-free engine) and
  `@texuli/primitives/sortable`, with the shared accessibility and i18n
  contract; build-ui recipes for sortable lists and a workflow editor.
- `@texuli/workflows`: editor, viewer, inspector, model, layout and the spec
  adapter, marked in development and not on npm.
- Blueprints stage G: spec 0.3.0 interaction as data (envelope `state` and
  `flow`, `$state` and `$data` bindings, the closed actions, `on`, `reorder`,
  `workflow-graph`, migrations and the state surface rules), with a
  validated example in `blueprints/references/interaction.md`.
- The package index lists `@texuli/drag`, `@texuli/workflows`, the new spec
  and catalog subpaths and the 158-id catalog, and says what is unreleased.
- Evals: five `interactive` scenarios (sortable lists, a workflow editor,
  stateful JSON with `reorder`, an editable `workflow-graph`, the lego
  composition).

### Publishing

- The pack is released on its own tag namespace, `skill-vX.Y.Z`, with a
  `texuli-skill-<version>.tar.gz` archive and a release `SHA256SUMS` that
  covers the archive and every file of the pack.
- `metadata` is single-line JSON in every `SKILL.md`; names stay within 64
  characters, descriptions within 1024, and every `SKILL.md` and entry bundle
  within a byte budget (`scripts/check-skill.ts`).
- New `upgrade` sub-skill: a read-only check of the latest skill tag, then,
  after explicit consent, a pinned and verified `setup.sh --replace`.
- `TRUST.md` states the provenance model: releases are checksummed, not
  signed, and only the release's own `SHA256SUMS` is independent of the
  files it describes.
