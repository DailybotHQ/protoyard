---
name: texuli-build-ui
description: Turn an idea into a Texuli interface offline — read the catalog (MCP or catalog.json), pick components by useWhen/dontUseWhen, compose, validate, render, iterate; recipes for dashboard, landing, form, slide, media story.
version: "0.3.4"
documentation_url: https://texuli.com/guides/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
metadata: {"openclaw":{"emoji":"▣","homepage":"https://texuli.com/guides/","requires":{"anyBins":["bash","git"]}}}
---

# Build any interface

Use this sub-skill **inside a Texuli monorepo checkout** when the developer
wants a **working interface** from a brief or idea: dashboard, landing page,
form flow, slide deck, media story, or a custom screen. You **compose**
existing Texuli pieces — you do not invent a parallel design system.

Everything below is **offline** (no network for catalog load, MCP, validation
or render). Installing packages or publishing needs explicit consent (see
[`../TRUST.md`](../TRUST.md)).

## When to use

| Intent | Stage |
| --- | --- |
| Discover what exists (`useWhen` / `dontUseWhen`) | **A** — catalog |
| Choose imports and layouts for a screen type | **B** — pick |
| Compose a tree (Svelte app or catalog tree) | **C** — compose |
| Validate (limits, grammar, hostile, AA, a11y) | **D** — validate |
| Render / preview / iterate | **E** — render |
| Follow a recipe (dashboard, landing, form, slide, media) | **F** — recipes |

| Prefer another skill when… | Go to |
| --- | --- |
| New primitive or catalog **authoring** | [`../contribute/SKILL.md`](../contribute/SKILL.md) |
| Theme / mode / AA gate only | [`../themes/SKILL.md`](../themes/SKILL.md) |
| Image, video, composition, export only | [`../media/SKILL.md`](../media/SKILL.md) |
| Validate, edit or paint an agent-written blueprint | [`../blueprints/SKILL.md`](../blueprints/SKILL.md) |

## Rules (always)

1. **Public imports only** — `texuli/button`, `@texuli/core/roving`,
   `@texuli/tokens/library`, `@texuli/catalog/render/renderer`. Never deep
   `src/internal` paths. Class helpers: `texuli/cx` (`cx`, `variants`). Never
   `clsx`, `tailwind-merge`, or `tailwind-variants`.
2. **Catalog guidance is law** — honour every entry’s `useWhen` and
   `dontUseWhen`. They must stay disjoint; do not use a component for a
   listed `dontUseWhen` case.
3. **Sink-free** — no `{@html}`, `eval`, `new Function`, or `innerHTML` on
   data. Links and media through `@texuli/core/url-policy`
   (`safeHref`, `safeImageSrc`, `safeMediaSrc`).
4. **Untrusted agent trees** — run
   `@texuli/catalog/render/limits` then `render/renderer` (tier `untrusted`
   by default). Host maps nodes to real components; never stringify HTML.
5. **A11y and contrast** — keyboard paths, landmarks, AA in light, dark and
   forced-colors. **WCAG 2.x only** (APCA out of scope).
6. **Logical CSS**, layers `tx.base` / `tx.components` (consumer classes win).
7. **No network** for this loop. Local CLI, MCP stdio, and `pnpm` scripts only.

## Loop (A → E)

Detail: [`references/loop.md`](references/loop.md). Short path:

```text
idea → catalog (MCP or catalog-*.json) → pick by useWhen
    → compose (Svelte screens or CatalogTreeInput)
    → validate (limits, grammar, unit, typecheck, biome, optional axe)
    → render / preview → iterate
```

### A — Read the catalog

```bash
# Content-addressed catalog file (offline)
pnpm exec tsx packages/catalog/src/build/cli.ts --json

# The same search through the texuli bin of @texuli/tools (or the MCP tool)
npx texuli catalog search --json '{"query":"card","limit":10}'
```

Over MCP (`npx -y @texuli/mcp`, see [`../router/hosts.md`](../router/hosts.md#mcp)),
call `catalog.search { "query": "card" }`, then `component.get { "id": "card" }`,
and check the tree with `blueprint.validate { "draft": {} }`.

TypeScript:

```ts
import { buildCatalog } from '@texuli/catalog/build';
import { discoverManifestGroups } from '@texuli/catalog/build/node';

const groups = await discoverManifestGroups();
const { catalog, hash } = await buildCatalog(groups);
// catalog.entries[].useWhen / dontUseWhen / props / tier
```

Or open the latest `packages/catalog/dist/catalog-<sha256>.json` after a build
(git-ignored; regenerate with the CLI above).

### B — Pick components

1. Match the brief to **ids** whose `useWhen` fits.
2. Reject any id whose `dontUseWhen` matches the brief.
3. Prefer **layouts** (`@texuli/catalog/manifests/layouts` / `texuli` layout
   hosts) for chrome; **forms** for inputs; **display** for chrome metrics;
   **content** for untrusted emit (Tier U).
4. Themes: default site/library theme or route to
   [`../themes/SKILL.md`](../themes/SKILL.md).

### C — Compose

**App screen (developer tier)** — Svelte 5 runes, public imports:

```svelte
<script lang="ts">
  import { Button } from 'texuli/button';
  import { Card, CardHeader, CardTitle, CardContent } from 'texuli/card';
</script>

<Card>
  <CardHeader><CardTitle level={2}>Title</CardTitle></CardHeader>
  <CardContent>
    <Button type="button">Save</Button>
  </CardContent>
</Card>
```

**Agent / untrusted tree** — data only, then host render:

```ts
import { renderCatalogTree } from '@texuli/catalog/render/renderer';
import { validateCatalogTreeLimits } from '@texuli/catalog/render/limits';

const tree = { id: 'card', props: { variant: 'elevated' }, children: [] };
const limits = validateCatalogTreeLimits(tree, { catalog: view });
if (!limits.ok) throw new Error(limits.diagnostics.map((d) => d.message).join('; '));
const { roots, diagnostics } = renderCatalogTree(tree, { catalog: view, tier: 'untrusted' });
```

### D — Validate

Commands: [`references/gates.md`](references/gates.md). Minimum after edits:

```bash
pnpm vitest run packages/texuli/tests/<family>.test.ts   # or catalog / app tests
pnpm --filter texuli typecheck                        # packages you touched
npx biome check <touched paths>
```

Untrusted trees: limits + renderer unit tests; optional hostile corpus
(`packages/catalog/tests/render-hostile.test.ts`).

### E — Render and iterate

- Preview: the website dev server (`pnpm dev`, Astro at
  `http://localhost:4321`; stop it with
  `pnpm --filter @texuli/website exec astro dev stop`), or the fixture app the
  visual and e2e suites serve (`tests/fixtures/app`).
- Agent trees: paint a validated draft with `@texuli/player` (see
  [`../blueprints/SKILL.md`](../blueprints/SKILL.md)) or try it in the
  site's `/builder/`.
- Visual baselines only when you **register** a new example id (see gates).
- Fix diagnostics, re-validate, stop when the brief’s acceptance is met.

## Recipes (F)

Full checklists: [`references/recipes.md`](references/recipes.md).

| Recipe | Primary packages |
| --- | --- |
| Dashboard | `texuli/card`, `texuli/stat`, layouts app shell, optional `@texuli/charts/*` / `@texuli/data/*` |
| Landing | layout page, `texuli/button`, display badges, media hero via media skill |
| Form flow | `texuli/input`, field, button, stepper; forms manifests |
| Slide / deck | Deck v2 from JSON or Markdown: `@texuli/deck` (model, markdown, authoring, templates; in development, on npm from `0.4.0`) presented by `@texuli/slides/stage` `DeckStage`, exported by `@texuli/slides/export`; 21 layout ids, `deck` CLI and MCP tool: [`references/decks.md`](references/decks.md). `@texuli/slides` `0.3.0` is the v1 model |
| Media story | [`../media/SKILL.md`](../media/SKILL.md) + content card |
| Drag and drop (lists, groups, boards, trees) | `@texuli/primitives/sortable`, `@texuli/data/board`, `@texuli/data/tree-view`; engine `@texuli/drag` (in development, on npm as `0.9.0`; `sortable` and the data drag migrations are new in `0.4.0`) |
| Workflow editor or diagram | `@texuli/workflows` editor, viewer, inspector, model, layout (in development, on npm as `0.9.0`) |
| Block document editor, reader, pages, export, collaboration | `@texuli/pages` (`editor`, `reader`, `paged`, `export`, `collab`, `host`) on `@texuli/document` (in development, both new in `0.7.0`); an agent writes documents as data: [`../blueprints/SKILL.md`](../blueprints/SKILL.md) stage **I** |
| Schema-driven form, infinite canvas, spreadsheet, dashboard | `@texuli/forms` (`SchemaForm`), `@texuli/canvas` (`editor`, `viewer`), `@texuli/sheets` (`view`), `@texuli/data/dashboard` (in development, all new in `0.8.0`); agents send them as `schema-form`, `canvas`, `spreadsheet` and `data-dashboard` nodes painted through the player's host seams: [`references/imports.md`](references/imports.md) |
| A whole stateful screen as JSON (an agent sends it) | [`../blueprints/SKILL.md`](../blueprints/SKILL.md) stage **G** |

## Offline gates for this skill pack

```bash
pnpm exec tsx scripts/check-skill.ts --write-sums
pnpm vitest run scripts/tests/skill.test.ts
./skills/texuli/setup.sh --verify
```

## Imports cheat sheet

See [`references/imports.md`](references/imports.md), including the APIs
new in `0.9.0` (design-system tokens and defaults, scoped portals, the
operations registry) and in `0.8.0` (not in `0.7.0`): `@texuli/forms`, `@texuli/canvas`,
`@texuli/sheets`, `@texuli/data/dashboard`, `@texuli/core/expression`,
`@texuli/core/data-source`, `@texuli/core/i18n`, `@texuli/tools/email`
and `@texuli/tools/print`, and the player's form, canvas and sheet hosts;
those new in `0.7.0` (not in `0.6.0`): `@texuli/document`, `@texuli/pages`, node
keys and documents in blueprints, `patchDocument`, the player's
`documentHost` and `@texuli/tools/document`; those new in `0.6.0`: the
`motion` prop and `MotionProvider`,
`@texuli/core/motion`, the one component contract (`bind:ref`, rest
attributes, composed handlers), `<Player stream>`, `DeckStageCore`,
`@texuli/core/markup` and `@texuli/core/zip`, and those new in `0.5.0`:
composer streaming and `onStop`, `DataGrid` paging, toast `onSettle`,
`TimeField`, date `today`, the light `Sparkline` and editor Markdown.

## Local references

- [`references/loop.md`](references/loop.md) — catalog → pick → compose → validate → render
- [`references/recipes.md`](references/recipes.md) — seven interface recipes (drag and workflows included)
- [`references/decks.md`](references/decks.md) — deck generator: JSON, Markdown, `DeckStage`, print and PPTX, agent tools, the 21 layouts
- [`references/gates.md`](references/gates.md) — offline commands
- [`references/imports.md`](references/imports.md) — public import map
- Router: [`../router/routes.md`](../router/routes.md)
