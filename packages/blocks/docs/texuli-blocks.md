# Blocks engine from `@texuli/blocks`

| Surface | Source |
| --- | --- |
| Code tokenizer + grammars | `@texuli/blocks/code/tokenizer` |
| Diagram layout | `@texuli/blocks/diagram` |
| Limits, safety, vocabulary | `@texuli/blocks/core` |
| Formula | `@texuli/blocks/formula` (+ Zod adapters in `formula/zod.ts`) |

## Adapters kept here

- **Zod schemas** — decks/pages/CLI public contract
- **Interactive reducers / BlockStateHost** — shared deck viewer state
- **Catalog, JSON Schema, icons, text helpers** — authoring surface
- **Diagram Zod schemas** — BlockSchema union

Import paths (`@protoyard/blocks`, `@protoyard/blocks/code`, …) are unchanged.
