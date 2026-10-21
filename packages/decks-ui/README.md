# @protoyard/decks-ui

The Svelte 5 renderer for [`@protoyard/decks`](../decks/README.md)
([ADR-038](../../docs/DECISIONS.md)). It ships one component, `DeckApp`. The
player's deck entry and generated deck prototypes both mount it, so a deck
renders the same at both levels. The presenting surfaces each have their own
lazy subpath, and nothing here is re-exported from the `@protoyard/ui` barrel.

> **Status:** scaffolding. Today the root exports `fitDeckCanvas`, and the four
> subpaths below are reserved: each exists as a package entry but exports
> nothing yet. Later PLAN_005 tasks fill them. This README lists only what
> exists.

## Subpaths

| Subpath | Contents | Status |
| --- | --- | --- |
| `@protoyard/decks-ui` | `fitDeckCanvas(container, canvas)` → `{ scale, offsetX, offsetY }`: letterboxed scale-to-fit, and scale 0 until the container has a size | available |
| `@protoyard/decks-ui/app` | `DeckApp` | reserved (T-decks-deck-app) |
| `@protoyard/decks-ui/presenter` | Presenter window over `BroadcastChannel`, with an in-page fallback | reserved (T-decks-presenter) |
| `@protoyard/decks-ui/print` | Print and PDF, one slide per page | reserved (T-decks-print) |
| `@protoyard/decks-ui/studio` | Deck Studio, a lazy DevTools tab that exports RFC 6902 patches | reserved (T-decks-studio) |
| `@protoyard/decks-ui/styles.css` | Tailwind `@source` for the package | available |

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
