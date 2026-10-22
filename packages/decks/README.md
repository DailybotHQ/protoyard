# @protoyard/decks

The framework-agnostic slide deck engine for Protoyard
([ADR-038](../../docs/DECISIONS.md)). It holds everything about a deck that is
not rendering: the deck schema, the layout catalog, navigation, steps, style
resolution and quality rules. It has no Svelte and does not use Reveal.js.
[`@protoyard/decks-ui`](../decks-ui/README.md) renders it.

> **Status:** the bounded deck schema, virtual canvas and pure navigation model
> are implemented. The layout catalog, input guard, steps and motion, style
> resolver, backgrounds and quality rules land in later PLAN_005 tasks. This
> README lists only what exists.

## Exports

| Subpath | Exports |
| --- | --- |
| `@protoyard/decks` | Canvas helpers, plus `createDeckNavigator`, `parseDeckHash`, `formatDeckHash`, `defaultSlideStepCount` and related types |
| `@protoyard/decks/schema` | `DeckSchema`, `DeckStyleSchema`, slide and outline schemas, `DeckJsonSchema`, `safeParseDeck`, and the bounded deck types. `@protoyard/blueprint`'s `kind: "deck"` branch imports the schema from here. |

`DeckSchema` accepts catalog slides (`layout` plus bounded JSON `props`) and
free slides (`layout: "free"` plus validated `@protoyard/blocks` content).
Decks are limited to 200 slides; slide ids are unique lowercase slugs; notes
are capped at 2,000 characters. Optional outlines group existing slide ids
into named sections. Strict objects reject unknown fields. `DeckJsonSchema` is
the Draft 2020-12 JSON Schema derived from the same Zod schema.

`safeParseDeck(value)` returns either the typed deck or issues with a stable
`jsonPath` for authoring feedback.

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

## Navigation (pure)

`createDeckNavigator(deck)` is framework-free: no DOM and no `location.hash`.
A later decks-ui adapter binds it to the renderer hash router.

```ts
import { createDeckNavigator, formatDeckHash, parseDeckHash } from '@protoyard/decks';
import type { Deck } from '@protoyard/decks/schema';

const nav = createDeckNavigator(deck);
nav.next(); // advance one step, or the next visible slide
nav.prev();
nav.goTo('closing', 0);
nav.goToIndex(2); // among non-hidden slides only
nav.toHash(); // "#/<slide-id>/<step>"
nav.applyHash('#/intro/1'); // unknown or hidden ids fall back to the first visible slide

parseDeckHash('#/intro/1'); // { slideId, step } or null for hostile input
formatDeckHash('intro', 1); // "#/intro/1"
```

Rules:

- **Steps then slides.** `next` / `prev` move within the current slide's step
  range, then to the next or previous **visible** slide.
- **Hidden slides** (`hidden: true`) are skipped by sequential moves and by
  `goToIndex`. Direct `goTo(hiddenId)` falls back to the first visible slide.
- **Step count** defaults to `max(1, slide.steps?.length ?? 0)`. Pass
  `stepCount: (slide) => number` when the steps/motion model supplies a richer
  count (DECKS-steps-motion).
- **Deep links** use `#/<slide-id>/<step>`. `parseDeckHash` rejects path
  traversal, uppercase ids, queries, percents and out-of-range steps.

## Tests

```bash
pnpm vitest run packages/decks
pnpm vitest run packages/decks/tests/navigation.test.ts
pnpm --filter @protoyard/decks typecheck
```
