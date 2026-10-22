# Deck examples

Fictional `kind: "deck"` blueprints (ADR-036). They live outside the flat
`blueprints/*.json` app catalog, so they are never listed as apps. They have no
entities, roles or screens. Back to the [catalog index](../README.md#choose-an-example-by-kind).

| Example | Use case | Highlights |
| --- | --- | --- |
| [Example deck](./example.json) | Visual QA fixture | Minimal three-slide harness for `scripts/sweep-deck.ts` |
| [Harbor Ops pitch](./harbor-ops-pitch.json) | Pitch | Process steps, comparison table, bar chart |
| [Northwind QBR](./northwind-qbr.json) | Quarterly review | Big stat, funnel chart, comparison, free poll |
| [Lumen launch](./lumen-launch.json) | Product launch | Process, three cards, free quiz |
| [Cedar training](./cedar-training.json) | Internal training | Timeline, free counter + poll, code callout |

## Shape

Shared root (`formatVersion`, `name`, `description`, `tags`, optional `brand`)
plus `"kind": "deck"` and one `deck` body:

```json
{
  "formatVersion": 1,
  "kind": "deck",
  "name": "…",
  "deck": {
    "style": { "aspect": "16:9" },
    "slides": [
      { "id": "open", "layout": "title-hero", "props": { "title": "…" } }
    ],
    "outline": {
      "sections": [{ "id": "start", "slideIds": ["open"] }]
    }
  }
}
```

- Slide ids are unique. Outline `slideIds` only reference existing slides and
  cover every slide in order.
- Catalog layouts take typed `props` from `@protoyard/decks/layouts`. The
  `free` layout takes a `blocks[]` list validated by `@protoyard/blocks`.
- Interactive free slides (poll, quiz, counter) are **simulated**: state stays
  in the browser. Copy says so where it matters.
- Fictional data only: `example.com` links, invented metrics labeled as sample
  or placeholder, no remote media, no HTML.

## Status

`pnpm vitest run packages/blueprint/tests/deck-catalog.test.ts` checks every
example:

- kind and root keys; no app-only keys;
- `safeParseAnyBlueprint` / deck body schema;
- `lintDeckStructure` (ids, outline, layouts, fragments);
- free-slide blocks against `@protoyard/blocks`;
- unique slide ids and honest fictional-data heuristics.

## Authoring a deck

1. Copy the example closest to the talk you need (table above).
2. To start from a brief instead, `blueprintFromBrief(brief, { kind: "deck" })`
   in `@protoyard/blueprint` picks one of eight outlines (pitch, qbr, launch,
   status, training, lesson, report, talk), sizes it from "12 slides" or "a
   15-minute talk", and selects layouts from each slide's role. Its slides are
   placeholders marked "Draft:"; replace them with real content. The
   `protoyard blueprint new --from-brief` command makes app blueprints only.
3. Validate the file:

   ```bash
   pnpm protoyard blueprint validate blueprints/decks/northwind-qbr.json
   ```

   It checks the deck body and prints a summary such as "a valid deck
   blueprint: 6 slides". For the deck quality rules (notes, layout repetition,
   words per slide, image alt and size, step order), run `checkDeckStatic`
   from `@protoyard/decks/quality` on the parsed deck.
4. Run `pnpm vitest run packages/blueprint/tests/deck-catalog.test.ts`.

`protoyard generate --blueprint` accepts app blueprints only, so a deck example
cannot be generated into a prototype yet.

## Listing

`protoyard index` scans this folder, but an example is listed (in the registry,
`protoyard list` and the gallery) only when it has a `catalog` block. These
examples have none yet, so `protoyard index` reports each one as invalid ('catalog
blueprints need a "catalog" block') and none is listed. Adding a `catalog`
block (category, product type, features…) is what lists an example.
