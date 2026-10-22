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
| `@protoyard/decks` | Canvas helpers, plus `createDeckNavigator`, `parseDeckHash`, `formatDeckHash`, `defaultSlideStepCount` and related types |
| `@protoyard/decks` | `DECK_ASPECTS`, `DeckAspect`, `DEFAULT_DECK_ASPECT`, `isDeckAspect`, `deckCanvasSize`, `DeckCanvasSize`, `DECK_TEXT_MINIMUMS`; steps and motion: `slideSteps`, `slideStepCount`, `fragmentPhase`, `activeCodeHighlight`, `resolveSlideTransition`, `resolveDeckTransitions`, `resolveFragmentMotion`, `effectiveMotion`, `prefersReducedMotion`, `FRAGMENT_EFFECTS`, `DECK_TRANSITIONS`, `MAX_MOTION_MS` |
| `@protoyard/decks` | Canvas helpers plus `DECK_LAYOUTS`, `getDeckLayout`, `parseLayoutProps`, `describeLayouts` |
| `@protoyard/decks` | Input: `decideDeckInput`, `inputPathFrom`, `DECK_KEY_BINDINGS`, `DECK_INPUT_ACTIONS`, `DECK_INTERACTIVE_ATTRIBUTE`, `DECK_CHROME_ATTRIBUTE` and the swipe thresholds |
| `@protoyard/decks` | Backgrounds: `resolveDeckBackground`, `DeckBackgroundSchema`, `DECK_BACKGROUND_PRESETS`, `checkDeckMediaSrc`, `DECK_TEXT_CONTRAST_MIN` |
| `@protoyard/decks` | Untrusted input: `loadUntrustedDeck`, `DEFAULT_UNTRUSTED_DECK_LIMITS`, `stripHiddenCharacters` |
| `@protoyard/decks/schema` | `DeckSchema`, `DeckStyleSchema`, slide and outline schemas, `DeckJsonSchema`, `safeParseDeck`, and the bounded deck types. `@protoyard/blueprint`'s `kind: "deck"` branch imports the schema from here. |
| `@protoyard/decks/layouts` | Full layout catalog: 19 content layouts + `chart` + `free`, prop schemas, samples, pacing and use-when metadata |
| `@protoyard/decks/style` | `resolveDeckStyle`, which resolves a built-in or library theme, numeric palette seed, font pairing and presentation tokens. It returns an `AppearanceInput` for `@protoyard/themes` `applyAppearance`, combined CSS variables, the effective style and fallback warnings. |
| `@protoyard/decks/quality` | `DECK_QUALITY` thresholds, `DECK_QUALITY_RULES` (static and rendered rules with severities), `checkDeckStatic`, `deckJsonPath`. Not imported by renderers. |
| `@protoyard/decks` | Canvas helpers (`DECK_ASPECTS`, `DeckAspect`, `DEFAULT_DECK_ASPECT`, `isDeckAspect`, `deckCanvasSize`, `DeckCanvasSize`, `DECK_TEXT_MINIMUMS`); the layout catalog (`DECK_LAYOUTS`, `getDeckLayout`, `parseLayoutProps`, `describeLayouts`); navigation (`createDeckNavigator`, `parseDeckHash`, `formatDeckHash`, `defaultSlideStepCount`); steps and motion (`slideSteps`, `slideStepCount`, `fragmentPhase`, `activeCodeHighlight`, `resolveSlideTransition`, `resolveDeckTransitions`, `resolveFragmentMotion`, `effectiveMotion`, `prefersReducedMotion`, `FRAGMENT_EFFECTS`, `DECK_TRANSITIONS`, `MAX_MOTION_MS`) |
| `@protoyard/decks/text` | `deckToMarkdown`, `deckOutline`, `formatDeckOutline`, `slideTitle`, `blocksMarkdown`, `chartTable`, `richText`, `mdDocumentToMarkdown`, `escapeText`, `escapeInline`, `stripInvisible` (a subpath, so the Markdown parser never enters a deck entry bundle) |

`DeckSchema` accepts catalog slides (`layout` plus bounded JSON `props`) and
free slides (`layout: "free"` plus validated `@protoyard/blocks` content).
Decks are limited to 200 slides; slide ids are unique lowercase slugs; notes
are capped at 2,000 characters. Optional outlines group existing slide ids
into named sections. Strict objects reject unknown fields. `DeckJsonSchema` is
the Draft 2020-12 JSON Schema derived from the same Zod schema.

`safeParseDeck(value)` returns either the typed deck or issues with a stable
`jsonPath` for authoring feedback.

## Loading untrusted decks

`loadUntrustedDeck(textOrData, limits?)` loads a deck from a link, a paste, a file, an embed message
or an artifact. It never throws and never fetches, runs or renders anything. Cheap checks run
**before** zod, so hostile input never costs a deep parse:

1. **Size and depth.** At most 1 MiB of UTF-8 JSON and 32 levels, scanned on the text.
2. **A plain-data copy.** The loader refuses accessors (they are never called), holes, cycles, class
   instances, symbols, NaN and `__proto__` / `constructor` / `prototype` keys. It strips control and
   bidirectional characters from strings, keeping newlines and tabs.
3. **Counts.** At most 200 slides and 20,000 block nodes across free slides.
4. **`safeParseDeck`.** It enforces the rules below.

Issues carry a `code` (`invalid-input`, `invalid-json`, `too-large`, `too-deep`, `too-many`,
`unsafe-key` or `invalid-deck`), a `jsonPath`, a message and a fix.

`DeckSchema` itself enforces three things:

- **The layout catalog.** A catalog slide's `layout` must be a catalog id, and its `props` must
  pass that layout's props schema (`parseLayoutProps`). Diagnostics point into the props
  (`$.slides[3].props.steps`).
- **Step markers.** `{ step, fragment | reveal }` may sit on any props object; `slideSteps` reads
  them. `step` is an integer from 0 to 1,000, `fragment` one of the effects, and `reveal` one of
  the block reveal words, never both. The markers are checked, then set aside for the props schema,
  and kept in the parsed slide. A `fragment` or `reveal` without `step` is ordinary content, so a
  strict layout refuses it.
- **The media and link policy in props.** Every `src` or `poster` passes `checkDeckMediaSrc`; a
  `src` under `video` is checked as a video. Every `href` passes the blocks link policy: http(s),
  mailto, `#anchor` or relative, never `javascript:` or protocol-relative. Free slides get the
  blocks media policy from `@protoyard/blocks`.

Rendering is the other half: decks-ui shows every deck string as text and has no `{@html}`,
`innerHTML` or eval sink. `decks-ui/tests/hostile-render.test.ts` checks both.

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
## Backgrounds and the contrast rule

`resolveDeckBackground(background, palette)` resolves a background against the theme palette of the
mode the deck renders in. The result carries:

- the colors, gradient, pattern or media to draw;
- a **text tone**, light or dark, and its ink;
- an optional scrim;
- `--py-deck-bg*` CSS variables;
- the worst-case contrast, which is always at least 4.5:1 (WCAG AA for body text).

| Preset id | What it is |
| --- | --- |
| `solid-color` (default), `solid-surface`, `solid-primary`, `solid-accent`, `solid-muted`, `solid-inverse` | A theme token as a flat color |
| `gradient-brand`, `gradient-dusk`, `gradient-dawn`, `gradient-forest`, `gradient-mist` | Five gradients of two or three theme tokens |
| `pattern-dots`, `pattern-grid` | The page background with a pattern in the `border` token |

Media are specs, not presets:

- `{ kind: 'image' | 'image-full', src, alt?, fit?, position?, tone?, overlay? }`
- `{ kind: 'video' | 'video-full', src, poster?, position?, tone?, overlay? }`

Video is always muted, looping, inline and autoplaying, so iOS plays it.

**The rule, ported from the developer's site.** Image and video backgrounds get light text over a dark
scrim; `tone: 'light'` declares a light image, which gets dark text over a light scrim. Every
background is checked against what can sit behind the text:

- a solid color;
- a gradient at its stops and in between;
- a pattern's base and ink;
- for media, the worst possible pixel: pure black **and** pure white.

When the background alone is not enough, a scrim is added at the lowest alpha, in 0.05 steps, that
reaches 4.5:1. An author's `overlay` can only strengthen it. Tests hold all 6 built-in themes and the
70-theme library, light and dark, to this.

**The media URL policy** is `checkDeckMediaSrc`. `DeckBackgroundSchema` enforces it, and it allows only:

- relative paths inside the deck, without `..`;
- base64 `data:` URIs of PNG, JPEG, WebP, GIF, AVIF, MP4 or WebM, up to 1.5 M characters;
- library avatars (`avatar:av-012`).

Remote and protocol-relative URLs, `javascript:` and every other scheme, `blob:`, SVG, backslashes and
control or bidirectional characters are refused. This matches the artifact CSP, so there is no remote
media at level 1. There are no iframe backgrounds. Media sources are never written into CSS: renderers
use `<img>` and `<video>`.

The deck schema's `style.background` and `slide.background` hold a preset id today. Media specs are
validated by `DeckBackgroundSchema`, and accepting them in a slide is a schema change still to make.

## Input (pure)

`decideDeckInput(event, state)` turns a key press, a click or a swipe into one action or `null`. The
actions are `next`, `prev`, `first`, `last`, `overview`, `presenter`, `fullscreen`, `blackout`,
`laser`, `help` and `print`. The function never touches the DOM: the renderer passes the event target
as a path of plain facts. `inputPathFrom(event.composedPath(), deckRoot)` builds that path from real
elements.

| Input | Action |
| --- | --- |
| `→` `↓` `Page Down` `Space` / `←` `↑` `Page Up` `Shift+Space` | `next` / `prev` (key repeat allowed) |
| `Home` / `End` | `first` / `last` |
| `O`, `S` or `P`, `F`, `B` or `.`, `L`, `?` | overview, presenter, fullscreen, blackout, laser, help (no key repeat) |
| `Ctrl+P` / `⌘+P` | `print` (the one browser shortcut a deck takes over) |
| `Esc` | Closes what is open, innermost first: help, overview, blackout, laser |
| Primary click on slide content | `next` |
| Touch or pen swipe left / right | `next` / `prev`: at least 50 px, 1.5 times longer horizontally than vertically, under 800 ms |

Guards:

- **Clicks** never advance in these cases:
  - with a modifier, a non-primary button or a text selection;
  - on a link, button, form control, label, summary, `iframe`, `video` or `audio`, a widget role
    (button, tab, slider…) or `contenteditable`;
  - inside an element marked `data-py-deck-interactive` (interactive blocks) or
    `data-py-deck-chrome` (progress bar, slide number);
  - while the overview is open **or closing**. That ports the fix for the Reveal double advance,
    where the click that closed the overview also moved forward.
  - while help, blackout or the laser is on.
- **Keys** are ignored in fields and editable content, during IME composition, and with Ctrl, ⌘ or
  Alt (except print). A focused control keeps its arrows and Space. The overview, help and a
  blacked-out screen accept only their own toggle and `Esc`.
- **Swipes** only count for touch and pen, never mouse drags. Vertical swipes scroll instead of
  navigating.

`DECK_KEY_BINDINGS` lists every binding with a label, for the help overlay.

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
pnpm vitest run packages/decks/tests/quality.test.ts
pnpm --filter @protoyard/decks typecheck
```
