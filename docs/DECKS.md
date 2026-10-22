# Decks

Slide decks are `kind: "deck"` blueprints rendered by `@protoyard/decks-ui`
`DeckApp` (ADR-038). Engine types and navigation live in `@protoyard/decks`.
Example fixtures: [`blueprints/decks/`](../blueprints/decks/README.md).

## Visual QA sweep

`scripts/sweep-deck.ts` is the maintained browser sweep for a **built deck
fixture** (SITE_QA). It is separate from authoring lint (`lintDeckStructure`)
and from the general prototype matrix (`pnpm visual:sweep`).

```bash
# Unit tests (no browser)
pnpm vitest run tests/scripts/deck-sweep.test.ts

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
