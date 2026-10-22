# @protoyard/decks

The framework-agnostic slide deck engine for Protoyard
([ADR-038](../../docs/DECISIONS.md)). It holds everything about a deck that is
not rendering: the deck schema, the layout catalog, navigation, steps, style
resolution and quality rules. It has no Svelte and does not use Reveal.js.
[`@protoyard/decks-ui`](../decks-ui/README.md) renders it.

> **Status:** the bounded deck schema, virtual canvas and layout catalog are
> implemented. Navigation, input guard, steps and motion, style resolver,
> backgrounds and quality rules land in later PLAN_005 tasks.

## Exports

| Subpath | Exports |
| --- | --- |
| `@protoyard/decks` | Canvas helpers plus `DECK_LAYOUTS`, `getDeckLayout`, `parseLayoutProps`, `describeLayouts` |
| `@protoyard/decks/schema` | `DeckSchema`, `DeckStyleSchema`, slide and outline schemas, `DeckJsonSchema`, `safeParseDeck`, and the bounded deck types. `@protoyard/blueprint`'s `kind: "deck"` branch imports the schema from here. |
| `@protoyard/decks/layouts` | Full layout catalog: 19 content layouts + `chart` + `free`, prop schemas, samples, pacing and use-when metadata |

`DeckSchema` accepts catalog slides (`layout` plus bounded JSON `props`) and
free slides (`layout: "free"` plus validated `@protoyard/blocks` content).
Decks are limited to 200 slides; slide ids are unique lowercase slugs; notes
are capped at 2,000 characters. Optional outlines group existing slide ids
into named sections. Strict objects reject unknown fields. `DeckJsonSchema` is
the Draft 2020-12 JSON Schema derived from the same Zod schema.

`safeParseDeck(value)` returns either the typed deck or issues with a stable
`jsonPath` for authoring feedback.

## Layout catalog

```ts
import { DECK_LAYOUTS, describeLayouts, parseLayoutProps } from '@protoyard/decks/layouts';

parseLayoutProps('timeline', { events: [/* 4–8 */] });
describeLayouts(); // agent-readable summary of every layout
```

21 layouts: the 19 primitives from the developer’s deck kit (`title-hero`,
`section-divider`, `two-column-split`, `three-column-cards`, `image-*`,
`quote`, `code-with-callout`, `big-stat`, `comparison-table`, `process-steps`,
`timeline`, `team-avatars`, `closing-cta`, `video-*`), plus `chart`
(`ChartSpecSchema` via `@protoyard/blocks`) and `free` (validated blocks).

Each entry has `id`, `label`, `useWhen`, `dontUseWhen`, `pacing`
(`punch` \| `idea` \| `diagram` \| `story`), size `limits`, a zod `propsSchema`
and a `sample`. AUTHORING consumes the catalog read-only for selection and
lint. No brand hex values and no site-specific class names.

| Layout | Prop limits (summary) |
| --- | --- |
| `three-column-cards` | exactly 3 cards |
| `process-steps` | 3–5 steps |
| `timeline` | 4–8 events |
| `team-avatars` | ≤ 8 people |
| `comparison-table` | 2–4 columns × 3–5 rows |
| `chart` | ChartSpec caps |
| `free` | 1–48 blocks |

## The virtual canvas

A slide is laid out on a fixed canvas and scaled as a whole by a transform. Layouts
and lint thresholds are therefore in canvas pixels and never depend on the
viewer's screen.

| Aspect | Canvas |
| --- | --- |
| `16:9` (default) | 1280 × 720 |
| `4:3` | 1024 × 768 |
| `9:16` | 720 × 1280 |
| `1:1` | 1080 × 1080 |

`deckCanvasSize(aspect)` falls back to 16:9 for any unknown value.
`DECK_TEXT_MINIMUMS` is `{ bodyPx: 24, labelPx: 18 }`. Layout CSS and deck lint
both read it.

```ts
import { deckCanvasSize } from '@protoyard/decks';

deckCanvasSize('4:3'); // { width: 1024, height: 768 }
```

## Tests

```bash
pnpm vitest run packages/decks
pnpm vitest run packages/decks/tests/layouts.test.ts
pnpm --filter @protoyard/decks typecheck
```
