# @protoyard/blocks-ui

Svelte 5 renderers for Protoyard's shared content blocks
([ADR-037](../../docs/DECISIONS.md)), the UI half of
[`@protoyard/blocks`](../blocks/README.md). Decks, pages and docs, at both
levels (the player and generated prototypes), render blocks with these same
components.

> **Status:** the root dispatcher, host context and **structure** family
> (timeline, steps, comparison, cards, icon, CTA, columns) are implemented.
> Other family subpaths are filled by the PLAN_005 tasks named in the table.
> **Status:** the root dispatcher, the host context and the `./code` and
> `./diagram` families are implemented. The other family subpaths are filled
> by the PLAN_005 tasks named in the table.

## Shape

- **The root entry** holds only the small dispatcher (`BlockRenderer`) and
  host context. It never re-exports a family or statically imports a family
  subpath.
- **Each family is its own lazy subpath**, so a document downloads only the
  families its blocks use. Each subpath exports one `BlockFamilyRenderer`
  component that accepts `{ block }`; `BlockRenderer` routes validated blocks
  through this component contract.
- **Never in the `@protoyard/ui` barrel**, like the views kit (ADR-022).
- **No app stack:** nothing here imports `@protoyard/crud`, the player, the
  database, Dexie or Faker. Interactive blocks change state through the
  host's `BlockStateHost`, never by writing tables.

## Root dispatcher and host

```svelte
<script lang="ts">
import { BlockRenderer, setBlockHost } from '@protoyard/blocks-ui';
import { createMemoryBlockStateHost } from '@protoyard/blocks/interactive';

setBlockHost({
  stateHost: createMemoryBlockStateHost(),
  documentId: 'quarterly-review',
  density: 'comfortable',
  canvasMode: 'slide',
  step: 0,
});
</script>

<BlockRenderer blocks={slide.blocks} />
```

Call `setBlockHost` from the host component during initialization. Family
renderers call `getBlockHost()` to read the nearest context. The context reads
through to the object you pass, so a `$state` host stays reactive: a deck that
updates `host.step` moves code highlights without remounting. `density` accepts
`compact`, `comfortable` or `spacious`; `canvasMode` is `flow` or `slide`.
`stateHost` and `mountEmbed` are optional host capabilities. The dispatcher
validates each input at render time, shows a skeleton while its family chunk
loads, and renders a bounded note for malformed or unsupported blocks. It
does not display invalid block content. `flow`, `tree`, `board` and
`terminal` blocks route to `@protoyard/blocks-ui/diagram`.

| Subpath | Blocks | Filled by |
| --- | --- | --- |
| `.` | `BlockRenderer` dispatcher and host context | T-blocks-ui-renderer-core |
| `./text` | Heading, rich text, list, quote, callout, divider | T-blocks-ui-text-media |
| `./media` | Image, video, people (avatars) | T-blocks-ui-text-media |
| `./data` | Stat/KPI row, table, chart (charts-ui) | T-blocks-ui-data |
| `./structure` | Timeline, steps, comparison, cards, icon, CTA, columns | **done** (this package) |
| `./data` | Stat/KPI row, table, chart (charts-ui) | T-blocks-ui-data (done) |
| `./structure` | Timeline, steps, comparison, cards, icon, CTA, columns | T-blocks-ui-structure |
| `./code` | Code with stepped highlights | T-blocks-ui-code-diagram |
| `./diagram` | Flow, tree, board, terminal | T-blocks-ui-code-diagram |
| `./interactive` | Poll, quiz, calculator, tabs/reveal, counter, chart controls | T-blocks-ui-interactive |
| `./map` | Map on the offline simulated map (views-ui/map) | T-blocks-ui-interactive |
| `./embed` | embed-app framed preview; `mountEmbed` only after **Start the app** | T-blocks-ui-embed-app |
| `./styles.css` | Registers the kit's markup with Tailwind (`@source`) | this scaffold |

## Text and media renderers

`@protoyard/blocks-ui/text` renders headings, safe Markdown text, lists,
quotes, callouts and dividers. Markdown uses the bounded AST from
`@protoyard/ai/markdown`; raw HTML remains text and unsafe link or image URLs
are omitted. `@protoyard/blocks-ui/media` renders images, video and people.
Image and video sources are checked again by the renderer, so unsupported
remote sources do not become browser requests. Images include their declared
dimensions and accessible alt text (or an empty alt for decorative images).
Video is muted, inline and controlled; autoplay is disabled when the user
prefers reduced motion. Loaded media bubbles a `blocks:media-ready` event for
hosts that need to recalculate layout. People and `avatar:` media use the
renderer avatar URL helper.
## Structure family (`./structure`)

Lazy chunk for timeline, steps, comparison, cards, icon, CTA and columns:

- **Flow vs slide:** below 640 px in `canvasMode: 'flow'`, multi-column layouts
  collapse to one column; `slide` keeps a fixed grid for the deck canvas.
- **CTA:** every action has a schema-validated `href` run through `safeHref`.
  Set `onCtaAction` on the host to handle clicks; return a promise so
  `@protoyard/ui` `Button` shows pending feedback until it settles. Without a
  host handler, external/mailto links navigate and hash/path links use `href`.
- **Comparison** uses a real `<table>` with column and row headers.
- **Columns** resolve nested blocks through the same dispatcher (lazy).
- **Icons** come from `BLOCK_ICON_COMPONENTS` (static Lucide map).

```ts
setBlockHost({
  canvasMode: 'flow',
  onCtaAction: async ({ href }) => {
    await router.navigate(href);
  },
});
```

Covered by `packages/blocks-ui/tests/structure.test.ts`.
## Embed-app (`./embed`)

An `embed-app` block is a framed level-1 app preview. The family chunk is small
and does **not** load the app stack:

```svelte
<script lang="ts">
import { BlockRenderer, setBlockHost } from '@protoyard/blocks-ui';
import type { MountEmbed } from '@protoyard/blocks-ui';

const mountEmbed: MountEmbed = (target, app) => {
  // KINDS / player: validate with loadUntrustedBlueprint, then mount a level-1
  // runtime into `target`. Return a disposer.
  const stop = startLevel1(target, app);
  return () => stop();
};

setBlockHost({ canvasMode: 'slide', mountEmbed });
</script>

<BlockRenderer blocks={[{ type: 'embed-app', id: 'try', title: 'Try it', app: blueprint }]} />
```

- **Lazy start.** Until the user clicks **Start the app** (or `startLabel`),
  `mountEmbed` is never called and no app code is downloaded with the deck.
- **Missing host.** Without `mountEmbed`, an accessible `role="note"` explains
  that this host cannot start embedded apps.
- **Errors.** A thrown mount is shown as `role="alert"`; the frame stays idle.
- **Unmount.** Closing the app or destroying the block runs the disposer
  returned by `mountEmbed` and clears the mount node.
- **Keyboard.** While the app is running, Tab cycles inside the frame so deck
  navigation keys are not stolen mid-input. The player / KINDS still own
  arrow-key slide handling outside the frame.
- **Budget.** The embed family chunk targets ≤ 2 KB gzip; the app loads only
  on click (crud shell is a separate download).

Coordinate `MountEmbed` with KINDS (`loadUntrustedBlueprint` + level-1 mount).
See [PLAYER.md](../../docs/PLAYER.md#embedded-apps-in-decks-and-pages).
## Data family (`./data`)

`BlockFamilyRenderer` routes `stat`, `table` and `chart` blocks. `StatBlock`,
`TableBlock` and `ChartBlock` are also exported, with the pure helpers
(`formatCents`, `formatTableCell`, `columnAlign`, `chartValueFormatter`,
`chartSeries`, `chartItems`, `isCartesianChart`).

- **Stat row:** a region named by the title (or "Key figures") holding a
  description list. Each figure is a term (label) with its value, delta,
  context and an optional sparkline. The delta's tone shows as a theme-colored
  dot, and screen readers hear it in words ("+12% (Positive)"), so color is
  never the only signal. The text stays in the foreground color for contrast.
  The `Sparkline` loads from `@protoyard/charts-ui/compact` only when a figure
  has a `trend`.
- **Table:** the caption is the accessible name. Headers are scoped `col`, a
  leading text column becomes the row headers, and numeric columns align to
  the end with tabular figures. Cells format by column: `number`, `percent`
  and `cents` (integer minor units in the table's three-letter currency:
  `123450` with `EUR` is `€1,234.50`). Empty cells show `—`, and
  `highlightRow` is emphasized. The table scrolls inside a focusable region
  named after it. Formatting uses `en-US`, never the system locale.
- **Chart:** the AI chart spec (`ChartSpecSchema` from `@protoyard/ai/chart`)
  is checked again at render time, and an invalid spec shows a note with the
  reason instead of a chart.
  - A valid chart shows its data table at once, then the chart when
    `@protoyard/charts-ui/cartesian` (line, area, bar) or `/part-whole`
    (donut, pie, funnel) arrives.
  - Every charts-ui chart has its own "View as table" toggle, so the block
    adds none. `showTable: true` keeps the table under the chart.
  - If the chart chunk fails, the table stays, with a note.
  - Charts draw with `--py-chart1..8`, so they follow every theme.
- **Size** (real Vite build, gzip -9, over a shell that already ships zod and
  the ui class helper, as every prototype does; 2026-10-21): the data chunk is
  4,253 B, including the chart spec schema. The charts-ui families stay
  separate lazy chunks: cartesian 11.1 KB, part-whole 9.5 KB, compact 3.4 KB.
## Code (`./code`)

`CodeBlock` renders `@protoyard/blocks/code` tokens as text spans, never HTML,
so markup in the source stays text. The `<code>` element's text equals the
source exactly: line numbers (`lineNumbers`) are CSS `content`, and each line
ends with a real newline, so a copied selection matches. It also provides:

- **Colors** (`CODE_TOKEN_STYLES`). Each token kind maps to a theme token that
  reaches WCAG AA (4.5:1) on the code surface (`surface`) and on a highlighted
  line (`muted`), in every built-in theme and mode
  (`tests/code-contrast.test.ts`). Keywords and tags are also bold and comments
  italic, so meaning never rests on color alone.
- **Stepped highlights.** `highlights` holds one line spec per step. With a
  host `step`, the block shows `highlights[step - block.step]`, clamped to the
  first and last (`activeHighlightIndex`). Without a host step (pages, docs) it
  shows the first step. Highlighted lines are `<mark>` elements with a primary
  bar; other lines are never dimmed.
- **Copy.** The button writes the exact source to the clipboard. It shows
  "Copied" or "Copy failed" and announces the result politely.
- **Keyboard.** The scroller (`<pre tabindex="0">`) is labelled by the file
  name or language, so long lines are reachable from the keyboard.
- **Lazy grammars.** Only the block's language grammar is downloaded
  (`grammars.ts`, one chunk per language). Until it arrives, and for `text`,
  lines show as plain text with the same content and highlights.

## Diagrams (`./diagram`)

| Block | Rendering | Text alternative |
| --- | --- | --- |
| `flow` | `layoutFlow` positions: HTML step boxes, SVG arrows, a dashed loop-back | An ordered list "Step n of N: label" (plus the loop), in a labelled, focusable scroller |
| `tree` `org` | `layoutTree` positions: HTML boxes, SVG elbow connectors | A nested list in the same order |
| `tree` `file-tree` | A visible nested list with folder and file icons | The list itself; folders announce their item count |
| `board` | Columns of cards, horizontally scrollable | Each column is a section named "Title, N cards" with a list of its cards |
| `terminal` | Prompt, output and comment lines in a code surface | An ordered list. The `$` marker is hidden from assistive tech, which hears "Command:" instead |

Labels are always text: long ones clamp to two lines with the full label as a
`title`. Tones (`TONE_BORDER`) only tint borders. The drawn layers of flows and
org charts are `aria-hidden`, and every wide diagram scrolls inside a
focusable region.

Measured with a Vite library build (Svelte external, minified, gzip):

- **`./code`:** 3.6 KB, plus the tokenizer core (1.2 KB), so 4.7 KB before
  any grammar.
- **Grammars:** each language adds its grammar plus 0.4 KB of shared helpers,
  only when a block uses it. That is json 0.8, html 0.9, yaml 1.0, css 1.1,
  python 1.1, bash 1.2, sql 1.2 and ts/js 1.5 KB. So a code block costs
  5.5–6.2 KB in all, and ts/js is the one language past 6 KB.
- **`./diagram`:** 5.4 KB.
- **Icons:** neither chunk imports the icon library; their few icons are inline
  SVG strokes.

## Icons

`src/lib/icons.ts` exports `BLOCK_ICON_COMPONENTS`, which maps every
`BLOCK_ICONS` id from `@protoyard/blocks` to a Lucide component imported by
name. `map` is imported as `MapIcon` so it never shadows the global `Map`.
There are no dynamic icon lookups and no namespace import, and only block
family chunks import the module, so icons never reach an entry.

`tests/icons.test.ts` checks that:
- every id resolves to the real Lucide export;
- the map has no extra keys;
- the blueprint's `SCREEN_NAV_ICONS` are included;
- the imports stay named.

Measured in a Vite build: all 96 icons add about 8.5 KB gzip over a single
icon, roughly 90 B each.

## Styles

Import the stylesheet after Tailwind, the themes and `@protoyard/ui`:

```css
@import "@protoyard/blocks-ui/styles.css";
```

## Package output

The manifest keeps Svelte and TypeScript source exports for workspace
development. `pnpm build:packages --filter @protoyard/blocks-ui` runs
`svelte-package` and writes the `dist/` files that the packed manifest exposes.
