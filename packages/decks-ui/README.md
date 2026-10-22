# @protoyard/decks-ui

The Svelte 5 renderer for [`@protoyard/decks`](../decks/README.md)
([ADR-038](../../docs/DECISIONS.md)). It ships one component, `DeckApp`. The
player's deck entry and generated deck prototypes both mount it, so a deck
renders the same at both levels. The presenting surfaces each have their own
lazy subpath, and nothing here is re-exported from the `@protoyard/ui` barrel.

> **Status:** the canvas, layout renderers, `DeckApp` (with overview, presenting tools,
> print and lazy presenter), the print surface and Deck Studio are available. **S** / **P**
> open the presenter (popup when allowed, otherwise an in-page split).

## Subpaths

| Subpath | Exports | Status |
| --- | --- | --- |
| `@protoyard/decks-ui` | `fitDeckCanvas(container, canvas)` returns `{ scale, offsetX, offsetY }`: a letterboxed scale-to-fit, with scale 0 until the container has a size. Also the `DeckCanvasFit` type. | available |
| `@protoyard/decks-ui/app` | `DeckApp`: canvas, layouts, hash navigation, guarded input, step chrome, presenting tools (blackout, full screen, laser, copy reference, keyboard help), print, aria-live, lazy overview (`O`), lazy presenter (`S`/`P`) | available |
| `@protoyard/decks-ui/layouts` | `DeckLayoutRenderer` and `loadLayoutRenderer(layoutId)`: validated catalog rendering through lazy text, media, data and diagram families | available |
| `@protoyard/decks-ui/presenter` | Presenter window over `BroadcastChannel`, with an in-page split fallback (notes, timers, next slide). Loaded only when opened. | available |
| `@protoyard/decks-ui/print` | Print and PDF, one slide per page (`DeckPrint`, `PrintButton`, `print.css`) | available |
| `@protoyard/decks-ui/studio` | Deck Studio: `createDeckStudio`, `deckStudioTab`, a lazy DevTools tab that edits the deck live and exports RFC 6902 patches | available |

`DeckCanvas` is the internal slide viewport used by the app subpath. It keeps
slide layout in virtual canvas pixels (1280×720, 1024×768, 720×1280 or
1080×1080), scales the canvas to its container with `ResizeObserver`, and
mounts only the active slide and its immediate neighbors. CSS centers the
canvas, so image decoding does not change its alignment.

`DeckLayoutRenderer` consumes one `@protoyard/decks` layout id and its props,
validates the props against the layout's schema, and renders that layout's own
slide composition from a lazy family chunk (text, media, data, diagram). Every
composition is a `<section data-py-deck-layout data-py-deck-design>` on the
slide stage. Plain props (titles, labels, numbers) render as text nodes.
Markdown bodies, icons, images, video, avatars, code and charts go through
validated `@protoyard/blocks` blocks, so media policy and safe Markdown stay in
one place. Free slides render their blocks, with a leading heading promoted to
the slide title. Interactive, data and code block roots carry the deck input
guard attribute so their controls do not advance the presentation. See
"Slide design" below and [docs/DECKS.md](../../docs/DECKS.md#slide-design).

The root never statically imports a subpath; `tests/package-shape.test.ts`
enforces it.

## DeckApp

```ts
import { DeckApp } from '@protoyard/decks-ui/app';
import type { Deck } from '@protoyard/decks';

// player entry and generated deck prototypes both mount the same component
```

```svelte
<script lang="ts">
  import { DeckApp } from '@protoyard/decks-ui/app';
  let { deck }: { deck: import('@protoyard/decks').Deck } = $props();
</script>

<DeckApp {deck} />
```

`DeckApp` takes a validated deck and composes:

- `DeckCanvas` (virtual canvas + neighbor mount)
- `DeckLayoutRenderer` per slide (catalog + free)
- pure `createDeckNavigator` with `slidePositionCount` (step 0 plus every step, so the last one is reachable) and `#/<id>/<step>` hash sync
- step reveals: stepped blocks and catalog items stay laid out but hidden, `inert` and `aria-hidden` until their step, then animate in; code highlights move per step (see [Steps on screen](#steps-on-screen))
- guarded keyboard, click and swipe via `decideDeckInput` / `inputPathFrom`
- progress bar and slide-number chrome (`data-py-deck-chrome`)
- `aria-live` announcements (`Slide n of N`) and `aria-roledescription="slide"`
- presenting tools: blackout, full screen, laser, copy slide reference and keyboard help (see below)
- lazy overview grid (see below)
- **S** / **P** opens the presenter (lazy chunk): popup when allowed, otherwise an in-page split with notes, timers and next slide
- print: `?print=1` (optional `&notes=1`), chrome **Print** button, Ctrl/Cmd+P
  / `beforeprint` swap to `DeckPrint` (one page per non-hidden slide, all steps
  revealed, `@page` size = virtual canvas, `print-color-adjust: exact`)

Root attribute: `data-py-deck-app`. Set `syncHash={false}` to own the hash yourself.

### Steps on screen

Each slide is wrapped in `SlideStepHost`, which gives its blocks the current
step through the blocks-ui host (`fragment` and `codeHighlight` callbacks) and
gives catalog layouts a `getPropSteps()` reader.

- **Blocks:** `BlockRenderer` (and `columns`) wrap a block that has a `step`
  in a `data-py-fragment="hidden|shown"` box. Hidden boxes are `invisible`,
  `inert` and `aria-hidden`, so they keep their space and screen readers skip
  them until their step. `fade-up` rises 0.6 em; `grow`, `highlight` and
  `strike` switch on at their step.
- **Catalog items:** cards, process steps, timeline events, comparison rows
  and split sides carry `data-py-fragment-kind="prop"`; `SlideFrame` styles
  them the same way. `DeckLayoutRenderer` strips `step`, `fragment` and
  `reveal` from catalog props before the strict layout schema reads them.
- **Code:** highlight `i` of a block at step `s` shows from authored step
  `s + i`, mapped to the slide's dense steps.
- **Motion:** 500 ms transitions, off under `prefers-reduced-motion` and when
  the deck root has `data-py-deck-motion="none"` (`style.motion: none`).
- **Whole-slide views:** overview thumbnails, print pages and the presenter's
  next-slide preview render each slide at its last step; the slide before the
  current one is mounted at its last step.
- **Styles:** `@protoyard/decks-ui/styles.css` imports
  `@protoyard/blocks-ui/styles.css`, so a deck that imports only the decks-ui
  stylesheet still gets the block and reveal classes.
  `@protoyard/decks-ui/player.css` keeps those block styles and scans only the
  app, layout, chrome, style, overview and print sources; it omits Studio and
  presenter-only utilities for compact deck player hosts.

### Stage and chrome

- **Height.** DeckApp is a column that takes the app height (`h-app`: the
  window, or the device screen inside a shell frame). Pass `fit="container"`
  to fill a parent the host has already sized instead.
- **Stage.** The stage (`data-py-deck-stage`) takes the space the chrome row
  leaves and letterboxes in the theme's `muted` token. The virtual canvas
  (1280×720 for 16:9, 1024×768 for 4:3, 720×1280 for 9:16, 1080×1080 for
  1:1) is out of the flow,
  translated to the fitted offsets and scaled, so it is centered and fully
  visible at every aspect (16:9, 4:3, 9:16, 1:1) and viewport. A
  `ResizeObserver` refits it on resize and orientation changes, with no
  transition.
- **Chrome row.** Progress, the slide counter and the presenting tools are a
  row of their own below the stage (`data-py-deck-chrome-root`). They never
  cover a slide, and on phones the progress bar takes its own line. In full
  screen the chrome is hidden and the stage takes the whole screen.
- **DevTools offset.** While the deck owns the viewport it publishes the
  chrome row's height as `--py-devtools-offset` on `:root`, so the DevTools
  launcher sits above the deck's tools. The property is removed on unmount and
  not set at all with `fit="container"`.
- **Presenter preview.** `DeckSlidePreview` (`./canvas`) renders one slide
  with the same renderer and frame, scaled to its width, inert and hidden from
  assistive tech. The presenter's Next panel uses it.

### Deck style

`deck.style` is applied by `DeckStyleState` (`./style`), which DeckApp creates.
It loads the **style kit** lazily (`style/kit.ts`, which holds the theme
resolution, the palette engine, the library-theme catalog and the background
resolver). The resolved theme variables go on the DeckApp root
(`data-py-deck-theme`, `data-py-deck-mode`, `data-py-deck-style="pending|ready|error"`),
never on `<html>`.

- **Slide frames.** `DeckSlideFrame` paints each slide in the canvas, overview
  and print views with `slide.background ?? style.background`, the text tokens
  that keep it at AA, and the footer (slide number, logo, footer text).
- **Base aliases.** `--font-heading`, `--color-border` and the other base-layer
  aliases are re-declared on the deck root and on each frame, so headings,
  body text and default borders follow the deck's theme.
- **Standalone print.** `DeckPrint` resolves the style itself when it is used
  without DeckApp.
- **Mode.** `mode` is `light` by default, or `dark`.
- **Warnings.** Unknown themes and font pairings fall back with a status note
  (`data-py-deck-style-warning`).

### Keyboard shortcuts

Generated from `DECK_KEY_BINDINGS`, the input guard's own table, which the in-app help dialog also
reads:

<!-- key-bindings:start (generated by packages/decks/tests/readme-sync.test.ts) -->
| Keys | Action | What it does |
| --- | --- | --- |
| `←`, `↑`, `Page Up`, `Shift + Space` | `prev` | Previous step or slide |
| `→`, `↓`, `Page Down`, `Space` | `next` | Next step or slide |
| `Home` | `first` | First slide |
| `End` | `last` | Last slide |
| `O`, `Esc` | `overview` | Overview of all slides |
| `F` | `fullscreen` | Full screen |
| `Esc` | `fullscreen-exit` | Leave full screen |
| `S`, `P` | `presenter` | Presenter view |
| `B`, `.`, `Esc` | `blackout` | Black out the screen |
| `L`, `Esc` | `laser` | Laser pointer |
| `Ctrl + P`, `⌘ + P` | `print` | Print, one slide per page |
| `?`, `Esc` | `help` | Keyboard shortcuts |
<!-- key-bindings:end -->

Clicking slide content advances. A touch or pen swipe left or right moves next or previous: at least
50 px, mainly horizontal, under 800 ms. Clicks and swipes on links, controls, media, interactive blocks
and the chrome never advance (see the input guard in `@protoyard/decks`). The `presenter` action
(`S`, `P`) opens the lazy presenter host: a popup when allowed, otherwise an in-page split
with notes, timers and the next slide (see `@protoyard/decks-ui/presenter`).

### Overview grid (O)

Press **O** to open a lazily loaded overview (`src/overview/`). Thumbnails use
the same `DeckLayoutRenderer` with the final step visible so fragments are not
hidden. The grid is windowed (only nearby thumbs mount) for large decks. Arrow
keys move the selection, **Enter** / click opens that slide **once**, **Esc**
closes without changing the slide. The input guard already ignores click-to-advance
while the overview is open or closing, so a thumbnail never double-advances.

### Presenting tools

Each tool is a key and a real, named button in the chrome toolbar (`src/chrome/`). Toggles
report `aria-pressed`, and the help button reports `aria-expanded`:

| Key | Button | What it does |
| --- | --- | --- |
| `B` or `.` | Black out the screen | A black screen over everything. The screen itself is a button: a click, `B` or `Esc` brings the slide back, and never advances the deck. |
| `F` | Full screen | Puts the deck root in browser full screen with every piece of chrome hidden (progress, slide number, toolbar). `F` or `Esc` leaves. The button is not rendered where the browser has no Fullscreen API. |
| `L` | Laser pointer | A red dot that follows the pointer (and replaces the cursor) until `L` or `Esc`. While it is on, clicks do not advance. |
| — | Copy slide reference | Copies `<title> · <slide-id> · #/<id>/<step>`: the slide title (else the deck title) and the deep link to the exact step. Uses the Clipboard API with an `execCommand` fallback, and announces "Slide reference copied" or "Could not copy the slide reference". |
| `?` | Keyboard shortcuts | A dialog generated from `DECK_KEY_BINDINGS` (the input guard's own table), so it can never drift from the keys. It focuses Close, and `Esc` or `?` closes it. |

The level-1 entry calls the Fullscreen API directly. A level-2 prototype that also wants the
renderer's frame handling can call `enterFullScreen` / `exitFullScreen` from the renderer. The
helpers (`slideReference`, `copyText`, `toggleFullscreen`, `fullscreenAvailable`,
`onFullscreenChange`) and the components live in `src/chrome/index.ts`. They add about 2.4 KB
gzip to the DeckApp entry. With print and the lazy overview also merged, the entry measured
78,501 B gzip on 2026-10-22: a Vite build of `@protoyard/decks-ui/app`, excluding CSS and
themes. Overview, studio and presenter code is not in that first chunk.

## Print (`./print`)

```ts
import { DeckPrint, PrintButton, parseDeckPrintFlags } from '@protoyard/decks-ui/print';
```

`DeckPrint` renders every non-hidden slide at `deckCanvasSize(aspect)` with
`--py-deck-step` set to the final step so fragments are all visible. The
stylesheet declares `@page { size: var(--py-deck-print-width) var(--py-deck-print-height) }`
and `break-after: page`. Speaker notes render under each page when `notes` is
true. Visual PDF QA belongs to SITE_QA; this package proves DOM and CSS structure
(`pnpm vitest run packages/decks-ui/tests/print.test.ts`).

## Untrusted content

Deck strings (titles, props, notes) render as text. decks-ui has no `{@html}`, `innerHTML`,
`insertAdjacentHTML`, `document.write`, `eval` or `new Function`. Load decks from outside with
`loadUntrustedDeck` from `@protoyard/decks`. `tests/hostile-render.test.ts` renders script-, image-
and iframe-shaped strings and checks that no element, event handler or request comes out of them.

## Deck Studio

```ts
import { createDeckStudio, deckStudioTab } from '@protoyard/decks-ui/studio';

const studio = createDeckStudio(deck);          // in-memory edits over the source deck
// Render <DeckApp deck={studio.preview} /> so edits show live, then:
await mountPrototype({ definition, App, target, devtoolsTabs: [deckStudioTab(studio)] });
const stop = studio.followHash();               // slide controls follow #/<slide-id>/<step>
```

The **Deck** tab edits the following:

- **Deck style:** theme or palette seed (choosing one removes the other), font pair, aspect, motion,
  background preset, slide numbers and progress position.
- **The current slide:** layout, background, transition and hidden.
  - Layout choices are only the catalog layouts whose props schema already accepts the slide's
    content (`compatibleLayouts`), so switching never drops content; a free slide stays free.

**Export.** The panel shows the edits as an RFC 6902 JSON Patch for the **source** deck JSON
(`studio.patch`), with **Copy patch** and **Download patch**. If the clipboard is blocked, as in some
artifact sandboxes, the patch is selected so you can copy it yourself.

- Every slide edit starts with a `test` on the slide id, so the patch refuses to apply to a deck
  whose slides moved.
- Applied to the source, the patch gives exactly `studio.preview`. That is validated with `DeckSchema`
  and tested against the blueprint package's independent applier, so `quick iterate` can apply it.
- Edits stay in memory: the studio never writes tables or files.

**Bundle.** The panel is a lazy chunk, loaded only when the tab opens; it measured 3,141 B gzip on
2026-10-22. `createDeckStudio` itself (the patch engine and the theme and font lists) loads with
whatever creates it, so create the studio only when DevTools is on.

## Measured numbers

All gzip level 9 (Node 26.11.1, Vite 8.3.4):

| What | Measured | Gate | Where |
| --- | --- | --- | --- |
| `@protoyard/decks-ui/app` initial JS | 81,979 B (2026-10-22, with step reveals; 80,893 B before them) | ≤ 120 KB | `tests/bundle-size.test.ts`, `tests/budget.test.ts` |
| Deck style kit (lazy chunk: style resolution, library catalog, palette engine, backgrounds) | about 20 KB (2026-10-22) | not in the initial graph | `tests/budget.test.ts` |
| All CSS emitted with it | 1,681 B (2026-10-22) | ≤ 20 KB | `tests/bundle-size.test.ts` |
| Deck Studio panel (lazy chunk) | 3,141 B (2026-10-22) | — | measured with a Vite probe build |
| 200-slide deck: parse + first render (happy-dom) | 50–142 ms over six runs | < 1 s | `tests/large-deck.perf.test.ts` |
| 200-slide deck: one next or previous step, median | 0.27–0.39 ms over six runs | < 16 ms (median and p95) | `tests/large-deck.perf.test.ts` |
| Slides in the DOM at once | 2–3 | ≤ 3 | `tests/large-deck.perf.test.ts` |

- **Lazy surfaces:** layout families, the overview, print and studio code all stay out of the app's
  first chunk; `tests/bundle-hygiene.test.ts` guards that.
- **More detail:** `docs/PERFORMANCE.md` has the full deck sections.

## Known limits

- **Presenter popups may be blocked.** Artifact sandboxes and many browsers block `window.open`.
  When the popup fails or `BroadcastChannel` is missing, `S` / `P` fall back to an in-page split
  presenter (notes, timers, next slide) and never require the popup.
- **No remote media at level 1.** Images and video come only from the deck (relative paths), bounded
  `data:` URIs or library avatars, matching the player and artifact CSP. There are no iframe
  backgrounds.
- **Studio state is not lazy.** `createDeckStudio` loads with whatever creates it. Create it only when
  DevTools is on.
- **Some measurements are happy-dom only.** The 200-slide timings have no layout or paint; real
  browser timings belong to the site's QA budgets.

## Slide design

The type scale (`src/layouts/design/scale.ts`) is in virtual-canvas pixels and
follows the stage width through container query units. Every step clamps to the
deck text minimums (24 px body, 18 px labels):

| Step | On a 1280 px stage | Used for |
| --- | --- | --- |
| `display` | 96 px (56–112) | cover, divider and closing titles |
| `stat` | 192 px (96–220) | the big-stat number |
| `title` | 54 px (40–60) | content slide titles |
| `quote` | 56 px (36–60) | pull quotes |
| `lead` | 33 px (28–36) | subtitles, stat labels, card and step headings |
| `body` | 27 px (24–28) | body copy |
| `label` / `caption` | 19 px (18–20) | eyebrows and meta / captions, sources, credits |

Compositions per layout:

| Layout | Composition |
| --- | --- |
| `title-hero` | accent bar, display title, lead subtitle, meta label, soft primary glows |
| `section-divider` | primary edge band and wash, eyebrow, display title, rule |
| `two-column-split` | two cards (the second accented) with an arrow between; stacks on 9:16 |
| `three-column-cards` | three equal cards with icon tiles; stacks on 9:16 |
| `quote` | pull quote with a large decorative mark and a ruled citation |
| `closing-cta` | centered display title, lead text, one large pill action, footnote |
| `image-left` / `image-right`, `video-left` / `video-right` | media bleeds to one edge and crops (`object-fit: cover`); copy on the other side, in reading order |
| `image-centered` / `video-centered` | framed media stage (`contain`) with title and caption |
| `image-full-bleed` | cover image with a dark, light or no gradient overlay and its caption |
| `team-avatars` | grid of centered cards with large ringed avatars (up to four per row) |
| `big-stat` | dominant stat-scale number, label, context and source |
| `comparison-table` | room-sized table; yes, no and empty cells as marks with screen reader text |
| `chart` | chart on a card. Its data table stays behind the chart's own "View as table" toggle even with `showTable`, and a print-only copy goes on paper |
| `code-with-callout` | code card (stepped highlights kept) beside an accented callout list |
| `process-steps` | numbered markers joined by connectors (3–5 steps); vertical on 9:16 |
| `timeline` | events on an axis with markers; six to eight events split into two axes |
| `free` | the author's blocks under a promoted title |

Content always fits the stage. Titles and copy have line clamps. `fitText`
steps a title's size down to its floor when it would still hide text, and
`fitContent` zooms a content area down to a floor of 0.72 when it would overflow
(`src/layouts/design/fit.ts`). Layouts use theme tokens only (`bg-primary`,
`bg-card`, `text-muted-foreground`…), so deck themes and dark mode apply, and
their backgrounds stay transparent for deck backgrounds. Tests:
`pnpm vitest run packages/decks-ui/tests/layout-design.test.ts`.

## Install in a workspace prototype

Add `"@protoyard/decks-ui": "workspace:*"` to the prototype dependencies. Then
import the styles after Tailwind and the theme/UI styles:

```css
@import '@protoyard/decks-ui/styles.css';
```

## Tests

```bash
pnpm vitest run packages/decks-ui
pnpm vitest run packages/decks-ui/tests/deck-app.test.ts
pnpm vitest run packages/decks-ui/tests/overview.test.ts
pnpm vitest run packages/decks-ui/tests/large-deck.perf.test.ts
pnpm vitest run packages/decks/tests/readme-sync.test.ts   # this README's keyboard table
pnpm --filter @protoyard/decks-ui typecheck
```
