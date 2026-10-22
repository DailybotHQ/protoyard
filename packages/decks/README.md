# @protoyard/decks

The framework-agnostic slide deck engine for Protoyard
([ADR-038](../../docs/DECISIONS.md)). It holds everything about a deck that is
not rendering: the deck schema, the layout catalog, navigation, steps, style
resolution and quality rules. It has no Svelte and does not use Reveal.js.
[`@protoyard/decks-ui`](../decks-ui/README.md) renders it.

> **Status:** the bounded deck schema, virtual canvas and style resolver are
> implemented. The layout catalog, navigation model, input guard, steps and
> motion, backgrounds and quality rules land in later PLAN_005 tasks. This
> README lists only what exists.

## Exports

| Subpath | Exports |
| --- | --- |
| `@protoyard/decks` | `DECK_ASPECTS`, `DeckAspect`, `DEFAULT_DECK_ASPECT`, `isDeckAspect`, `deckCanvasSize`, `DeckCanvasSize`, `DECK_TEXT_MINIMUMS` |
| `@protoyard/decks/schema` | `DeckSchema`, `DeckStyleSchema`, slide and outline schemas, `DeckJsonSchema`, `safeParseDeck`, and the bounded deck types. `@protoyard/blueprint`'s `kind: "deck"` branch imports the schema from here. |
| `@protoyard/decks/style` | `resolveDeckStyle`, which resolves a built-in or library theme, numeric palette seed, font pairing and presentation tokens. It returns an `AppearanceInput` for `@protoyard/themes` `applyAppearance`, combined CSS variables, the effective style and fallback warnings. |

`DeckSchema` accepts catalog slides (`layout` plus bounded JSON `props`) and
free slides (`layout: "free"` plus validated `@protoyard/blocks` content).
Decks are limited to 200 slides; slide ids are unique lowercase slugs; notes
are capped at 2,000 characters. Optional outlines group existing slide ids
into named sections. Strict objects reject unknown fields. `DeckJsonSchema` is
the Draft 2020-12 JSON Schema derived from the same Zod schema.

`safeParseDeck(value)` returns either the typed deck or issues with a stable
`jsonPath` for authoring feedback.

### Style resolution

Resolve a deck's style before mounting the deck UI. The optional slide override
shallowly replaces only the supplied deck style fields. Unknown theme and font
ids fall back to the standard theme/font and are returned as warnings. Numeric
palette seeds are converted deterministically to a six-digit color seed. The
host can select light or dark mode and pass its reduced-motion preference; a
deck's `motion: "none"` also disables theme motion.

```ts
import { applyAppearance } from '@protoyard/themes';
import { resolveDeckStyle } from '@protoyard/decks/style';

const slideOverride = { background: 'gradient', transition: 'slide' };
const resolved = await resolveDeckStyle(deck.style, slideOverride, {
  mode: 'light',
  reducedMotion: false,
});
applyAppearance(root, resolved.appearance);
for (const [name, value] of Object.entries(resolved.variables)) {
  root.style.setProperty(name, value);
}
```

`resolved.style` retains non-CSS presentation metadata such as logo and footer
text. Deck CSS variables include the aspect ratio, density, radius, motion,
transition, background preset, progress location and slide-number flag.

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
pnpm --filter @protoyard/decks typecheck
```
