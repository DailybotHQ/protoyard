# @protoyard/decks-ui

The Svelte 5 renderer for [`@protoyard/decks`](../decks/README.md)
([ADR-038](../../docs/DECISIONS.md)). It ships one component, `DeckApp`. The
player's deck entry and generated deck prototypes both mount it, so a deck
renders the same at both levels. The presenting surfaces each have their own
lazy subpath, and nothing here is re-exported from the `@protoyard/ui` barrel.

> **Status:** the virtual canvas, catalog layout renderer, `DeckApp` and
> **print** surface are available. Presenter and studio remain later PLAN_005
> tasks.
> **Status:** the virtual canvas, catalog layout renderer and `DeckApp` are
> available. Presenter and print surfaces remain later PLAN_005 tasks.

## Subpaths

| Subpath | Contents | Status |
| --- | --- | --- |
| `@protoyard/decks-ui` | `fitDeckCanvas(container, canvas)` → `{ scale, offsetX, offsetY }`: letterboxed scale-to-fit, and scale 0 until the container has a size | available |
| `@protoyard/decks-ui/layouts` | `DeckLayoutRenderer` and `loadLayoutRenderer(layoutId)`: validated catalog rendering through lazy text, media, data and diagram families | available |
| `@protoyard/decks-ui/app` | `DeckApp` — canvas, layouts, hash navigation, guarded input, step chrome, presenting tools (blackout, full screen, laser, copy reference, keyboard help), print, aria-live, lazy overview (O) | available |
| `@protoyard/decks-ui/presenter` | Presenter window over `BroadcastChannel`, with an in-page fallback | reserved (T-decks-presenter) |
| `@protoyard/decks-ui/print` | Print and PDF, one slide per page (`DeckPrint`, `PrintButton`, `print.css`) | **available** (T-decks-print) |
| `@protoyard/decks-ui/studio` | Deck Studio: `createDeckStudio`, `deckStudioTab`, a lazy DevTools tab that edits the deck live and exports RFC 6902 patches | available |
| `@protoyard/decks-ui/styles.css` | Tailwind `@source` for the package | available |

`DeckCanvas` is the internal slide viewport used by the app subpath. It keeps
slide layout in virtual canvas pixels (1280×720, 1024×768, 720×1280 or
1080×1080), scales the canvas to its container with `ResizeObserver`, and
mounts only the active slide and its immediate neighbors. CSS centers the
canvas, so image decoding does not change its alignment.

`DeckLayoutRenderer` consumes one `@protoyard/decks` layout id and its props.
It validates the layout props and the composed block list before rendering
through `@protoyard/blocks-ui`; free layouts use the same bounded block
renderer. Each catalog id resolves to a lazy family chunk. Body content has a
24 px minimum and labels an 18 px minimum in virtual canvas pixels. Interactive,
data and code block roots carry the deck input guard attribute so their
controls do not advance the presentation.

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
- pure `createDeckNavigator` with `slideStepCount` and `#/<id>/<step>` hash sync
- guarded keyboard, click and swipe via `decideDeckInput` / `inputPathFrom`
- progress bar and slide-number chrome (`data-py-deck-chrome`)
- `aria-live` announcements (`Slide n of N`) and `aria-roledescription="slide"`
- presenting tools: blackout, full screen, laser, copy slide reference and keyboard help (see below)
- lazy overview grid (see below)
- print: `?print=1` (optional `&notes=1`), chrome **Print** button, Ctrl/Cmd+P
  / `beforeprint` swap to `DeckPrint` (one page per non-hidden slide, all steps
  revealed, `@page` size = virtual canvas, `print-color-adjust: exact`)

Root attribute: `data-py-deck-app`. Set `syncHash={false}` to own the hash yourself.

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
pnpm --filter @protoyard/decks-ui typecheck
```
