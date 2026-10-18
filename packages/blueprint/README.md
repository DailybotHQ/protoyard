# @protoyard/blueprint

Data-only blueprints for Protoyard ([ADR-017](../../docs/DECISIONS.md)). A `blueprint.json`
describes a product (entities, fields, relations, roles, screens) without any executable
code. This package validates it and derives what a working prototype needs from it.

Framework-agnostic: it depends only on `@protoyard/core` and zod and never imports Svelte
(ADR-002). The Svelte CRUD screens live in `@protoyard/crud`.

## Status

Scaffold only. Today the entry point exports `BLUEPRINT_FORMAT_VERSION`, the version of the
blueprint document format. The schema and the derivations are added by the next
PLAN_002 tasks:

| Planned module | Derives |
| --- | --- |
| schema | the zod schema and JSON Schema for `blueprint.json` |
| storage | Dexie store strings and integrity rules |
| migrations | the next appended database version from a blueprint change |
| validation | create and update zod input schemas per entity |
| policy | role capabilities (`<entity>:<action>`) and record rules |
| generator | deterministic worlds (`ctx.rng`, `ctx.faker`, `ctx.ids`, `ctx.time`) |
| services | entity services: `session.assert` → zod → `environment.run` → `db.transaction` |

## Tests

```bash
pnpm vitest run packages/blueprint
pnpm --filter @protoyard/blueprint typecheck
```
