# Decks

Protoyard decks are bounded, data-only presentations rendered by
`@protoyard/decks-ui/app`. A deck uses stable slide IDs; the renderer keeps the
current slide and step in the URL hash as `#/<slide-id>/<step>`, so a copied
link opens the same place without a server or client-side router.

## Navigation

- **Arrow keys** and **Space** advance or go back through authored steps and
  slides. Home and End jump to the first and last visible slide.
- Press **O** to open the overview and select a slide. **Escape** closes an
  open deck overlay.
- Press **F** to enter or leave fullscreen where the browser permits it; the
  browser's fullscreen controls are also available.
- A click on the slide canvas advances. Links, buttons, embedded controls and
  the deck's progress chrome keep their own click behavior.
- On touch devices, a horizontal swipe moves between slides; vertical movement
  remains available to scroll.

Navigation is keyboard usable and honors the browser's reduced-motion
preference. The catalog deck browser checks cover the desktop and mobile
projects, including deep links, guarded interactions, overview, fullscreen,
swipe and reduced-motion preference handling:

```sh
pnpm exec playwright test tests/e2e/deck-navigation.spec.ts
```

The E2E fixture mounts the real DeckApp with the Lumen Launch catalog deck. It
adds three explicit navigation labels to one fixture slide so the test can
verify stable step links and step-before-slide keyboard behavior.

## Authoring

Deck blueprints live in `blueprints/decks/` and declare `kind: "deck"`, a
bounded `deck` object, slides with stable IDs, and optional outline sections.
The layout catalog provides reusable compositions; `layout: "free"` uses
validated content blocks. Read [the deck package guide](../packages/decks/README.md)
for the schema, navigation model, layout props and authoring limits.
Slide decks are `kind: "deck"` blueprints rendered by `@protoyard/decks-ui`
`DeckApp` (ADR-038). Engine types and navigation live in `@protoyard/decks`.
Example fixtures: [`blueprints/decks/`](../blueprints/decks/README.md).

## Visual QA sweep

`scripts/sweep-deck.ts` is the maintained browser sweep for a **built deck
fixture** (SITE_QA). It is separate from authoring lint (`lintDeckStructure`)
and from the general prototype matrix (`pnpm visual:sweep`).

```bash
# Unit tests (no browser)
pnpm vitest run scripts/tests/deck-sweep.test.ts

# Browser sweep — private loopback port (ephemeral unless --port)
pnpm exec tsx scripts/sweep-deck.ts --blueprint blueprints/decks/example.json
pnpm exec tsx scripts/sweep-deck.ts --out tmp/deck-sweep --viewport 1280x720
```

**What it does**

1. Serves a Vite harness that mounts `DeckApp` with the given blueprint.
2. Visits every slide id and step (hash `#/<id>/<step>`).
3. Measures canvas overflow, text size vs `DECK_TEXT_MINIMUMS` (24 / 18 px),
   image completeness / dimensions / alt, fragment index order, and browser
   console / page / request failures.
4. Writes under `tmp/deck-sweep/` (override with `--out`, must stay in `tmp/`):
   - `sweep.json` — machine report (`protoyard.deck-sweep` v1)
   - `index.html` — static contact sheet
   - `shots/*.png` — per visit (skip with `--no-shots`)

**Exit code**

- `0` when there are no **error**-severity issues.
- `1` when any deterministic error is present (overflow, missing image alt or
  dimensions, broken images, navigation failure, console/page/request errors,
  missing deck app root).

**Heuristics (warnings only until calibrated)**

- `font-too-small` — measured CSS px under body/label minima.
- `contrast` — reserved for a calibrated estimator; currently unused in the
  browser measure so reports stay stable.

Authoring lint remains the source of truth for layout props, outline integrity
and asset policy. The sweep does not replace `lintDeckStructure`.
