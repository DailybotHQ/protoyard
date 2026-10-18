# @protoyard/blueprint

Data-only blueprints for Protoyard ([ADR-017](../../docs/DECISIONS.md)). A `blueprint.json`
describes a product (entities, fields, relations, roles, screens) without any executable
code. This package validates it and derives what a working prototype needs from it.

Framework-agnostic: it depends only on `@protoyard/core` and zod and never imports Svelte
(ADR-002). The Svelte CRUD screens live in `@protoyard/crud`.

## Status

Implemented: the blueprint schema (`src/schema.ts`) and its JSON Schema. The derivations are
added by the next PLAN_002 tasks:

| Planned module | Derives |
| --- | --- |
| storage | Dexie store strings and integrity rules |
| migrations | the next appended database version from a blueprint change |
| validation | create and update zod input schemas per entity |
| policy | role capabilities (`<entity>:<action>`) and record rules |
| generator | deterministic worlds (`ctx.rng`, `ctx.faker`, `ctx.ids`, `ctx.time`) |
| services | entity services: `session.assert` → zod → `environment.run` → `db.transaction` |

## The schema

```ts
import { parseBlueprint, safeParseBlueprint, entityTable } from '@protoyard/blueprint';

const blueprint = parseBlueprint(JSON.parse(text)); // throws a ZodError with paths
entityTable(blueprint.entities[0]); // `support-tickets` → `supportTickets` unless `table` is set
```

A blueprint has `formatVersion: 1`, a `name`, one or more `entities`, one or more `roles` and
optional `screens`. Every object is strict, so unknown keys fail.

- **Entities:** kebab-case `name` (singular) and `plural`, optional `table`, `fields`,
  `titleField`, `searchable`, `ownerField` (a `persona` field, enables `:own` actions),
  `indexes`, `defaultSort` and `features` (`softDelete`, `audit`, `notifications`, `files`,
  `csv`, all off by default).
- **Field kinds:** `text`, `longText`, `number`, `integer`, `money` (integer cents plus an
  ISO 4217 `currency`, default `USD`), `boolean`, `date`, `datetime`, `enum` (`values`),
  `email`, `url`, `phone`, `tags`, `relation` (`to`, `cardinality` `one|many`, `onDelete`
  `restrict|cascade|nullify`), `persona` (a `py_personas` row), `file` (`accept`,
  `maxSizeBytes`, `multiple`) and `json`. `id`, `createdAt`, `updatedAt`, `deletedAt` and
  `deletedBy` are managed by the platform and cannot be declared.
- **Roles:** `permissions` maps an entity name (or `*`) to actions: `read`, `create`,
  `update`, `update:own`, `delete`, `delete:own`, `import`, `export` or `*`.
- **Screens:** `list` (`columns`), `detail`, `form`, `board` (`groupBy` an enum field) and
  `dashboard` (`metrics` with `count` or `sum` over a number, integer or money field).

After the shape is valid, cross-references are checked with path-specific messages, for
example `entities.1.fields.3.to: relation "support-ticket.customer" targets unknown entity
"client"`: relation targets, title and owner fields, enum values and defaults, the reserved
`py_` table prefix, duplicate names, `:own` actions without an owner field, board columns and
dashboard sums.

## JSON Schema

`schema/blueprint.schema.json` (draft 2020-12) gives editors autocompletion: point a
blueprint's `$schema` at it. It describes the shape only; the cross-reference checks above
run in `parseBlueprint`. A test fails when the file is out of date. Regenerate it with:

```bash
pnpm exec tsx -e "import { blueprintJsonSchema } from './packages/blueprint/src/schema.ts'; import { writeFileSync } from 'node:fs'; writeFileSync('packages/blueprint/schema/blueprint.schema.json', JSON.stringify(blueprintJsonSchema(), null, 2) + '\n');" && npx biome format --write packages/blueprint/schema
```

**Size:** measured with esbuild (minified, zod external) and gzip -9: about 3.0 KB for
parsing (`parseBlueprint`, `entityTable`) and 3.2 KB for the whole module including
`blueprintJsonSchema`, which tree-shakes away when unused.

## Tests

```bash
pnpm vitest run packages/blueprint
pnpm --filter @protoyard/blueprint typecheck
```
