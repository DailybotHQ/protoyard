# Texuli packages and layers

Every workspace package, its layer and its public entries. Layers point down
only: a package imports only from lower layers (the repository's
`scripts/check-layers.ts` enforces it). **19 of these 20 packages are on npm
as `0.4.0`** (published by CI with provenance; `latest` and `next` both
point to it; pre-1.0, not stable; the workspace packages stay
`private: true`), so install them plainly (`pnpm add texuli`), import them in
a Texuli workspace, or copy components with the CLI
([`../components/SKILL.md`](../components/SKILL.md)). The exception is
`@texuli/editor` (version `0.0.0`): in development and not on npm, so only
a Texuli workspace can import it. `@texuli/deck` (the deck engine, first
published in `0.4.0`), `@texuli/drag` and `@texuli/workflows` are in
development and on npm as `0.4.0`. Everything marked "new in `0.4.0`"
below (spec 0.4.0, the new catalog groups, `sortable`, the data drag
migrations, the player's interaction, the `@texuli/slides` v2 stage on
`@texuli/deck`) is not in `0.3.0`. `@texuli/examples` is a
private registry for tests and the site, not a library, and is left out.

This table is derived from each `packages/*/package.json` `exports` map and the
`LAYERS` map in `scripts/check-layers.ts`. Entries after the root are sorted;
long lists are cut after 14, so read the package's `package.json` for the
rest.

| Layer | Package | What it is | Public entries |
| --- | --- | --- | --- |
| L0 | `@texuli/core` | Texels: framework-free behavior and policy that every Texuli component is built from. | `@texuli/core`, `@texuli/core/announcer`, `@texuli/core/controllable`, `@texuli/core/dir-locale`, `@texuli/core/dismiss`, `@texuli/core/editor-history`, `@texuli/core/editor-keymap`, `@texuli/core/editor-markdown`, `@texuli/core/editor-model`, `@texuli/core/editor-transforms`, `@texuli/core/env`, `@texuli/core/focus-scope`, `@texuli/core/form-bridge`, `@texuli/core/ids`, … (28 entries) |
| L0 | `@texuli/date` | Dependency-free Gregorian calendar dates (`CalendarDate`, month and week helpers) behind the calendar and date pickers; first published in `0.3.0`. | `@texuli/date`, `@texuli/date/calendar` |
| L0 | `@texuli/deck` | Framework-free, dependency-free deck engine: deck model v2 from JSON or Markdown, the 21 layout ids, steps, navigation and hash routing, presenter protocol, lint, patch and templates. **In development: on npm as `0.4.0` (first publication).** | `@texuli/deck`, `@texuli/deck/authoring`, `@texuli/deck/engine`, `@texuli/deck/markdown`, `@texuli/deck/math`, `@texuli/deck/model`, `@texuli/deck/schema`, `@texuli/deck/templates` |
| L0 | `@texuli/drag` | Framework-free drag engine: sortable lists and groups, trees, swap, multi-drag, gesture, spatial canvas, graph editing, localized `DragMessages`. **In development: on npm as `0.4.0`.** | `@texuli/drag`, `@texuli/drag/auto-scroll`, `@texuli/drag/collision`, `@texuli/drag/gesture`, `@texuli/drag/graph`, `@texuli/drag/messages`, `@texuli/drag/modifiers`, `@texuli/drag/sortable`, `@texuli/drag/spatial`, `@texuli/drag/testing` |
| L0 | `@texuli/spec` | The schema-first blueprint contract: JSON schemas, the catalog vocabulary, deterministic TypeScript and Kotlin projections, and the conformance harness. Spec 0.4.0 (spec 0.3.0's state, bindings, closed actions, `reorder`, workflow graphs and state surface, plus deck model v2) is new in `0.4.0`; `0.3.0` carried spec 0.2.0 and only the root and `codegen`. | `@texuli/spec`, `@texuli/spec/codegen`, `@texuli/spec/migrate`, `@texuli/spec/surface`, `@texuli/spec/workflow` |
| L1 | `@texuli/primitives` | Owned, headless Svelte 5 primitives built on the texels (42, including `sortable` on `@texuli/drag`, new in `0.4.0`). | `@texuli/primitives`, `@texuli/primitives/accordion`, `@texuli/primitives/alert-dialog`, `@texuli/primitives/avatar`, `@texuli/primitives/calendar`, `@texuli/primitives/checkbox`, `@texuli/primitives/collapsible`, `@texuli/primitives/color-picker`, `@texuli/primitives/combobox`, `@texuli/primitives/command`, `@texuli/primitives/context-menu`, `@texuli/primitives/date-field`, `@texuli/primitives/date-picker`, `@texuli/primitives/dialog`, … (43 entries) |
| L2 | `@texuli/tokens` | The OKLCH theme engine, the --tx-* token contract, 200+ themes and compiled CSS. | `@texuli/tokens`, `@texuli/tokens/aa-gate`, `@texuli/tokens/aa-gate/components`, `@texuli/tokens/base.css`, `@texuli/tokens/build`, `@texuli/tokens/contract`, `@texuli/tokens/css`, `@texuli/tokens/forced-colors`, `@texuli/tokens/forced-colors.css`, `@texuli/tokens/generator`, `@texuli/tokens/library`, `@texuli/tokens/library-expand`, `@texuli/tokens/modes`, `@texuli/tokens/no-flash`, … (18 entries) |
| L3 | `texuli` | Styled Texuli components, layouts and shells. | `texuli`, `texuli/alert`, `texuli/avatar`, `texuli/badge`, `texuli/button`, `texuli/card`, `texuli/carousel`, `texuli/choice`, `texuli/combobox`, `texuli/command`, `texuli/cx`, `texuli/date`, `texuli/dialog`, `texuli/empty`, … (70 entries) |
| L4 | `@texuli/charts` | Chart math and every chart family, one lazy subpath per family. | `@texuli/charts`, `@texuli/charts/annotations`, `@texuli/charts/axis`, `@texuli/charts/calendar`, `@texuli/charts/canvas`, `@texuli/charts/cartesian`, `@texuli/charts/colors`, `@texuli/charts/compact`, `@texuli/charts/flow`, `@texuli/charts/geo`, `@texuli/charts/histogram`, `@texuli/charts/interaction`, `@texuli/charts/math`, `@texuli/charts/math/color`, … (26 entries) |
| L4 | `@texuli/chat` | Chat interfaces: thread, message list, composer and typing indicator, generic for people and agents. | `@texuli/chat` |
| L4 | `@texuli/data` | Data views: grid, tree, board, calendar, timeline, map, activity and files. | `@texuli/data`, `@texuli/data/activity`, `@texuli/data/activity/engine`, `@texuli/data/board`, `@texuli/data/board/engine`, `@texuli/data/calendar`, `@texuli/data/calendar/view`, `@texuli/data/files`, `@texuli/data/files/engine`, `@texuli/data/geo`, `@texuli/data/grid`, `@texuli/data/grid-columns`, `@texuli/data/grid-core`, `@texuli/data/grid-editing`, … (21 entries) |
| L4 | `@texuli/editor` | Rich text editor surface on the `@texuli/core` editor texels: owned model, transforms, history and a sink-free Svelte 5 rendering. **In development: `0.0.0`, not published to npm.** | `@texuli/editor`, `@texuli/editor/controller`, `@texuli/editor/editor`, `@texuli/editor/link-dialog`, `@texuli/editor/paste`, `@texuli/editor/toolbar` |
| L4 | `@texuli/media` | Media: images, galleries, video, audio and layered compositions. | `@texuli/media`, `@texuli/media/animation`, `@texuli/media/animation/player`, `@texuli/media/audio`, `@texuli/media/captions`, `@texuli/media/composition-canvas`, `@texuli/media/composition-canvas/draw`, `@texuli/media/composition-canvas/render`, `@texuli/media/composition-model`, `@texuli/media/composition-svg`, `@texuli/media/composition-v2`, `@texuli/media/export`, `@texuli/media/export/ui`, `@texuli/media/gallery`, … (23 entries) |
| L4 | `@texuli/workflows` | Accessible workflow graph editor and viewer: model, layered layout, spec adapter, editor, viewer, inspector. **In development: on npm as `0.4.0`.** | `@texuli/workflows`, `@texuli/workflows/editor`, `@texuli/workflows/inspector`, `@texuli/workflows/layout`, `@texuli/workflows/model`, `@texuli/workflows/spec-adapter`, `@texuli/workflows/viewer` |
| L5 | `@texuli/blocks` | Content blocks: closed vocabulary, untrusted guard, formula AST and catalog metadata for pages, documents and slides. | `@texuli/blocks`, `@texuli/blocks/code`, `@texuli/blocks/code/engine`, `@texuli/blocks/code/renderers`, `@texuli/blocks/code/tokenizer`, `@texuli/blocks/core`, `@texuli/blocks/data`, `@texuli/blocks/data/engine`, `@texuli/blocks/data/renderers`, `@texuli/blocks/diagram`, `@texuli/blocks/diagram/engine`, `@texuli/blocks/diagram/renderers`, `@texuli/blocks/embed`, `@texuli/blocks/embed/engine`, … (32 entries) |
| L6 | `@texuli/catalog` | The agent catalog (158 ids, 66 agent-emittable; the `chat`, `composition`, `data`, `state` and `workflows` groups are new in `0.4.0`) and the renderer with no HTML sinks. | `@texuli/catalog`, `@texuli/catalog/build`, `@texuli/catalog/build/node`, `@texuli/catalog/edit`, `@texuli/catalog/envelope`, `@texuli/catalog/manifest`, `@texuli/catalog/manifests/chat`, `@texuli/catalog/manifests/composition`, `@texuli/catalog/manifests/content`, `@texuli/catalog/manifests/data`, `@texuli/catalog/manifests/display`, `@texuli/catalog/manifests/forms`, `@texuli/catalog/manifests/layouts`, `@texuli/catalog/manifests/overlays`, … (26 entries) |
| L7 | `@texuli/player` | Svelte paint runtime for validated Texuli catalog blueprints: every emittable id, spec 0.3.0 state and closed actions, one shared drag scope (new in `0.4.0`). | `@texuli/player`, `@texuli/player/styles.css` |
| L8 | `@texuli/astro` | Astro integration, content layouts and Svelte islands for Texuli sites. | `@texuli/astro`, `@texuli/astro/content`, `@texuli/astro/integration`, `@texuli/astro/layouts/ContentLayout`, `@texuli/astro/sections/Hero`, `@texuli/astro/sections/Section`, `@texuli/astro/site`, `@texuli/astro/styles.css` |
| L8 | `@texuli/slides` | The presentation stage on `@texuli/deck`: `DeckStage` (canvas fit, chrome, overview, presenter, deep links), the default component registry, print and PPTX export; the v1 model, grammar and templates remain. The v2 stage is new in `0.4.0`; `0.3.0` ships the v1 stage at L7. | `@texuli/slides`, `@texuli/slides/components`, `@texuli/slides/export`, `@texuli/slides/grammar`, `@texuli/slides/layouts`, `@texuli/slides/model`, `@texuli/slides/stage`, `@texuli/slides/styles.css`, `@texuli/slides/templates` |
| L8 | `@texuli/tools` | Agent and developer tools: the copy-in CLI, the MCP server, custom elements, adapters and the golden set. | `@texuli/tools`, `@texuli/tools/a2ui`, `@texuli/tools/cli-add`, `@texuli/tools/cli-init`, `@texuli/tools/cli-update`, `@texuli/tools/elements`, `@texuli/tools/golden`, `@texuli/tools/llms` |

Apps that consume the packages (not layers):
- `apps/website`: texuli.com, built with Astro 7 and Svelte islands. It
  deploys from `main` to Cloudflare Pages. It hosts the playground, the
  blueprint builder (`/builder/`) and the agent chat (`/agent-chat/`).
- `apps/agent` (`@texuli/agent`): the agent service. It is not deployed and
  has no real model provider (see [`../blueprints/SKILL.md`](../blueprints/SKILL.md)).

`native/` is a self-contained Gradle Kotlin Multiplatform build for the native
target, outside the pnpm workspace. It is in development and consumes the
generated Kotlin from `@texuli/spec`; its `./gradlew check` is recorded
passing in `native/README.md` (build health baseline, 2026-10-25). Nothing is
published to Maven Central.

## Entries checked by the skill gate

`pnpm check:skill` checks every import in this block against the real
`exports`, so the index cannot point at an entry that does not exist.

```ts
import { validateBlueprint } from '@texuli/spec';
import { buildSpec } from '@texuli/spec/codegen';
import { createRovingFocus } from '@texuli/core/roving';
import { safeHref, safeImageSrc, safeMediaSrc } from '@texuli/core/url-policy';
import { Button } from 'texuli/button';
import { cx, variants } from 'texuli/cx';
import { ChatThread, parseMessageText } from '@texuli/chat';
import { GenerationRequestPlaceholder, parseMediaGenerationRequest } from '@texuli/media/generator-slot';
import { safeParseBlock } from '@texuli/blocks/core';
import { validateDraft, draftCommitGate } from '@texuli/catalog/validate';
import { createEnvelope, activateEnvelope } from '@texuli/catalog/envelope';
import { createEditHistory } from '@texuli/catalog/edit';
import { createPlayer } from '@texuli/catalog/player';
import { renderCatalogFromBuild } from '@texuli/catalog/render/renderer';
import { Player } from '@texuli/player';
import '@texuli/player/styles.css';
import { parseDeck } from '@texuli/slides/model';
import { toDeckGrammar } from '@texuli/slides/grammar';
import { DeckStage } from '@texuli/slides/stage';
import { exportDeckPptx, requestDeckPdf } from '@texuli/slides/export';
import { createDeckFromTemplate } from '@texuli/slides/templates';
import { DECK_LAYOUTS, loadUntrustedDeck, parseDeck as parseDeckV2 } from '@texuli/deck/model';
import { deckToMarkdown, parseDeckMarkdown } from '@texuli/deck/markdown';
import { lintDeck } from '@texuli/deck/authoring';
import { createDeckTemplate } from '@texuli/deck/templates';
import { prepareDeck } from '@texuli/slides/stage';
import { DeckPrintView, planDeckPrint } from '@texuli/slides/export';
import { RichTextEditor } from '@texuli/editor/editor';
import { fromMarkdown, toMarkdown } from '@texuli/core/editor-markdown';
import { texuli } from '@texuli/astro';
import { defineSite, sitePageMeta, siteSitemap } from '@texuli/astro/site';
import { GOLDEN_TASKS, scoreGoldenTree } from '@texuli/tools/golden';
import { applyMove, createSortableModel, planMove } from '@texuli/drag/sortable';
import { resolveDragMessages } from '@texuli/drag/messages';
import { Sortable } from '@texuli/primitives/sortable';
import { WorkflowEditor } from '@texuli/workflows/editor';
import { WorkflowViewer } from '@texuli/workflows/viewer';
import { WorkflowInspector } from '@texuli/workflows/inspector';
import { applyWorkflowOps, createWorkflow, defineNodeTypes } from '@texuli/workflows/model';
import { layoutMoves, layoutWorkflow } from '@texuli/workflows/layout';
import { fromSpecWorkflow, toSpecWorkflow } from '@texuli/workflows/spec-adapter';
import { migrateBlueprint } from '@texuli/spec/migrate';
import { validateWorkflowGraph } from '@texuli/spec/workflow';
import { checkStateSurface, surfaceInputs } from '@texuli/spec/surface';
import { CalendarDate } from '@texuli/date';
```
