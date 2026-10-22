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
