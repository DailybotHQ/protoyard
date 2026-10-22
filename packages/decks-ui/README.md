# @protoyard/decks-ui

The Svelte 5 renderer for [`@protoyard/decks`](../decks/README.md)
([ADR-038](../../docs/DECISIONS.md)). It ships one component, `DeckApp`. The
player's deck entry and generated deck prototypes both mount it, so a deck
renders the same at both levels. The presenting surfaces each have their own
lazy subpath, and nothing here is re-exported from the `@protoyard/ui` barrel.

> **Status:** the virtual canvas, catalog layout renderer and `DeckApp` are
> available. Presenter and print surfaces remain later PLAN_005 tasks.

## Subpaths

| Subpath | Contents | Status |
| --- | --- | --- |
| `@protoyard/decks-ui` | `fitDeckCanvas(container, canvas)` → `{ scale, offsetX, offsetY }`: letterboxed scale-to-fit, and scale 0 until the container has a size | available |
| `@protoyard/decks-ui/layouts` | `DeckLayoutRenderer` and `loadLayoutRenderer(layoutId)`: validated catalog rendering through lazy text, media, data and diagram families | available |
| `@protoyard/decks-ui/app` | `DeckApp` — canvas, layouts, hash navigation, guarded input, step chrome, aria-live | available |
| `@protoyard/decks-ui/presenter` | Presenter window over `BroadcastChannel`, with an in-page fallback | reserved (T-decks-presenter) |
| `@protoyard/decks-ui/print` | Print and PDF, one slide per page | reserved (T-decks-print) |
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
- blackout, overview and help overlays (presenter/print stay later surfaces)

Root attribute: `data-py-deck-app`. Set `syncHash={false}` to own the hash yourself.
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
pnpm --filter @protoyard/decks-ui typecheck
```
