# @protoyard/decks-ui

The Svelte 5 renderer for [`@protoyard/decks`](../decks/README.md)
([ADR-038](../../docs/DECISIONS.md)). It ships one component, `DeckApp`. The
player's deck entry and generated deck prototypes both mount it, so a deck
renders the same at both levels. The presenting surfaces each have their own
lazy subpath, and nothing here is re-exported from the `@protoyard/ui` barrel.

> **Status:** the virtual canvas, catalog layout renderer and `DeckApp` are
> available. Presenter, print and studio surfaces remain later PLAN_005 tasks.

## Subpaths

| Subpath | Contents | Status |
| --- | --- | --- |
| `@protoyard/decks-ui` | `fitDeckCanvas(container, canvas)` → `{ scale, offsetX, offsetY }`: letterboxed scale-to-fit, and scale 0 until the container has a size | available |
| `@protoyard/decks-ui/layouts` | `DeckLayoutRenderer` and `loadLayoutRenderer(layoutId)`: validated catalog rendering through lazy text, media, data and diagram families | available |
| `@protoyard/decks-ui/app` | `DeckApp` — canvas, layouts, hash navigation, guarded input, step chrome, presenting tools (blackout, full screen, laser, copy reference, keyboard help), aria-live | available |
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
- overview overlay and the presenting tools (see below; presenter and print stay later surfaces)

Root attribute: `data-py-deck-app`. Set `syncHash={false}` to own the hash yourself.

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
`onFullscreenChange`) and the components live in `src/chrome/index.ts`. They add 2.4 KB gzip
to the DeckApp entry: 73,996 B before and 76,440 B after, measured with a Vite build of
`@protoyard/decks-ui/app` excluding CSS and themes.

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
