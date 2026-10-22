# @protoyard/blocks-ui

Svelte 5 renderers for Protoyard's shared content blocks
([ADR-037](../../docs/DECISIONS.md)), the UI half of
[`@protoyard/blocks`](../blocks/README.md). Decks, pages and docs, at both
levels (the player and generated prototypes), render blocks with these same
components.

> **Status:** the root dispatcher, host context and **structure** family
> (timeline, steps, comparison, cards, icon, CTA, columns) are implemented.
> Other family subpaths are filled by the PLAN_005 tasks named in the table.

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
renderers call `getBlockHost()` to read the nearest context. `density` accepts
`compact`, `comfortable` or `spacious`; `canvasMode` is `flow` or `slide`.
`stateHost` and `mountEmbed` are optional host capabilities. The dispatcher
validates each input at render time, shows a skeleton while its family chunk
loads, and renders a bounded note for malformed or unsupported blocks. It
does not display invalid block content. Diagram models have their own schema
and are rendered through `@protoyard/blocks-ui/diagram`; they are not a
`Block` discriminator in this version.

| Subpath | Blocks | Filled by |
| --- | --- | --- |
| `.` | `BlockRenderer` dispatcher and host context | T-blocks-ui-renderer-core |
| `./text` | Heading, rich text, list, quote, callout, divider | T-blocks-ui-text-media |
| `./media` | Image, video, people (avatars) | T-blocks-ui-text-media |
| `./data` | Stat/KPI row, table, chart (charts-ui) | T-blocks-ui-data |
| `./structure` | Timeline, steps, comparison, cards, icon, CTA, columns | **done** (this package) |
| `./code` | Code with stepped highlights | T-blocks-ui-code-diagram |
| `./diagram` | Flow, tree, board, terminal | T-blocks-ui-code-diagram |
| `./interactive` | Poll, quiz, calculator, tabs/reveal, counter, chart controls | T-blocks-ui-interactive |
| `./map` | Map on the offline simulated map (views-ui/map) | T-blocks-ui-interactive |
| `./embed` | embed-app, mounted through the host's `mountEmbed` | T-blocks-ui-embed-app |
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
