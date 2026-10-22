# Deck examples

Fictional `kind: "deck"` blueprints (ADR-036). They live outside the flat
`blueprints/*.json` app catalog, so `protoyard index` and the marketplace never
list them as apps. They have no entities, roles or screens.

| Example | Use case | Highlights |
| --- | --- | --- |
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
