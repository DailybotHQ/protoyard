# Accessibility

Protoyard holds every screen to WCAG 2.1 A and AA. The automated checks run
axe (`@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`)
in real browsers through [`tests/e2e/support/a11y.ts`](../tests/e2e/support/a11y.ts):
serious and critical violations fail a test, and minor and moderate findings
are attached to the report. This guide covers decks, pages and docs. For apps,
templates and the gallery see [TESTING_GUIDE](TESTING_GUIDE.md) and
[STANDARDS](STANDARDS.md).

## Content kinds: decks, pages and docs

[`tests/e2e/content-kinds-a11y.spec.ts`](../tests/e2e/content-kinds-a11y.spec.ts)
opens every example in `blueprints/decks/`, `blueprints/pages/` and
`blueprints/docs/` on the built player's own page for its kind (`deck.html`,
`page.html`, `doc.html`, DevTools off). It runs:

- in the light and the dark color scheme, each with reduced motion on;
- on the desktop (Desktop Chrome) and phone (Pixel 7) projects.

For each example it checks:

| Check | How |
| --- | --- |
| No serious or critical axe violation | axe on the whole page; on a deck, on every slide |
| No horizontal overflow | `scrollWidth` never exceeds `clientWidth` |
| Image alternatives | every `img` has `alt` (empty when decorative) and every `role="img"` a name, unless hidden |
| Form labels | every visible input, select and textarea has an accessible name |
| Visible focus | Tab reaches the document and the focused element draws an outline or ring |
| Navigation | a deck is a named keyboard application that moves through every slide with the arrow keys and announces "Slide n of m"; a page or doc has one `h1`, named navigation landmarks and named links; a doc has a table of contents |
| The scheme and motion took effect | the player's `data-py-mode` follows the color scheme; reduced motion is reported to the page |

```sh
PROTOYARD_E2E_PLAYER=1 pnpm exec playwright test tests/e2e/content-kinds-a11y.spec.ts
```

The spec needs the built player server (`PROTOYARD_E2E_PLAYER=1`, port
`PROTOYARD_E2E_PLAYER_PORT`, default 4861). It serves each blueprint to the
player's `?src=` by request interception, so large decks need no share link and
no file is copied.

**Fixed while adding this coverage:**
- **Dark pages on white.** The player's body used undefined `--background` and
  `--foreground` variables. A deck, page or doc (which sits on the body) showed
  light text on a white page in dark mode. The body now uses the theme tokens.
- **Wrong TOC targets in a doc.** Its table-of-contents ids were stamped on
  every heading element in document order, a callout's title included, so each
  link after a callout landed one heading off. Ids now go only to heading
  blocks (`data-py-block-heading`).

## Deck chrome: toolbar, menus and overlays

The `accessible chrome on desktop and phone` group in
[`tests/e2e/deck-controls.spec.ts`](../tests/e2e/deck-controls.spec.ts) runs on the
built deck fixture (Desktop Chrome and Pixel 7):

| Check | How |
| --- | --- |
| axe in light and dark | the toolbar, a focus tooltip, the More menu (phones), the slide list, the help dialog, the debug panel (`?debug=1`) and the full screen overlay, each open in turn, after their fades finish |
| Keyboard only | Tab from the deck reaches every visible chrome control, each with a 2 px outline ring. The slide list opens on the current slide; arrows, Home and End move; Enter picks; Escape closes and returns focus. The More menu and the help dialog close on Escape and return focus to their opener (to More on a phone) |
| Touch targets | on Pixel 7, every chrome button, the More menu, the slide list options, the help dialog and the debug panel buttons are at least 44 px |
| Reduced motion | with `prefers-reduced-motion: reduce`, no transition or animation inside the deck lasts longer than 1 ms (`themes/base.css` turns them to 0.01 ms) |

```sh
PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/deck-controls.spec.ts
```

**Fixed while adding this coverage:**
- **The slide list had no keyboard model.** It opened with focus left on its
  button, ignored the arrow keys, and Escape did not close it. It now behaves as
  a listbox: focus starts on the current slide, the options use a roving
  tab stop, and the keys it handles never reach the deck.
- **The More menu ignored Escape and stayed open.** Escape now closes it and
  returns focus to More. Choosing an item also closes it, so the next Escape
  closes what the item opened (the overview), not the menu behind it.
- **A tooltip held the first Escape after a click.** A pointer resting on a
  control kept its tooltip open over the slide list, so the first Escape only
  closed the tooltip. Pressing a control now hides its tooltip. A keyboard focus
  tooltip still takes the first Escape on its own (WCAG 1.4.13).
- **"On" was not in the toggle's name.** A pressed toggle (help, laser,
  blackout) showed an "On" chip that its accessible name did not contain (axe
  `label-content-name-mismatch`). The chip is gone; `aria-pressed` and the ring
  and fill of a pressed button carry the state.
- **Two catalog block examples rendered wrong.** A quiz prompt showed its
  Markdown markers (`**tone**`), and a card dropped its image. Quiz prompts and
  explanations now keep bold, italic and code. Card images render under the block
  media policy, with `imageAlt`, or as decorative when there is none.
  `content-kinds-a11y.spec.ts` checks both in the everything deck on the player.

## Other fixes from accessibility checks

- **Notification bell name.** The `NotificationCenter` bell
  (`@protoyard/views-ui/notifications`) showed only its unread count, but its
  accessible name was "Notifications" (axe `label-content-name-mismatch`,
  WCAG 2.5.3). With unread items its name now starts with the visible count:
  "2 unread, Notifications".
- **Deck keyboard focus.** Closing the blackout screen with a click removed the
  focused element, so the deck's keys stopped working. The deck now takes focus
  back whenever focus would land nowhere, and never from a control elsewhere.
  `tests/e2e/deck-presenter.spec.ts` asserts it.

## Honest limits

- Automated checks do not establish visual quality: layout balance, legible
  type at a distance on a projector, or how a theme reads. Review the visual
  sweep screenshots for that: `pnpm visual:sweep` for prototypes, and
  `pnpm exec tsx scripts/sweep-deck.ts --blueprint blueprints/decks/<deck>.json`
  for a built deck's slides.
- axe and these assertions cover what a machine can see. They are not a
  screen-reader test: announcement wording, reading order across a slide's
  steps and the quality of speaker-facing text still need a person.
- The checks run on Chromium only (the CI browser). Safari and Firefox are not
  covered.
- DevTools is off in these runs, so the authoring panel and Deck Studio are not
  part of this coverage.
