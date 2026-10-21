# @protoyard/blocks-ui

Svelte 5 renderers for Protoyard's shared content blocks
([ADR-037](../../docs/DECISIONS.md)), the UI half of
[`@protoyard/blocks`](../blocks/README.md). Decks, pages and docs, at both
levels (the player and generated prototypes), render blocks with these same
components.

> **Status:** scaffold. Every subpath is reserved and has no runtime exports
> yet. They are filled by the PLAN_005 tasks named in the table.

## Shape

- **The root entry** will hold only the small dispatcher (`BlockRenderer`) and
  the host context. It never re-exports a family.
- **Each family is its own lazy subpath**, so a document downloads only the
  families its blocks use.
- **Never in the `@protoyard/ui` barrel**, like the views kit (ADR-022).
- **No app stack:** nothing here imports `@protoyard/crud`, the player, the
  database, Dexie or Faker. Interactive blocks change state through the
  host's `BlockStateHost`, never by writing tables.

| Subpath | Blocks | Filled by |
| --- | --- | --- |
| `.` | `BlockRenderer` dispatcher and host context | T-blocks-ui-renderer-core |
| `./text` | Heading, rich text, list, quote, callout, divider | T-blocks-ui-text-media |
| `./media` | Image, video, people (avatars) | T-blocks-ui-text-media |
| `./data` | Stat/KPI row, table, chart (charts-ui) | T-blocks-ui-data |
| `./structure` | Timeline, steps, comparison, cards, icon, CTA, columns | T-blocks-ui-structure |
| `./code` | Code with stepped highlights | T-blocks-ui-code-diagram |
| `./diagram` | Flow, tree, board, terminal | T-blocks-ui-code-diagram |
| `./interactive` | Poll, quiz, calculator, tabs/reveal, counter, chart controls | T-blocks-ui-interactive |
| `./map` | Map on the offline simulated map (views-ui/map) | T-blocks-ui-interactive |
| `./embed` | embed-app, mounted through the host's `mountEmbed` | T-blocks-ui-embed-app |
| `./styles.css` | Registers the kit's markup with Tailwind (`@source`) | this scaffold |

## Styles

Import the stylesheet after Tailwind, the themes and `@protoyard/ui`:

```css
@import "@protoyard/blocks-ui/styles.css";
```

## Package output

The manifest keeps Svelte and TypeScript source exports for workspace
development. `pnpm build:packages --filter @protoyard/blocks-ui` runs
`svelte-package` and writes the `dist/` files that the packed manifest exposes.
