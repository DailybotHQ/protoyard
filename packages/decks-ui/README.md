# @protoyard/decks-ui

The Svelte 5 renderer for [`@protoyard/decks`](../decks/README.md)
([ADR-038](../../docs/DECISIONS.md)). It ships one component, `DeckApp`. The
player's deck entry and generated deck prototypes both mount it, so a deck
renders the same at both levels. The presenting surfaces each have their own
lazy subpath, and nothing here is re-exported from the `@protoyard/ui` barrel.

> **Status:** the virtual canvas fit helper, canvas component and catalog
> layout renderer are available.
> The `./app`, `./presenter`, `./print` and `./studio` subpaths are reserved for
> later PLAN_005 tasks. This README lists only what exists.

## Subpaths

| Subpath | Contents | Status |
| --- | --- | --- |
| `@protoyard/decks-ui` | `fitDeckCanvas(container, canvas)` → `{ scale, offsetX, offsetY }`: letterboxed scale-to-fit, and scale 0 until the container has a size | available |
| `@protoyard/decks-ui/layouts` | `DeckLayoutRenderer` and `loadLayoutRenderer(layoutId)`: validated catalog rendering through lazy text, media, data and diagram families | available |
| `@protoyard/decks-ui/app` | `DeckApp` | reserved (T-decks-deck-app) |
| `@protoyard/decks-ui/presenter` | Presenter window over `BroadcastChannel`, with an in-page fallback | reserved (T-decks-presenter) |
| `@protoyard/decks-ui/print` | Print and PDF, one slide per page | reserved (T-decks-print) |
| `@protoyard/decks-ui/studio` | Deck Studio, a lazy DevTools tab that exports RFC 6902 patches | reserved (T-decks-studio) |
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

## Install in a workspace prototype

Add `"@protoyard/decks-ui": "workspace:*"` to the prototype dependencies. Then
import the styles after Tailwind and the theme/UI styles:

```css
@import '@protoyard/decks-ui/styles.css';
```

## Tests

```bash
pnpm vitest run packages/decks-ui
pnpm --filter @protoyard/decks-ui typecheck
```
