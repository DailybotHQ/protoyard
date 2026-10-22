# @protoyard/decks

The framework-agnostic slide deck engine for Protoyard
([ADR-038](../../docs/DECISIONS.md)). It holds everything about a deck that is
not rendering: the deck schema, the layout catalog, navigation, steps, style
resolution and quality rules. It has no Svelte and does not use Reveal.js.
[`@protoyard/decks-ui`](../decks-ui/README.md) renders it.

> **Status:** implemented: the bounded deck schema, the virtual canvas, the
> layout catalog, the pure navigation model, steps and motion, the style
> resolver, and the text twins (Markdown and outline). The input guard,
> backgrounds and quality rules land in later PLAN_005 tasks. This README lists
> only what exists.

## Exports

| Subpath | Exports |
| --- | --- |
| `@protoyard/decks` | Canvas helpers (`DECK_ASPECTS`, `DeckAspect`, `DEFAULT_DECK_ASPECT`, `isDeckAspect`, `deckCanvasSize`, `DeckCanvasSize`, `DECK_TEXT_MINIMUMS`); the layout catalog (`DECK_LAYOUTS`, `getDeckLayout`, `parseLayoutProps`, `describeLayouts`); navigation (`createDeckNavigator`, `parseDeckHash`, `formatDeckHash`, `defaultSlideStepCount`); steps and motion (`slideSteps`, `slideStepCount`, `fragmentPhase`, `activeCodeHighlight`, `resolveSlideTransition`, `resolveDeckTransitions`, `resolveFragmentMotion`, `effectiveMotion`, `prefersReducedMotion`, `FRAGMENT_EFFECTS`, `DECK_TRANSITIONS`, `MAX_MOTION_MS`) |
| `@protoyard/decks/schema` | `DeckSchema`, `DeckStyleSchema`, slide and outline schemas, `DeckJsonSchema`, `safeParseDeck`, and the bounded deck types. `@protoyard/blueprint`'s `kind: "deck"` branch imports the schema from here. |
| `@protoyard/decks/layouts` | Full layout catalog: 19 content layouts + `chart` + `free`, prop schemas, samples, pacing and use-when metadata |
| `@protoyard/decks/style` | `resolveDeckStyle`, which resolves a built-in or library theme, numeric palette seed, font pairing and presentation tokens. It returns an `AppearanceInput` for `@protoyard/themes` `applyAppearance`, combined CSS variables, the effective style and fallback warnings. |
| `@protoyard/decks/text` | `deckToMarkdown`, `deckOutline`, `formatDeckOutline`, `slideTitle`, `blocksMarkdown`, `chartTable`, `richText`, `mdDocumentToMarkdown`, `escapeText`, `escapeInline`, `stripInvisible` (a subpath, so the Markdown parser never enters a deck entry bundle) |

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

## Text twins

`@protoyard/decks/text` turns a deck into text with pure, deterministic
functions: the same deck always gives the same output, with no dates, random
ids or locale formatting.

- **`deckToMarkdown(deck, { title?, includeHidden?, notes? })`** is a Markdown
  twin for accessibility, artifact descriptions, LLM context and the
  "Markdown next to every deck" idea:
  - The `# title` is the outline title, then `options.title`, then "Deck".
  - Outline sections become `##` headings, and slides outside every section
    come under "Other slides".
  - Each slide is a numbered heading with its title, its body, and its speaker
    notes under a "Notes" heading (`notes: false` leaves them out).
  - Hidden slides are skipped unless `includeHidden` is set.
  - Catalog layouts render from their validated props.
  - A layout whose props fail their schema, or an unknown layout, lists every
    prop string by key path.
  - Free slides render their blocks.
  - Charts become a caption plus a data table, with one row per label and one
    column per series.
- **`deckOutline(deck)`** returns one row per slide (`number`, `id`, `layout`,
  `title`, `section`, `hidden`). `formatDeckOutline` prints it as lines such as
  `3. growth · chart · Tickets per month`. `slideTitle(slide)` is the title
  both use: the slide's own title, else the layout's `title`, `heading` or
  `number` prop, else the first heading block, else a shortened quote.

Deck data is untrusted, so nothing from it can become Markdown structure:

- Plain strings are escaped by context. Inline syntax and HTML characters are
  escaped everywhere; `#`, `-`, `+`, `=` and `1.` only where they would start
  a block.
- Bare `https://` and `www.` URLs are broken so they never turn into links.
- Control, zero-width and bidi characters (Trojan Source) are removed.
- Author Markdown (text blocks, list items, callout and card bodies…) is
  parsed with `@protoyard/ai/markdown` and serialized back from that safe
  AST, never copied as a raw string. Raw HTML stays escaped text, and only
  links and images that passed `safeHref` / `safeImageSrc` stay links.
  Author headings are demoted below the slide heading.
- Code goes in a fence longer than any backtick run inside it.
- Inline `data:` images are replaced by their alt text.

## Tests

```bash
pnpm vitest run packages/decks
pnpm vitest run packages/decks/tests/navigation.test.ts
pnpm vitest run packages/decks/tests/layouts.test.ts
pnpm --filter @protoyard/decks typecheck
```
