# @protoyard/decks

The framework-agnostic slide deck engine for Protoyard
([ADR-038](../../docs/DECISIONS.md)). It holds everything about a deck that is
not rendering: the deck schema, the layout catalog, navigation, steps, style
resolution and quality rules. It has no Svelte and does not use Reveal.js.
[`@protoyard/decks-ui`](../decks-ui/README.md) renders it.

> **Status:** the bounded deck schema, the virtual canvas, and steps and motion
> are implemented. The layout catalog, navigation model, input guard, style
> resolver, backgrounds and quality rules land in later PLAN_005 tasks. This
> README lists only what exists.

## Exports

| Subpath | Exports |
| --- | --- |
| `@protoyard/decks` | `DECK_ASPECTS`, `DeckAspect`, `DEFAULT_DECK_ASPECT`, `isDeckAspect`, `deckCanvasSize`, `DeckCanvasSize`, `DECK_TEXT_MINIMUMS`; steps and motion: `slideSteps`, `slideStepCount`, `fragmentPhase`, `activeCodeHighlight`, `resolveSlideTransition`, `resolveDeckTransitions`, `resolveFragmentMotion`, `effectiveMotion`, `prefersReducedMotion`, `FRAGMENT_EFFECTS`, `DECK_TRANSITIONS`, `MAX_MOTION_MS` |
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

## Steps and motion

A slide starts at step 0, and each "next" advances one step until the slide
has none left. `slideSteps(slide)` derives the steps from what the slide
renders:

- **Free slides.** Each block's `step` and `reveal` become a fragment. A code
  block's stepped `highlights` take one step each, starting at the block's own
  step.
- **Catalog slides.** Any object in `props` with an integer `step`, plus
  optional `fragment` (any effect) or `reveal` (the block vocabulary), is a
  fragment.

Distinct authored step numbers are renumbered 1, 2, 3…, so order is always
monotonic and gaps never cost an empty click. Fragments at step 0 belong to the
initial state. `slide.steps` labels name the steps and can extend the count. A
slide has at most 32 steps; later ones play together on the last step, and the
result carries a warning.

The fragment effects are `fade-up`, `in`, `out`, `in-then-out`, `grow`,
`shrink`, `highlight` and `strike`. `fragmentPhase(fragment, current)` tells a
renderer whether a fragment is `visible` and whether its effect is `active`:

- an `out` fragment disappears at its step;
- an `in-then-out` fragment is shown only on its step;
- `highlight`, `strike`, `grow` and `shrink` stay visible and switch on at
  their step.

`activeCodeHighlight` returns the line spec to highlight at a step.

`resolveSlideTransition(style, slide, { prefersReducedMotion })` picks the
transition into a slide. It uses the slide's `transition` first, then the
deck's `style.transition`, then `fade`, and applies the motion level:

| Level | Result |
| --- | --- |
| `full` (default) | as requested: fade 300 ms, slide 400 ms, zoom 350 ms, morph 400 ms |
| `subtle` | zoom becomes fade; the others keep their direction at 60% of the duration |
| `none` | always `none`, 0 ms |
| reduced motion (viewer) | `none` stays `none`; everything else is a 150 ms fade |

The viewer's reduced-motion preference can only lower the deck's level, never
raise it. Durations never exceed `MAX_MOTION_MS` (400 ms).
`resolveFragmentMotion` applies the same rules to fragments: under reduced
motion or `none`, moving effects (`fade-up`, `grow`, `shrink`) become a plain
`in`, while `highlight` and `strike` keep their meaning without motion.
`prefersReducedMotion()` reads `prefers-reduced-motion` and the prototype's
`<html data-py-motion="reduce">` toggle, and is safe without a DOM. Each
`ResolvedTransition` carries a `reason` (`slide-override`, `deck-default`,
`engine-default`, `subtle`, `reduced-motion`, `motion-none`) for DevTools.

## Tests

```bash
pnpm vitest run packages/decks
pnpm --filter @protoyard/decks typecheck
```
