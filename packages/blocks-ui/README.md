# @protoyard/blocks-ui

Svelte 5 renderers for Protoyard's shared content blocks
([ADR-037](../../docs/DECISIONS.md)), the UI half of
[`@protoyard/blocks`](../blocks/README.md). Decks, pages and docs, at both
levels (the player and generated prototypes), render blocks with these same
components.

> **Status:** the root dispatcher, host context, **structure**, **data**,
> **text/media**, **interactive** and **map** family subpaths are implemented.
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
  viewerId: 'persona-ada',
  density: 'comfortable',
  canvasMode: 'slide',
  step: 0,
  onCtaAction: async ({ href }) => {
    /* structure CTAs */
  },
  mountEmbed: (target, app) => {
    /* embed-app after Start the app */
  },
});
</script>

<BlockRenderer blocks={slide.blocks} />
```

Call `setBlockHost` from the host component during initialization. Family
renderers call `getBlockHost()` to read the nearest context. The context reads
through to the object you pass, so a `$state` host stays reactive: a deck that
updates `host.step` moves code highlights without remounting.

The host contract (`BlockHostOptions`; every field is optional):

| Field | Default | Meaning |
| --- | --- | --- |
| `density` | `comfortable` | `compact`, `comfortable` or `spacious` |
| `canvasMode` | `flow` | `flow` (pages, docs) or `slide` (decks: presentation-scale type) |
| `step` | none | The current slide step; drives fragments and code highlights |
| `fragment` | none | Decks: `(block) => { visible, active } \| null` for a block with a `step`. `BlockRenderer` and `columns` then wrap the block in a `data-py-fragment` box that keeps its space and is invisible, `inert` and `aria-hidden` until visible. Without it every block shows. |
| `codeHighlight` | none | Decks: `(block) => index` of the code highlight to show (−1 for none). Without it, code blocks follow `step` relative to the block's own `step`. |
| `documentId` | `preview` | The document's id; with a block id it forms the interactive state key (`stateKey`) |
| `stateHost` | an in-memory preview host | A `BlockStateHost` from `@protoyard/blocks/interactive`. Without it, interactive blocks still work but their state is not persisted. |
| `viewerId` | `viewer` | The persona that polls and quizzes record per viewer |
| `onCtaAction` | none | Handles CTA actions; the returned promise drives pending feedback |
| `mountEmbed` | none | Mounts an `embed-app` after the viewer presses **Start the app** |

The dispatcher validates each input at render time, shows a skeleton while
its family chunk loads, and renders a bounded note for malformed or
unsupported blocks; it never displays invalid block content. Diagram blocks
(`flow`, `tree`, `board`, `terminal`) are `Block` types like the others and
route to `@protoyard/blocks-ui/diagram`.

Measured with `npx tsx scripts/bench-blocks.ts --check` (gzip level 9, what
each subpath adds over a minimal Svelte shell; 2026-10-22):

| Subpath | Blocks | Gzip added | Budget |
| --- | --- | --- | --- |
| `.` | `BlockRenderer` dispatcher and host context | 2.1 KB | 3.0 KB |
| `./text` | Heading, rich text, list, quote, callout, divider | 12.0 KB | 12.8 KB |
| `./media` | Image, video, people (avatars) | 2.9 KB | 4.0 KB |
| `./data` | Stat/KPI row, table, chart (charts-ui families load separately) | 4.0 KB | 5.0 KB |
| `./structure` | Timeline, steps, comparison, cards, icon, CTA, columns | 12.6 KB | 13.5 KB |
| `./code` | Code with stepped highlights (grammars load per language) | 3.9 KB | 6.0 KB |
| `./diagram` | Flow, tree, board, terminal | 4.8 KB | 6.0 KB |
| `./interactive` | Poll, quiz, calculator, tabs/reveal, counter, chart-controls, form | 19.1 KB | 20.4 KB |
| `./map` | Map on the offline simulated map (views-ui/map loads lazily) | 1.0 KB | 4.0 KB |
| `./embed` | embed-app framed preview; the app loads only on start | 2.2 KB | 2.4 KB |
| `./styles.css` | Registers the kit's markup with Tailwind (`@source`) | — | — |

Every block type's props, limits, use-when and a minimal example are in the
generated [block reference](../../docs/BLOCKS.md).

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
- **Timeline:** vertical flow timelines reserve a marker column beside each
  event's time and title. Markers do not sit over text, including at narrow
  widths. This same renderer is used by decks and page/doc flows.
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

## Interactive family (`./interactive`)

Every change goes through `stateHost.dispatch` (a promise so `Button` can show
pending). blocks-ui never imports `@protoyard/database` or Dexie. Roots carry
`data-py-deck-interactive` (`DECK_INTERACTIVE_ATTRIBUTE` from `@protoyard/decks`)
so a click or swipe inside never advances a deck.

```svelte
<script lang="ts">
import { BlockRenderer, setBlockHost } from '@protoyard/blocks-ui';
import { createMemoryBlockStateHost } from '@protoyard/blocks/interactive';

setBlockHost({
  stateHost: createMemoryBlockStateHost(),
  documentId: 'quarterly-review',
  viewerId: 'persona-ada',
});
</script>

<BlockRenderer blocks={slide.blocks} />
```

| Block | Notes |
| --- | --- |
| `poll` | Vote / clear; Progress bars for shares; live region announces results |
| `quiz` | Deterministic shuffle; Correct/Not quite text (not color alone) |
| `calculator` | Sliders with `aria-valuetext` (units); formula outputs; optional chart |
| `counter` | Increment / decrement / reset |
| `tabs` / `reveal` | Dispatch select/toggle; nested blocks via the family dispatcher |
| `chart-controls` | Kind switch, series toggle, label range; charts-ui lazy |
| `form` | Honest placeholder until the pages kit's FormBlock replaces it through the host; responses belong to the pages form runtime |

Map blocks load `@protoyard/views-ui/map` only from `./map` (not from the
interactive chunk) and also set `data-py-deck-interactive`, as does the
`embed-app` frame. `tests/deck-interactive.test.ts` checks the root of all ten
interactive types (poll, quiz, calculator, counter, tabs, reveal,
chart-controls, form, map, embed-app).

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
  - Its string labels are category positions, so line and area adapters select
    a categorical x-axis instead of parsing those labels as dates.
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

## Accessibility and themes

`src/lib/tones.ts` maps every `BlockTone` to theme-token Tailwind classes
(icon chips, borders, indicators) and documents the palette pairs that must
reach WCAG AA. `packages/blocks-ui/tests/a11y-themes.test.ts` renders every
`RICH_EXAMPLES` catalog fixture, checks heading order, image `alt`, named
focusable controls with `focus-visible` rings, and AA contrast of those tone
pairs across all **6 built-in themes × light/dark**. Failures name the block,
theme and mode. Interactive, map and embed roots also set
`data-py-deck-interactive` so deck navigation ignores clicks inside them.
The form block remains a placeholder until the pages `FormBlock` owns
responses through the host.

```bash
pnpm vitest run packages/blocks-ui/tests/a11y-themes.test.ts
```

## Security

`tests/security-fuzz.test.ts` renders 2,000 seeded hostile documents (the
generator is shared with `@protoyard/blocks`' `tests/security.test.ts`).
Accepted documents render their sanitized blocks; rejected ones render their
raw input. The rendered DOM must have:

- no script-capable element (`script`, `iframe`, `object`, `embed`, `base`,
  `meta`, `link`, `foreignObject`…);
- no `on*` or `srcdoc` attribute, and no `url()` or `expression()` in a style;
- no dangerous scheme in any URL attribute;
- no remote media;
- no `fetch`, XHR or beacon request.

The source has no `{@html}`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
`document.write`, `eval` or `new Function`.

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
