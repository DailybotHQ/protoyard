# @protoyard/blocks-ui

Svelte 5 renderers for Protoyard's shared content blocks
([ADR-037](../../docs/DECISIONS.md)), the UI half of
[`@protoyard/blocks`](../blocks/README.md). Decks, pages and docs, at both
levels (the player and generated prototypes), render blocks with these same
components.

> **Status:** the root dispatcher, host context, and the **interactive** +
> **map** family subpaths are implemented. Other family subpaths are filled by
> the PLAN_005 tasks named in the table.

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
| `./structure` | Timeline, steps, comparison, cards, icon, CTA, columns | T-blocks-ui-structure |
| `./code` | Code with stepped highlights | T-blocks-ui-code-diagram |
| `./diagram` | Flow, tree, board, terminal | T-blocks-ui-code-diagram |
| `./interactive` | Poll, quiz, calculator, tabs/reveal, counter, chart-controls, form | **done** (T-blocks-ui-interactive) |
| `./map` | Map on the offline simulated map (views-ui/map, lazy) | **done** (T-blocks-ui-interactive) |
| `./embed` | embed-app, mounted through the host's `mountEmbed` | T-blocks-ui-embed-app |
| `./styles.css` | Registers the kit's markup with Tailwind (`@source`) | this scaffold |

## Interactive family (`./interactive`)

Every change goes through `stateHost.dispatch` (a promise so `Button` can show
pending). blocks-ui never imports `@protoyard/database` or Dexie.

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
| `form` | Honest placeholder — responses belong to the pages form runtime |

Map blocks load `@protoyard/views-ui/map` only from `./map` (not from the
interactive chunk).

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
