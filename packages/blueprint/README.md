# @protoyard/blueprint

Data-only blueprints for Protoyard ([ADR-017](../../docs/DECISIONS.md)). A `blueprint.json`
describes a product (entities, fields, relations, roles, screens) without any executable
code. This package validates it and derives what a working prototype needs from it.

Framework-agnostic: it depends only on `@protoyard/core` and zod and never imports Svelte
(ADR-002). The Svelte CRUD screens live in `@protoyard/crud`.

## Status

Implemented: schema, storage, migrations, validation, policy, notifications, audit, file
services and CSV codec. Remaining work lands in later PLAN_002 tasks:

| Module | Derives | Status |
| --- | --- | --- |
| storage | Dexie store strings and integrity rules | done |
| migrations | the next appended database version from a blueprint change | done |
| validation | create and update zod input schemas per entity | done |
| policy | role capabilities (`<entity>:<action>`) and `:own` record rules | done |
| notifications | validated create/update/assignment rules, atomic writes and actor-scoped read state | done |
| audit | per-mutation `auditEntries` rows (diff + sensitive redaction) and history reads | done |
| files | size/type/quota checked Blob uploads, metadata listing, on-demand reads and removal | done |
| csv | RFC 4180 parse/serialize + row validation (`@protoyard/blueprint/csv`) | done |
| generator | deterministic worlds (`ctx.rng`, `ctx.faker`, `ctx.ids`, `ctx.time`) | done |
| services | entity services: `session.assert` → zod → `environment.run` → `db.transaction` | done |

## The schema

```ts
import { parseBlueprint, safeParseBlueprint, entityTable } from '@protoyard/blueprint';

const blueprint = parseBlueprint(JSON.parse(text)); // throws a ZodError with paths
entityTable(blueprint.entities[0]); // `support-tickets` → `supportTickets` unless `table` is set
```

A blueprint has `formatVersion: 1`, a `name`, one or more `entities`, one or more `roles` and
optional `screens` and optional `brand`. Every object is strict, so unknown keys fail.

- **Brand (optional):** `seed` (`#rrggbb`) and/or built-in `preset` (`violet`, `ocean`, …),
  optional `secondary`, `styleProfile` (`soft` | `crisp` | `flat` | `rounded` | `editorial` |
  `mono`), `font` (catalog id), `radius`, `density`, `id` and `name`.
  `pnpm protoyard generate` turns brand into a WCAG AA theme (`resolveBlueprintBrand`), writes
  hash-headed `src/generated/brand-theme.ts`, registers it on the prototype, and sets
  `defaultTheme`. Without `brand`, the template default theme is kept.
- **Catalog (optional):** the same `catalog` block as a prototype manifest, plus optional
  `tags`, `icon` and `category`. Files under `blueprints/<slug>.json` that set **both**
  `brand` and `catalog` are indexed by `protoyard index` as `kind: blueprint` (see
  [blueprints/README.md](../../blueprints/README.md)).

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
- **Notifications:** optional top-level rules use `on: 'create' | 'update' | 'assign'`, an
  entity, `notify: 'owner' | 'assignee' | 'role:<name>'`, and a plain-text title with `{field}`
  substitutions. Assignment rules name a persona field. Writes share the entity mutation
  transaction, exclude the actor, and store an empty body for future UI copy.

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

## Storage derivation

```ts
import { deriveStores, deriveIntegrity, parseBlueprint } from '@protoyard/blueprint';

const blueprint = parseBlueprint(JSON.parse(text));
const stores = deriveStores(blueprint);
// { customers: 'id, *tags, name, createdAt, updatedAt', supportTickets: 'id, customerId, …', … }
const integrity = deriveIntegrity(blueprint);
// { relations: { supportTickets: { customerId: 'customers', assigneeId: 'py_personas' } },
//   timestamps: { supportTickets: ['createdAt', 'updatedAt', 'dueOn', 'deletedAt'] } }
```

`deriveStores` is deterministic (same blueprint → byte-identical JSON) and matches what
`PrototypeDatabase` accepts as Dexie store strings:

- every table starts with `id`
- relation `one` → indexed `<field>Id`; `many` → multi-entry `*<field>Ids`
- persona → indexed `<field>Id` (integrity target `py_personas`)
- tags → multi-entry `*<field>`; file fields → `<field>Id` / `*<field>Ids`
- `indexes`, `titleField` and `defaultSort` add plain indexes when needed
- `createdAt` / `updatedAt` always; `deletedAt` when `features.softDelete`
- when any entity enables `audit` / `notifications` / `files`, shared domain tables
  `auditEntries`, `notifications` and `files` are appended (not `py_*`)

`deriveIntegrity` feeds `validateWorld` from `@protoyard/scenarios`: dangling foreign keys
and out-of-range timestamps fail the scenario load.

## Migrations

```ts
import {
  deriveStores,
  diffBlueprints,
  appendMigration,
  toDatabaseVersion,
} from '@protoyard/blueprint';

const v1 = { version: 1, stores: deriveStores(prev) };
const migration = diffBlueprints(prev, next, {
  fromVersion: 1,
  // allowDrop: true, // required to drop a table or field
  // renamedFrom: { fields: { 'notes.headline': 'title' }, tables: { clients: 'customers' } },
});
// null when nothing changed; otherwise version 2 + stores + serializable ops
const versions = appendMigration([v1], migration);
```

`diffBlueprints` classifies add entity, add field (backfill default), add index, rename via
`renamedFrom`, and drop (`allowDrop` → Dexie store `null`). Upgrade steps are **data**
(`backfill`, `renameField`, `copyTable`) so blueprint history stays JSON; `toDatabaseVersion`
turns them into a Dexie `upgrade` callback. Drops without `allowDrop` throw `MigrationError`
— migrations never delete user data silently.

## Policy derivation

```ts
import { CAPABILITIES, derivePolicy, parseBlueprint } from '@protoyard/blueprint';
import { createPermissionPolicy } from '@protoyard/core';

const blueprint = parseBlueprint(input);
const policy = createPermissionPolicy(derivePolicy(blueprint));
const caps = CAPABILITIES(blueprint);
// UI and services use caps['support-ticket'].read / .deleteOwn / .updateOwn.
```

Role actions become `<entity>:<action>` capabilities. `*` grants are expanded or preserved for the runtime policy, and explicit `-capability` entries remain denials. `update:own` and `delete:own` use the persona id column derived from the entity's `ownerField`. Owner/admin roles receive the platform `members:*` capability for team-management services. These permissions are simulated UI behavior, not security.

## Input validation

```ts
import { parseInput } from '@protoyard/core';
import { deriveInputSchemas } from '@protoyard/blueprint';

const { create, update } = deriveInputSchemas(entity); // built on first use, cached per entity
const row = parseInput(create, formValues); // throws ValidationError { issues: { subject: 'Subject is required' } }
const patch = parseInput(update, { status: 'solved' }); // only keys present are validated and returned
```

- **Keys** are row properties: relation, persona and file fields use `customerId`,
  `relatedIds`, `assigneeId`, `attachmentsIds` (see `inputProperty`); other fields use
  their name. Unknown keys are dropped.
- **Coercion** of form strings: numbers and integers, money (`'12.34'`, `'$1,234.50'` →
  integer cents; plain numbers are already cents and must be integers), booleans (`on`,
  `true`, `1`, `yes`), dates (`YYYY-MM-DD`, real calendar dates), datetimes (ISO with an
  offset, normalized to UTC), comma-separated tags (trimmed, de-duplicated) and JSON text.
- **Checks:** text `minLength`/`maxLength`, number/integer/money `min`/`max`, enum values,
  email, http(s) URLs, phone numbers, tag count and length, and non-empty ids for
  relations, personas and files.
- **Blanks:** on create, a blank or absent optional field becomes its `default`, `false`
  for booleans, `[]` for lists, otherwise `null`. A blank required field fails with
  "<Label> is required" unless it has a default. On update, blanks clear optional fields
  (`null` or `[]`) and fail for required ones.
- **Messages** use the field `label`, or the name in sentence case (`dueOn` → "Due on").

## CSV codec

Lazy entry point — load only when the user opens import/export:

```ts
import {
  parseCsv,
  serializeCsv,
  serializeEntityCsv,
  validateCsv,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
} from '@protoyard/blueprint/csv';

const matrix = parseCsv(text); // RFC 4180: quotes, "", CRLF, BOM
const csv = serializeEntityCsv(entity, rows); // headers = labels; formulas neutralized
const { valid, errors } = validateCsv(entity, text);
// errors: [{ row: 2, field: 'amount', message: '…' }]  (1-based data rows)
```

- Headers match field **name**, input **property** (`customerId`) or **label** (case-insensitive).
- Money and dates go through `deriveInputSchemas` create coercion (`12.50` → 1250 cents).
- Export prefixes cells starting with `= + - @` with `'` (spreadsheet formula guard).
- Hard limits: `CSV_MAX_BYTES` (2 MiB) and `CSV_MAX_ROWS` (10,000 data rows); override per call.

## World generator

Lazy entry so Faker stays out of the initial chunk:

```ts
import { createBlueprintGenerator } from '@protoyard/blueprint/generator';
import { createGenerateContext } from '@protoyard/scenarios';

const { generate, generatorVersion } = createBlueprintGenerator(blueprint);
const world = generate(createGenerateContext(scenario));
// team + entity rows × ctx.scale(), relations in topological order, optional
// auditEntries / notifications history when features are on
```

- Field values use `ctx.faker` / `ctx.rng` / `ctx.time` / `ctx.ids` only (no `Math.random` / `Date.now`).
- Optional `field.fake` must be an allow-listed path such as `company.name` or `person.fullName`.
- Emails always use `example.com` / `example.org`.
- `generatorVersion` mixes a blueprint content hash with the generator SDK and scenarios SDK versions.

## Audit log

When an entity sets `features.audit`, every successful mutation writes one row to the shared
`auditEntries` table **inside the same Dexie transaction** as the row change:

```ts
import { createEntityServices, createAuditService } from '@protoyard/blueprint';

const services = createEntityServices(runtime, blueprint);
const audit = createAuditService(runtime, blueprint);
await services.ticket.update(id, { status: 'solved' });
const history = await audit.listForRecord('ticket', id);
// [{ action: 'update', actorId, at, changes: { status: { before: 'open', after: 'solved' } } }, …]
```

- Diffs list **only changed** input properties; `sensitive` fields store `[redacted]`.
- Failed mutations (validation, permission denied, offline) write **no** audit row.
- Soft delete / restore / purge / bulk ops emit `delete` / `restore` / `purge` / `update` actions.
- `listForRecord` and `listRecent` require `<entity>:read` on an audited entity.

## Entity services

```ts
import { createEntityServices } from '@protoyard/blueprint';

const services = createEntityServices(runtime, blueprint); // one service per entity name
const ticket = await services.ticket.create({ subject: 'Printer jam', customerId });
await services.ticket.update(ticket.id, { status: 'solved' });
const undoToken = await services.customer.remove(customerId); // token only when softDelete is enabled
if (undoToken) await services.customer.restore(undoToken); // restore within the simulated undo window
await services.customer.purge(customerId); // permanently remove trashed rows
```

Each entity gets `list`, `trash`, `get`, `create`, `update`, `remove`, `restore`, `purge`,
`bulkUpdate` and `bulkRemove`. `list` hides soft-deleted rows; `trash` reads the indexed
`deletedAt` values for review. When `features.softDelete` is enabled, `remove` marks the record
and its cascade set with `deletedAt` / `deletedBy` and returns an undo token that works for 30
seconds of simulated time, including after a reload. Restoring also reverses nullified relation
fields. `purge` requires the full `<entity>:delete` capability and permanently removes the trashed
record and its cascade dependents. Entities without soft delete keep hard-delete `remove`; the
explicit `bulkRemove` operation is also permanent and returns the number of removed rows.

Every mutation runs:

1. `session.assert('<entity>:<action>')`. For update and delete, a role with only
   `update:own` / `delete:own` passes when the record's `ownerField` is the actor. A
   denial names the full capability (`ticket:update`). This is simulated policy, not
   security.
2. zod through `deriveInputSchemas` and `parseInput` (field-keyed `ValidationError`).
3. `environment.run('<entity>.<create|update|remove|bulkUpdate|bulkRemove>')`, so
   DevTools latency, offline mode and scoped failures (`failureScope: ['ticket.']`) apply.
4. One `db.transaction('rw', …)` that checks referenced rows exist (relations,
   `py_personas`, files; a missing one fails as `customerId: 'Customer not found'`),
   writes the row with `createdAt`/`updatedAt` from the simulated clock, and applies every
   `onDelete` rule: `cascade` removes dependents recursively (softly for an undoable remove),
   `nullify` clears single references or removes the id from many-relations, and `restrict`
   refuses the whole delete with `EntityInUseError`. A failure at any step writes nothing.

New rows get `createRuntimeId` ids (`support_ticket_u3f9…`) and the actor as owner when
the entity has an `ownerField` and none was given. Updating or deleting a missing id
throws `EntityNotFoundError`. Bulk writes go through `bulkPut` in chunks of `BULK_CHUNK`
(1,000) rows inside the same transaction. Reads (`list`, `get`) need `<entity>:read`, hide
rows with `deletedAt`, sort by `defaultSort` (else `createdAt`), and read IndexedDB
directly without the simulated network, like `liveQuery` reads.

When notification rules are present, matching create and update mutations append notification
rows in that same transaction. Assignment rules fire when the named persona field changes to a
new persona. Rule titles are plain text and interpolate entity fields; the actor never receives
their own notification. `createNotificationService(runtime)` scopes list, unread count and read
state changes to whichever persona is active, so switching persona changes the visible inbox.

Entities with `features.files` can use `createFileServices(runtime, blueprint)`. Uploads validate
the file field's `accept` and `maxSizeBytes`, check the 50 MiB per-prototype default quota and the
runtime storage estimate, then attach the file id and persist binary bytes in the same simulated
service transaction. `list()` returns metadata without a `blob`; `get()` reconstructs a Blob on
demand. JSON snapshots do not preserve file bytes, so users should not rely on snapshots to move
attachments between prototypes. A visible note in the snapshot UI still requires the runtime
snapshot surface to opt in.

Tests run on the real runtime with the help desk fixture in
`tests/fixtures/blueprint-prototype.ts`, a prototype whose stores, policy and integrity
are all derived from its blueprint.

## Tests

```

CSV import/export live on the same service object (capabilities `<entity>:export` /
`<entity>:import`):

```ts
const csv = await services.ticket.exportCsv(); // visible rows, formula-safe
const preview = await services.ticket.importCsv(text); // mode defaults to preview
const committed = await services.ticket.importCsv(text, {
  mode: 'commit',
  skipInvalid: true, // otherwise any invalid row aborts and writes nothing
});
// Relation cells accept a target id or its title. Commit is one transaction
// (bulk chunks of 1,000). Audit rows are written when features.audit is on.
```
bash
pnpm vitest run packages/blueprint
pnpm --filter @protoyard/blueprint typecheck
```
