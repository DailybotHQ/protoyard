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
