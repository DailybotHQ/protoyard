# Blocks engine from `@texuli/blocks`

`@protoyard/blocks` consumes Texuli's content-block engines where the public
API matches, and keeps Zod / host adapters where Protoyard decks, pages and
CLI already depend on them.

| Surface | Source |
| --- | --- |
| Code tokenizer + grammars | `@texuli/blocks/code/tokenizer` (+ language resolve from `@texuli/blocks/code`) |
| Diagram layout math | `@texuli/blocks/diagram` |
| Document limits | `@texuli/blocks/core` `BLOCK_LIMITS` |
| Safety (unsafe text, media classify) | `@texuli/blocks/core` |
| Tones / families vocabulary | `@texuli/blocks/core` |

## What still lives here (adapters)

- **Zod block schemas** (`BlockSchema`, `FormBlockSchema`, …) — decks, pages,
  blueprint and CLI validate with Zod. Texuli uses hand parsers.
- **Formula parse + evaluate + Zod** — strict extra-key rejection and
  calculator tooling; AST matches Texuli.
- **Interactive reducers / BlockStateHost** — shared viewer state for decks.
- **Catalog, JSON Schema, icons, text helpers** — richer Protoyard vocabulary
  (form, people, steps, timeline, …).
- **Diagram Zod schemas** — same shapes as Texuli; kept so `BlockSchema` stays
  one union.

## Import paths

Existing imports (`@protoyard/blocks`, `@protoyard/blocks/code`, …) are
unchanged for consumers.
