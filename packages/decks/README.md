# @protoyard/decks

The framework-agnostic slide deck engine for Protoyard
([ADR-038](../../docs/DECISIONS.md)). It holds everything about a deck that is
not rendering: the deck schema, the layout catalog, navigation, steps, style
resolution and quality rules. It has no Svelte and does not use Reveal.js.
[`@protoyard/decks-ui`](../decks-ui/README.md) renders it.

> **Status:** the bounded deck schema, virtual canvas and pure navigation model
> are implemented. The layout catalog, input guard, steps and motion, style
> **Status:** the bounded deck schema, the virtual canvas, and steps and motion
> are implemented. The layout catalog, navigation model, input guard, style
> resolver, backgrounds and quality rules land in later PLAN_005 tasks. This
> **Status:** the bounded deck schema, virtual canvas and style resolver are
> implemented. The layout catalog, navigation model, input guard, steps and
> motion, backgrounds and quality rules land in later PLAN_005 tasks. This
> README lists only what exists.
> **Status:** the bounded deck schema, virtual canvas and layout catalog are
> implemented. Navigation, input guard, steps and motion, style resolver,
> backgrounds and quality rules land in later PLAN_005 tasks.

## Exports

| Subpath | Exports |
| --- | --- |
| `@protoyard/decks` | Canvas helpers, plus `createDeckNavigator`, `parseDeckHash`, `formatDeckHash`, `defaultSlideStepCount` and related types |
| `@protoyard/decks` | `DECK_ASPECTS`, `DeckAspect`, `DEFAULT_DECK_ASPECT`, `isDeckAspect`, `deckCanvasSize`, `DeckCanvasSize`, `DECK_TEXT_MINIMUMS`; steps and motion: `slideSteps`, `slideStepCount`, `fragmentPhase`, `activeCodeHighlight`, `resolveSlideTransition`, `resolveDeckTransitions`, `resolveFragmentMotion`, `effectiveMotion`, `prefersReducedMotion`, `FRAGMENT_EFFECTS`, `DECK_TRANSITIONS`, `MAX_MOTION_MS` |
| `@protoyard/decks` | Canvas helpers plus `DECK_LAYOUTS`, `getDeckLayout`, `parseLayoutProps`, `describeLayouts` |
| `@protoyard/decks/schema` | `DeckSchema`, `DeckStyleSchema`, slide and outline schemas, `DeckJsonSchema`, `safeParseDeck`, and the bounded deck types. `@protoyard/blueprint`'s `kind: "deck"` branch imports the schema from here. |
| `@protoyard/decks/layouts` | Full layout catalog: 19 content layouts + `chart` + `free`, prop schemas, samples, pacing and use-when metadata |
| `@protoyard/decks/style` | `resolveDeckStyle`, which resolves a built-in or library theme, numeric palette seed, font pairing and presentation tokens. It returns an `AppearanceInput` for `@protoyard/themes` `applyAppearance`, combined CSS variables, the effective style and fallback warnings. |
| `@protoyard/decks/quality` | `DECK_QUALITY` thresholds, `DECK_QUALITY_RULES` (static and rendered rules with severities), `checkDeckStatic`, `deckJsonPath`. Not imported by renderers. |

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

## Quality rules (`@protoyard/decks/quality`)

Deck quality thresholds and static checks, as data. They are ported from the
developer's keynote QA scripts. `deck lint` and the visual sweep both read
them, so no rule is declared twice.

- **`DECK_QUALITY`:**
  - minimum rendered text: 24 px body and 18 px labels on the canvas (the same
    values as `DECK_TEXT_MINIMUMS`);
  - notes of at least 40 characters;
  - at most two identical layouts in a row;
  - visible words per pacing type: punch 15, idea 45, diagram 60, story 50;
  - phrases that mark boilerplate notes.
- **`DECK_QUALITY_RULES`:** every rule with its `severity` and where it runs.
  `static` rules run in `checkDeckStatic`; `rendered` rules (font size,
  overflow, failed images, contrast) need a browser and run in the visual
  sweep. Structure, assets and step order are errors. Notes, density and
  repetition are warnings.
- **`checkDeckStatic(deck)`** takes a deck that passed `safeParseDeck` and
  returns `{ ok, errors, warnings, issues }`. Each issue has its `rule`,
  `severity`, `slideId`, `path` and a schema-style `jsonPath`
  (`$.slides[2].props.image.alt`). It checks:

  | Rule | Severity | What it flags |
  | --- | --- | --- |
  | `unknown-layout` | error | A layout the catalog does not have |
  | `layout-props` | error | Props that break the layout's schema and limits (paths from `parseLayoutProps`) |
  | `image-alt` | error | An image in props with no alt text |
  | `image-size` | error | An image in props with no width and height |
  | `step-order` | error | A fragment that reveals before content above it, in reading order (columns included) |
  | `empty-steps` | warning | More step labels than fragments |
  | `notes-missing` | warning | Notes absent or under 40 characters |
  | `notes-duplicate` | warning | The same notes as an earlier slide, ignoring case and punctuation |
  | `notes-boilerplate` | warning | Notes that only say not to read the slide |
  | `layout-repetition` | warning | A third (or later) visible slide in a row with the same layout |
  | `too-many-words` | warning | More visible words than the layout's most lenient pacing allows; code and alt text do not count |

  Hidden slides are still checked for structure, assets and step order, but
  not for notes, words or repetition. Image blocks on free slides already
  require alt (or `decorative`) and a size in their schema.

The subpath is 21.8 KB gzip minified with zod external. Most of that is the
layout catalog and the block schemas it validates against. Only authoring
tools and the sweep import it.

## Tests

```bash
pnpm vitest run packages/decks
pnpm vitest run packages/decks/tests/navigation.test.ts
pnpm vitest run packages/decks/tests/layouts.test.ts
pnpm vitest run packages/decks/tests/quality.test.ts
pnpm --filter @protoyard/decks typecheck
```
