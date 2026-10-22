# @protoyard/decks

The framework-agnostic slide deck engine for Protoyard
([ADR-038](../../docs/DECISIONS.md)). It holds everything about a deck that is
not rendering: the bounded deck schema, the layout catalog, the virtual
canvas, navigation, input decisions, steps and motion, backgrounds and the
contrast rule, style resolution, quality rules, text twins, untrusted loading
and Deck Studio's patch engine. It has no Svelte and does not use Reveal.js.
[`@protoyard/decks-ui`](../decks-ui/README.md) renders it.

This README names every runtime export and states only measured numbers.
`tests/readme-sync.test.ts` keeps three parts generated from the code: the
layout table, the limits table, and the decks-ui keyboard table.

## Exports

| Subpath | Exports |
| --- | --- |
| `@protoyard/decks` | **Canvas:** `DECK_ASPECTS`, `DEFAULT_DECK_ASPECT`, `isDeckAspect`, `deckCanvasSize`, `DECK_TEXT_MINIMUMS`. **Catalog:** `DECK_LAYOUTS`, `DECK_LAYOUT_BY_ID`, `DECK_LAYOUT_IDS`, `LAYOUT_PACING`, `getDeckLayout`, `parseLayoutProps`, `describeLayouts`. **Navigation:** `createDeckNavigator`, `parseDeckHash`, `formatDeckHash`, `defaultSlideStepCount`, `DECK_HASH_ID_MAX`, `DECK_HASH_STEP_MAX`. **Input:** `decideDeckInput`, `inputPathFrom`, `DECK_INPUT_ACTIONS`, `DECK_KEY_BINDINGS`, `DECK_INTERACTIVE_ATTRIBUTE`, `DECK_CHROME_ATTRIBUTE`, `DECK_SWIPE_MIN_DISTANCE`, `DECK_SWIPE_AXIS_RATIO`, `DECK_SWIPE_MAX_DURATION_MS`. **Steps and motion:** `slideSteps`, `slideStepCount`, `slideFragments`, `fragmentPhase`, `activeCodeHighlight`, `FRAGMENT_EFFECTS`, `isFragmentEffect`, `DECK_TRANSITIONS`, `DEFAULT_TRANSITION`, `DEFAULT_MOTION`, `MAX_MOTION_MS`, `REDUCED_FADE_MS`, `resolveSlideTransition`, `resolveDeckTransitions`, `resolveFragmentMotion`, `effectiveMotion`, `prefersReducedMotion`. **Backgrounds:** `resolveDeckBackground`, `DeckBackgroundSchema`, `DeckBackgroundSpecSchema`, `DECK_BACKGROUND_PRESETS`, `DECK_BACKGROUND_PRESET_IDS`, `DECK_GRADIENT_IDS`, `DEFAULT_DECK_BACKGROUND`, `checkDeckMediaSrc`, `DECK_TEXT_CONTRAST_MIN`. **Untrusted input:** `loadUntrustedDeck`, `DEFAULT_UNTRUSTED_DECK_LIMITS`, `stripHiddenCharacters`. Plus the matching types. |
| `@protoyard/decks/schema` | `DeckSchema`, `DeckStyleSchema`, `DeckSlideSchema`, `CatalogSlideSchema`, `FreeSlideSchema`, `DeckOutlineSchema`, `DeckSectionSchema`, `DeckAspectSchema`, `DeckDensitySchema`, `DeckRadiusSchema`, `DeckMotionSchema`, `DeckJsonSchema` (Draft 2020-12), `safeParseDeck`, `DECK_LIMITS`, and the deck types. `@protoyard/blueprint`'s `kind: "deck"` branch validates its body with this schema. |
| `@protoyard/decks/layouts` | The catalog (`DECK_LAYOUTS`, `DECK_LAYOUT_BY_ID`, `DECK_LAYOUT_IDS`, `LAYOUT_PACING`, `getDeckLayout`, `parseLayoutProps`, `describeLayouts`). The entries one by one: `titleHero`, `sectionDivider`, `twoColumnSplit`, `threeColumnCards`, `imageLeft`, `imageRight`, `imageCentered`, `imageFullBleed`, `quote`, `codeWithCallout`, `bigStat`, `comparisonTable`, `processSteps`, `timeline`, `teamAvatars`, `closingCta`, `videoCentered`, `videoLeft`, `videoRight`, `chart`, `free`. Their props schemas: `TitleHeroPropsSchema`, `SectionDividerPropsSchema`, `TwoColumnSplitPropsSchema`, `ThreeColumnCardsPropsSchema`, `ImageSidePropsSchema`, `ImageCenteredPropsSchema`, `ImageFullBleedPropsSchema`, `QuotePropsSchema`, `CodeWithCalloutPropsSchema`, `BigStatPropsSchema`, `ComparisonTablePropsSchema`, `ProcessStepsPropsSchema`, `TimelinePropsSchema`, `TeamAvatarsPropsSchema`, `ClosingCtaPropsSchema`, `VideoCenteredPropsSchema`, `VideoSidePropsSchema`, `ChartLayoutPropsSchema`, `FreeLayoutPropsSchema`, `LayoutImageSchema`, `LayoutVideoSchema`. |
| `@protoyard/decks/style` | `resolveDeckStyle`: a built-in or library theme or a numeric palette seed, a font pairing and the presentation tokens. It returns an `AppearanceInput` for `@protoyard/themes` `applyAppearance`, CSS variables, the effective style and fallback warnings. |
| `@protoyard/decks/quality` | `DECK_QUALITY` thresholds, `DECK_QUALITY_RULES`, `DECK_QUALITY_RULE_BY_ID`, `checkDeckStatic`, `deckJsonPath`. Renderers never import it. |
| `@protoyard/decks/text` | `deckToMarkdown`, `deckOutline`, `formatDeckOutline`, `slideTitle`, `blocksMarkdown`, `chartTable`, `richText`, `mdDocumentToMarkdown`, `escapeText`, `escapeInline`, `stripInvisible`. It is a subpath so the Markdown parser never enters a deck entry. |
| `@protoyard/decks/presenter` | Popup / split-view sync protocol (untrusted messages only): `PRESENTER_MESSAGE_TYPES`, `PresenterMessageSchema`, `parsePresenterMessage`, `presenterMessage`, `presenterChannelName`, `sanitizeNamespace`, `createBroadcastPresenterTransport`, `createMemoryPresenterTransport`, `createPresenterLink`, plus the matching types (`PresenterMessage`, `PresenterMessageType`, `PresenterPosition`, `PresenterTransport`, `PresenterLink`, `PresenterLinkOptions`). Re-exported from `@protoyard/decks`. |
| `@protoyard/decks/patch` | Deck Studio's engine: `applyDeckEdits`, `deckEditsToPatch`, `compatibleLayouts`, `deckStudioOptions`, `DECK_STUDIO_STYLE_KEYS`, `DECK_STUDIO_SLIDE_KEYS`, `applyDeckPatch` (RFC 6902 test, add, replace and remove; prototype keys refused), `DECK_PATCH_MAX_OPS` (1,000), `DeckPatchError`, `parsePointer`, `formatPointer`, `jsonEquals`. It is a subpath so the theme-library listing never enters a deck entry. |

## The deck schema

A deck is `{ style, slides, outline? }`, and every object is strict, so unknown keys fail.

- **Catalog slides** are `{ id, layout, props }`. `layout` must be a catalog id, and `props` must
  pass that layout's schema; see "Loading untrusted decks" below.
- **Free slides** are `{ id, layout: "free", blocks }`, with `@protoyard/blocks` content.
- **Shared slide fields:** `title`, `background` (a preset id), `transition`, `steps` (labels),
  `notes` and `hidden`.
- **Slide ids** are unique lowercase slugs.
- **An outline** groups existing slide ids into sections.
- **`safeParseDeck(value)`** returns the typed deck or issues with a stable `jsonPath` for
  authoring feedback.

<!-- deck-limits:start (generated by packages/decks/tests/readme-sync.test.ts) -->
| `DECK_LIMITS` key | Bounds | Limit |
| --- | --- | ---: |
| `slides` | Slides per deck | 200 |
| `sections` | Outline sections | 200 |
| `sectionSlides` | Slide ids per outline section | 200 |
| `slideTitle` | Slide title characters | 160 |
| `slideNotes` | Speaker notes characters per slide | 2,000 |
| `sectionTitle` | Section and outline title characters | 120 |
| `stepLabel` | Characters per step label | 80 |
| `steps` | Step labels per slide (and steps played separately) | 32 |
| `propsKeys` | Keys per catalog props object | 100 |
| `propsArray` | Items per catalog props array | 200 |
| `propsDepth` | Nesting depth of catalog props | 4 |
| `propsString` | Characters per catalog props string | 2,000 |
| `freeBlocks` | Blocks per free slide | 2,000 |
<!-- deck-limits:end -->

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

There are 21 layouts: the 19 primitives from the developer's deck kit, plus `chart` (a chart
spec through `@protoyard/blocks`) and `free` (validated blocks).

Each entry has `id`, `label`, `useWhen`, `dontUseWhen`, `pacing`
(`punch` \| `idea` \| `diagram` \| `story`), size `limits`, a zod `propsSchema`
and a `sample`. AUTHORING consumes the catalog read-only for selection and
lint. No brand hex values and no site-specific class names.

<!-- layout-catalog:start (generated by packages/decks/tests/readme-sync.test.ts) -->
| Layout | Name | Pacing | Limits | Use when |
| --- | --- | --- | --- | --- |
| `title-hero` | Title hero | punch, story | title ≤ 100 characters; optional subtitle and meta | Opening slide of a deck — title + subtitle + author + event line. |
| `section-divider` | Section divider | punch | title ≤ 120 characters; optional eyebrow | Announcing a new chapter or section in the deck. |
| `two-column-split` | Two-column split | idea, diagram | exactly two columns; body ≤ 600 characters each | Comparing two ideas, before/after, problem/solution, text+text. |
| `three-column-cards` | Three-column cards | idea, diagram | exactly 3 cards | Three parallel concepts (pillars, features, principles). |
| `image-left` | Image left | idea, diagram | one image with alt; body ≤ 600 characters | Walking through a screenshot, photo or diagram with text. |
| `image-right` | Image right | idea, story | one image with alt; body ≤ 600 characters | Same as image-left but text-first reading flow. |
| `image-centered` | Image centered | diagram, punch | one image with alt; optional caption | A single image is the focus — chart, diagram, screenshot with title. |
| `image-full-bleed` | Image full bleed | punch, story | one image with alt; optional caption and credit | Image is the message (hero photo, quote-on-image). |
| `quote` | Quote | punch, story | quote ≤ 280 characters; optional cite | A single short quote that earns the air it takes up. |
| `code-with-callout` | Code with callout | diagram, idea | source ≤ 8,000 characters; 1–6 bullets; ≤ 16 highlight steps | Explaining what a code block does, side-by-side. |
| `big-stat` | Big stat | punch | one number and label; optional context and source | A single number that lands a point — adoption, scale, time saved. |
| `comparison-table` | Comparison table | diagram, idea | 2–4 columns; 3–5 rows; row value counts must match column count | Comparing 2–4 options across 3–5 attributes. |
| `process-steps` | Process steps | idea, diagram | 3–5 steps | A 3–5 step linear process or workflow. |
| `timeline` | Timeline | story, diagram | 4–8 events | 4–8 dated events forming a story arc. |
| `team-avatars` | Team avatars | idea, story | 1–8 people; optional avatar id | Introducing your team or co-presenters. |
| `closing-cta` | Closing CTA | punch, story | one primary CTA link; optional footnote | Final slide — handle, CTA, contact channels. |
| `video-centered` | Video centered | diagram, story | one local/embedded video; optional caption | A single video is the focus — demo, trailer, explainer clip. |
| `video-left` | Video left | idea, diagram | one video; body ≤ 600 characters | Walking through a demo or clip with explanatory text alongside. |
| `video-right` | Video right | idea, story | one video; body ≤ 600 characters | Same as video-left but text-first reading flow. |
| `chart` | Chart | diagram, idea | ChartSpecSchema caps (≤ 366 points, ≤ 8 series); optional data table | A real chart is clearer than a big-stat or table. |
| `free` | Free blocks | idea, diagram, story, punch | 1–48 blocks; full BlockListSchema rules | The catalog has no layout for this idea; compose from @protoyard/blocks. |
<!-- layout-catalog:end -->

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

const slideOverride = { background: 'gradient-dusk', transition: 'slide' };
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
`DeckApp` in decks-ui binds it to the `#/<slide-id>/<step>` hash.

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

## Presenter protocol (pure)

`@protoyard/decks/presenter` (also re-exported from `@protoyard/decks`) is the
popup / split-view sync protocol. Messages are **untrusted**: zod-validated
`{ type, slideId, step }` only (`hello` | `sync` | `request`). Never eval.

```ts
import {
  createMemoryPresenterTransport,
  createPresenterLink,
  parsePresenterMessage,
  presenterChannelName,
} from '@protoyard/decks';

const transport = createMemoryPresenterTransport('my-deck'); // or createBroadcastPresenterTransport
const link = createPresenterLink({
  transport,
  initial: { slideId: 'intro', step: 0 },
  onRemote: (pos) => navigator.goTo(pos.slideId, pos.step),
});
link.publish({ slideId: 'body', step: 0 });
parsePresenterMessage({ type: 'sync', slideId: 'x', step: 0, extra: 1 }); // null
```

Channel names are `protoyard.deck.presenter.v1:<namespace>`. The UI lives in
`@protoyard/decks-ui/presenter` (lazy): try `window.open`, fall back to an
in-page split when the popup is blocked or BroadcastChannel is missing.

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

## Known limits

- **No remote media at level 1.** Background and layout media must be relative paths inside the
  deck, bounded `data:` URIs or library avatars (`checkDeckMediaSrc`). This matches the player and
  artifact CSP. There are no iframe backgrounds.
- **Media backgrounds need a schema change.** `style.background` and `slide.background` accept a
  preset id. Image and video background specs validate with `DeckBackgroundSchema`, but a slide
  cannot carry one yet.
- **Presenter needs a same-origin peer.** The protocol is ready (`@protoyard/decks/presenter`); the UI
  is lazy in `@protoyard/decks-ui/presenter` (popup over `BroadcastChannel`, in-page split when blocked).
  Cross-origin and multi-tab beyond one presenter peer are out of scope at level 1.
- **No KaTeX or math, and no highlight.js.** Code highlighting comes from the blocks tokenizer.
- **Rendered checks need a browser.** `checkDeckStatic` covers structure, assets, steps, notes and
  density; font size, overflow and contrast on real pixels belong to the visual sweep.

## Tests

```bash
pnpm vitest run packages/decks
pnpm vitest run packages/decks/tests/readme-sync.test.ts   # README tables vs the code
pnpm vitest run packages/decks/tests/untrusted.test.ts
pnpm vitest run packages/decks/tests/patch.test.ts
pnpm --filter @protoyard/decks typecheck
```

Regenerate the generated README tables after changing the catalog, limits or key bindings:
`PROTOYARD_UPDATE_README=1 pnpm vitest run packages/decks/tests/readme-sync.test.ts`.
