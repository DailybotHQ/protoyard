# @protoyard/decks-ui

The deck host for Protoyard ([ADR-038](../../docs/DECISIONS.md)): `DeckApp`,
the one deck component the player's deck entry and generated deck prototypes
mount. Decks are presented by the [`@texuli/slides`](../../../texuli/packages/slides/README.md)
stage core (`DeckStageCore` from `@texuli/slides/stage-core`, Texuli ADR-009),
the stage without its default renderer tables, which a Protoyard deck never
uses: the fixed canvas, `#/<slide-id>/<step>`
routes, keys, touch, the toolbar (below the slide at the inline end), slide
list, overview, presenter view and window, blackout, laser, help, copy link,
first-visit hint, full screen, transitions and print are the stage's.
DeckApp adds what is Protoyard's own:

- the Protoyard deck shape, migrated to the deck model and prepared once with
  Protoyard's block check (`prepareDeckV2`), so the stage paints it on its
  first render without validating it again;
- Protoyard themes, palette seeds and font pairings (`loadTheme` through
  `@protoyard/decks/style`), and `mode` (`light`/`dark`) as the host
  `data-tx-mode`;
- free slides painted by `@protoyard/blocks-ui`, so interactive blocks keep
  their state in the host's `stateHost`, `embed-app` mounts through the host's
  `mountEmbed`, votes use the host's `viewerId`, and Protoyard-only blocks
  (poll, quiz, calculator, form, flow, terminal, embed-app…) render;
- the generated deck's custom slides (`customSlides`);
- the "Debug for agents" panel (`D` and a toolbar button), Deck Studio, and the
  print page for `?print=1` and the browser's own print (Ctrl/Cmd+P).

## Subpaths

| Import | What it provides |
| --- | --- |
| `@protoyard/decks-ui` | `fitDeckCanvas` (the engine's canvas fit) and its `DeckCanvasFit` type. |
| `@protoyard/decks-ui/app` | `DeckApp` and the custom slide types (`CustomSlideProps`, `CustomSlideComponent`, `CustomSlideLoader`, `CustomSlideRegistry`). |
| `@protoyard/decks-ui/layouts` | `CustomSlideHost`, `customSlideLoader`, `frozenCopy` and the custom slide types. The 20 catalog layouts render on the stage (`@texuli/slides/layouts`). |
| `@protoyard/decks-ui/studio` | Deck Studio: `createDeckStudio`, `deckStudioTab`, `prefixDeckPatch`. |
| `@protoyard/decks-ui/debug` | `DeckDebugPanel`, `BlockOutline`, `deckDebugAvailable`, `debugQueryOn`, `isDevBuild`, `deckFileName`, `downloadText`, `inertJson`. |
| `@protoyard/decks-ui/styles.css`, `./player.css` | The blocks styles (Tailwind sources) for free slides, custom slides and the debug panel. DeckApp imports `@texuli/slides/styles.css` itself. |

## DeckApp

| Prop | Default | What it does |
| --- | --- | --- |
| `deck` | required | A deck that passed `DeckSchema` |
| `syncHash` | `true` | Keep `#/<slide-id>/<step>` in the URL and follow it |
| `autofocus` | `true` | Focus the active slide on mount |
| `namespace` | `deck` | Presenter channel, view transitions and the first-visit hint |
| `mode` | `light` | The deck theme's mode (decks default to light for stable exports) |
| `fit` | `viewport` | `viewport` takes the app height (`h-app`); `container` fills a sized parent |
| `debug` | `auto` | The debug panel: `auto` in dev builds or with `?debug=1`, `on`, `off` |
| `debugSource` | `null` | Where the deck came from, for the agent reference |
| `customSlides` | — | A generated deck's `src/custom-slides.ts` registry |
| `resolveAvatar` | — | Library avatar id → URL (`avatarUrl` from `@protoyard/renderer-svelte`) |

The wrapper keeps `data-py-deck-app`, `data-slide-id` and `data-slide-step`
(they follow the stage's controller, including a deep link's first position),
`data-presenter`, `data-py-deck-theme`, `data-py-deck-mode` and
`data-py-deck-motion` for devtools and e2e. The stage uses the `developer` URL
tier: every deck reaching DeckApp passed Protoyard's stricter offline media
policy, which allows bounded `data:` images the untrusted tier refuses. A
followed hash past a slide's last step is rewritten to that step.

### Free slides

The stage validates free-slide blocks with `@texuli/blocks`, which does not
know Protoyard's block vocabulary, so DeckApp hands each free slide to the
stage as a host (`custom`) slide with the same step count (its own step
labels, then "Step n") and paints the original blocks with
`@protoyard/blocks-ui` (`app/FreeSlide.svelte`). Reveals use the stage's step
machinery (`createDeckStepContext` over the model's step table of the
original slide), so fragments carry `data-tx-deck-fragment` and animate with
the stage's styles; code highlights move per step. A leading unstepped
heading is the slide title; the blocks zoom down to fit the canvas.
The stage's `--tx-*` theme tokens feed Protoyard's blocks inside the slide, so
blocks follow the deck theme and the background's text color.

### Custom slides

`layout: "custom"` slides run the generated deck's own component
(`CustomSlideHost`): `{ slide, step, stepCount, data }` as frozen copies,
errors kept on the slide, clicks never advance the deck. The player (no
registry) and the stage's thumbnails, presenter previews and print show a
labelled card and never run owned code.

### Keyboard shortcuts

Generated from `DECK_KEY_BINDINGS` (the engine's registry, which the stage's
help dialog also reads). With the debug panel available, `D` toggles it and
`Esc` closes it first.

<!-- key-bindings:start (generated by packages/decks/tests/readme-sync.test.ts) -->
| Keys | Action | What it does |
| --- | --- | --- |
| `←`, `↑`, `Page Up`, `Shift + Space`, `Backspace` | `prev` | Previous step or slide |
| `→`, `↓`, `Page Down`, `Space`, `Enter` | `next` | Next step or slide |
| `Home` | `first` | First slide |
| `End` | `last` | Last slide |
| `O`, `Esc` | `overview` | Overview of all slides |
| `F` | `fullscreen` | Full screen |
| `Esc` | `fullscreen-exit` | Leave full screen |
| `S`, `P` | `presenter` | Presenter view |
| `B`, `.`, `Esc` | `blackout` | Black out the screen |
| `L`, `Esc` | `laser` | Laser pointer |
| `Ctrl + P`, `⌘ + P` | `print` | Print, one slide per page |
| `?`, `Esc` | `help` | Controls and shortcuts |
<!-- key-bindings:end -->

### Debug for agents (`D`)

In dev builds, with `?debug=1` or `debug="on"`, the stage's toolbar gains a
"Debug for agents" button (`data-py-deck-tool="debug"`) as its last group,
"More tools" (the stage's `tools` snippet), and `D` toggles the
panel (`data-py-deck-debug`): the slide record, its checks, outlines, and
copy/download actions. It loads on its own chunk (under 12 KB gzip,
`tests/debug-panel.test.ts`).

## Print

The stage's Print button opens `?print=1`, where DeckApp renders the stage's
print view (`DeckPrintView` from `@texuli/slides/export`): one page per
visible slide, notes with `&notes=1`. The browser's own print (Ctrl/Cmd+P)
mounts the same view for paper: its code is preloaded while the browser is
idle after the deck opens (`preloadDeckPrintView`), and the view is mounted on
the first print. That first print captures the page before the view has
settled its themes, images and fonts, so it prints the current slide and says
so; every later print has all the slides. PPTX export is available from `@texuli/slides/export`; no
Protoyard UI calls it yet.

## Deck Studio

A lazy DevTools tab that edits the deck style and the current slide with a
live preview and exports RFC 6902 patches (`@protoyard/decks/patch`).

## Measured numbers

`tests/bundle-size.test.ts` builds the `./app` entry in production
(2026-10-30, npm `@texuli/slides` 0.8.2): 107,246 B gzip initial JavaScript
(cap 111,657 B), 8,914 B first-screen CSS (cap 9,042 B) and 82,210 B of all
emitted CSS (cap 83,381 B). About 27 KB of that CSS is lazy stylesheets of the
stage's default component registry, which Protoyard decks never load: the
print view (`@texuli/slides/export`) still references the default tables, so
the build emits them (reported to Texuli).
The debug panel chunk is 11,179 B gzip.

## Known limits

- Free slides cannot use the deck model's masters, `math` blocks or component
  items; component slides are not part of Protoyard's deck shape yet.
- The stage always installs its default component registry, so its lazy
  painter chunks and CSS are emitted into every deck build.
- Layout strings for assistive tech (comparison "Yes"/"No", chart table
  caption) are English only (the stage's limit).

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
pnpm vitest run packages/decks-ui/tests/fragments.test.ts
pnpm vitest run packages/decks-ui/tests/custom-slides.test.ts
pnpm vitest run packages/decks-ui/tests/bundle-size.test.ts
pnpm vitest run packages/decks/tests/readme-sync.test.ts   # this README's keyboard table
pnpm --filter @protoyard/decks-ui typecheck
```
