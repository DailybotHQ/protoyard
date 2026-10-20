# @protoyard/blueprint

Data-only blueprints for Protoyard ([ADR-017](../../docs/DECISIONS.md)). A `blueprint.json`
describes a product (entities, fields, relations, roles, screens) without any executable
code. This package validates it and derives what a working prototype needs from it.

Framework-agnostic: it depends on `@protoyard/core`, `@protoyard/scenarios` (generator
helpers), `@protoyard/themes` (brand themes) and zod, and never imports Svelte (ADR-002). The
Svelte CRUD screens live in [`@protoyard/crud`](../crud/README.md). How a blueprint becomes a
prototype (`protoyard generate`, regeneration, drift checks) is in
[docs/GENERATOR.md](../../docs/GENERATOR.md).

## Modules

| Module | Derives | Entry |
| --- | --- | --- |
| schema | the zod schema, JSON Schema and cross-reference checks | `.` |
| computed | a bounded data-only expression grammar, type/reference validation and read-time evaluation | `src/computed/index.ts` (opt-in source entry) |
| archetypes | strict, portable kit archetype declarations and supported entry points | `.` |
| storage | Dexie store strings and integrity rules | `.` |
| migrations | appended database versions; `deriveDatabaseVersions` rebuilds them from `history` | `.` |
| validation | create and update zod input schemas per entity | `.` |
| policy | role capabilities (`<entity>:<action>`) and `:own` record rules | `.` |
| notifications | validated create/update/assignment rules, atomic writes and actor-scoped read state | `.` |
| audit | per-mutation `auditEntries` rows (diff + sensitive redaction) and history reads | `.` |
| files | size/type/quota checked Blob uploads, metadata listing, on-demand reads and removal | `.` |
| brand | a WCAG AA theme from `brand` (`resolveBlueprintBrand`) | `.` |
| services | entity services: `session.assert` → zod → `environment.run` → `db.transaction` | `.` |
| aggregate | count/sum/avg/min/max with groups and UTC date buckets for dashboards and analytics | `.` |
| app-model | routes, navigation rows with icon ids, navigation groups and layout (`deriveAppModel`) | `.` |
| csv | RFC 4180 parse/serialize + row validation | `./csv` (lazy) |
| generator | deterministic worlds (`ctx.rng`, `ctx.faker`, `ctx.ids`, `ctx.time`) | `./generator` (lazy) |
| search | ranked, policy-filtered record search across `searchable` fields (the CRUD search palette) | `./search` |

## The schema

```ts
import {
  parseBlueprint,
  safeParseBlueprint,
  validateBlueprintForAuthoring,
  entityTable,
} from '@protoyard/blueprint';

const blueprint = parseBlueprint(JSON.parse(text)); // throws a ZodError with paths
entityTable(blueprint.entities[0]); // `support-tickets` → `supportTickets` unless `table` is set
```

Agent authoring tools can use `validateBlueprintForAuthoring(input)` for stable JSON paths and
repair hints. Its `valid` flag comes from the complete blueprint parser, including cross-reference
checks; passing the JSON Schema shape alone does not make a blueprint valid:

```ts
const result = validateBlueprintForAuthoring(untrustedJson);
if (!result.valid) {
  for (const diagnostic of result.diagnostics) {
    console.log(diagnostic.jsonPath, diagnostic.message, diagnostic.hint);
  }
}
```

Each diagnostic includes a machine-readable `code`, path segments in `path`, an unambiguous
`jsonPath`, the original validation `message` and a concise next step in `hint`. `parseBlueprint`
and `safeParseBlueprint` keep their existing behavior. The helper is in the package entry module
and is tree-shakeable for consumers that do not import it.

A blueprint has `formatVersion: 1`, a `name`, one or more `entities`, one or more `roles` and
optional `screens`, `brand` and `archetype`. Every object is strict, so unknown keys fail.

- **Brand (optional):** `seed` (`#rrggbb`) and/or built-in `preset` (`violet`, `ocean`, …),
  optional `secondary`, `styleProfile` (`soft` | `crisp` | `flat` | `rounded` | `editorial` |
  `mono`), `font` (catalog id), `radius`, `density`, `id` and `name`.
  `pnpm protoyard generate` turns brand into a WCAG AA theme (`resolveBlueprintBrand`), writes
  hash-headed `src/generated/brand-theme.ts`, registers it on the prototype, and sets
  `defaultTheme`. `libraryTheme` (a theme library id, exclusive with every other theme field)
  skips the module: `defaultTheme` becomes the library id, checked by `brandLibraryThemeId`.
  Without `brand`, the template default theme is kept.
- **Catalog (optional):** the same `catalog` block as a prototype manifest, plus optional
  `tags`, `icon` and `category`. Files under `blueprints/<slug>.json` that set **both**
  `brand` and `catalog` are indexed by `protoyard index` as `kind: blueprint` (see
  [blueprints/README.md](../../blueprints/README.md)).
- **Kit archetype (optional):** portable runtime data for `assistant`, `team-chat`,
  `saas-onboarding` or `analytics`. It maps stable entity slots to entities in this blueprint,
  declares a kit screen and route, records scenario defaults, and lists only allow-listed public
  kit entry points. These strings are validated metadata; parsing never imports or executes them.
  `BlueprintSchema` checks entity references and route collisions. Omitting the block keeps
  ordinary CRUD blueprints unchanged. For example:

  ```json
  {
    "archetype": {
      "id": "assistant",
      "kits": ["@protoyard/ai", "@protoyard/ai-ui"],
      "entities": { "conversations": "conversation", "messages": "message" },
      "screens": [{ "kind": "assistant-workspace", "path": "/assistant" }],
      "scenarioDefaults": { "density": "normal", "activity": "normal" }
    }
  }
  ```

- **Entities:** kebab-case `name` (singular) and `plural`, optional `table`, `fields`,
  `titleField`, `searchable`, `ownerField` (a `persona` field, enables `:own` actions),
  `indexes`, `defaultSort` and `features` (`softDelete`, `audit`, `notifications`, `files`,
  `csv`, all off by default).
- **Field kinds:** `text`, `longText`, `number`, `integer`, `money` (integer cents plus an
  ISO 4217 `currency`, default `USD`), `boolean`, `date`, `datetime`, `enum` (`values`),
  `email`, `url`, `phone`, `tags`, `relation` (`to`, `cardinality` `one|many`, `onDelete`
  `restrict|cascade|nullify`), `persona` (a `py_personas` row), `file` (`accept`,
  `maxSizeBytes`, `multiple`), `json`, `geo` (`region`; stored as `{ lat, lng }` with 5
  decimals, accepted as an object or `"lat, lng"` text, never indexed, searched or sorted)
  and `avatar` (a face from `@protoyard/avatars` stored as its id, `av-001` … `av-175`;
  only library ids validate; never indexed, searched or sorted). `id`, `createdAt`, `updatedAt`, `deletedAt` and
  `deletedBy` are managed by the platform and cannot be declared.
- **Roles:** `permissions` maps an entity name (or `*`) to actions: `read`, `create`,
  `update`, `update:own`, `delete`, `delete:own`, `import`, `export` or `*`.
- **Screens:** `list` (`columns`), `detail` (optional `tabs`: `overview`, `related:<entity>`,
  `activity`, `files`, `audit`), `form`, `board` (`groupBy` an enum, `cardFields`, `sumField`),
  `calendar` (`dateField`, `endField`, `colorBy`, `view`), `timeline` (`startField`,
  `endField`, `groupBy`, `zoom`), `map` (`geoField`, `colorBy`), `analytics` (`dateField`,
  `measures`, `dimensions`), `dashboard` (`widgets`: `kpi`, `chart` line/area/bar/donut,
  `list`, `board-summary`, each with `aggregate` count/sum/avg/min/max, optional `field`,
  `groupBy`, date `bucket` and `filter`; the formatVersion 1 `metrics` still parse) and
  `settings` (`sections`). Every screen takes `path`, `title` and `nav` (`label`, a Lucide
  `icon` from `SCREEN_NAV_ICONS`, `order`, `hidden`). `screenPath(screen, entities)` derives
  default routes (`/<plural>`, `/<plural>/:id`, `/<plural>/new`, `/<plural>/<kind>`,
  `/dashboard`, `/settings`); `dashboardWidgets(screen)` returns legacy metrics as `kpi`
  widgets followed by `widgets`. All keys are additive: `formatVersion` stays `1`.
- **Notifications:** optional top-level rules use `on: 'create' | 'update' | 'assign'`, an
  entity, `notify: 'owner' | 'assignee' | 'role:<name>'`, and a plain-text title with `{field}`
  substitutions. Assignment rules name a persona field. Writes share the entity mutation
  transaction, exclude the actor, and store an empty body for future UI copy.

After the shape is valid, cross-references are checked with path-specific messages, for
example `entities.1.fields.3.to: relation "support-ticket.customer" targets unknown entity
"client"`: relation targets, title and owner fields, enum values and defaults, the reserved
`py_` table prefix, duplicate names, `:own` actions without an owner field, and screens: every
referenced field exists and has the right kind (enum `groupBy`, date fields, numeric
aggregates, `geo` for maps), filter values and ops, chart requirements (donut needs `groupBy`,
line and area need a date bucket), related tabs need a relation back, feature-gated tabs and
settings sections, archetype entity slots, and duplicate or reserved (`/members`) routes.

## JSON Schema

`schema/blueprint.schema.json` (draft 2020-12) gives editors autocompletion: point a
blueprint's `$schema` at it. It describes the shape only; the cross-reference checks above
run in `parseBlueprint`. A test fails when the file is out of date. Regenerate it with:

```bash
pnpm exec tsx -e "import { blueprintJsonSchema } from './packages/blueprint/src/schema.ts'; import { writeFileSync } from 'node:fs'; writeFileSync('packages/blueprint/schema/blueprint.schema.json', JSON.stringify(blueprintJsonSchema(), null, 2) + '\n');" && npx biome format --write packages/blueprint/schema
```

**Size:** measured with esbuild (minified, zod and `@protoyard/core` external) and gzip -9:
about 6.1 KB for parsing (`parseBlueprint`, `entityTable`) with the screen kinds (3.9 KB
before them). `blueprintJsonSchema` tree-shakes away when unused.

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

`protoyard generate` records every storage change in the blueprint's `history` (earlier
blueprints with their schema version and `migrateNext.allowDrop`). `deriveDatabaseVersions`
rebuilds the full version list from that data alone, and `latestSchemaVersion` returns its
tip, which is what generated `src/generated/schema.ts` and the `validate` drift check use:

```ts
import { deriveDatabaseVersions, latestSchemaVersion } from '@protoyard/blueprint';

const versions = deriveDatabaseVersions(blueprint); // v1 from the oldest entry, then each diff
latestSchemaVersion(blueprint); // must equal protoyard.json storage.schemaVersion
```

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
  email, http(s) URLs, phone numbers, tag count and length, library ids for avatars, and
  non-empty ids for relations, personas and files.
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
- A `geo` field is two columns, `<name>Lat` and `<name>Lng` (also matched as `<label> lat` /
  `<label> lng`); import needs both halves or neither.
- An `avatar` field exports its id (`av-007`) and imports only library ids.
- Money and dates go through `deriveInputSchemas` create coercion (`12.50` → 1250 cents).
- Export prefixes with `'` cells starting with `= + - @` (also after leading spaces or full-width), a tab or a carriage return, unless the whole cell is a plain number such as `-5` (spreadsheet formula guard, `guardCsvFormula`). Import strips only a prefix the export would have added, so values round-trip.
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
- `geo` fields get points from `geoPoints()` inside their `region` (default `metro-grid`), one
  point set per entity field, so the same seed gives the same points (generator SDK 2).
- Team personas come from `generateTeam`, so each one carries a seeded library `avatar`
  (`av-NNN`, no repeats until all 175 are used; generator SDK 4).
- `avatar` fields get one seeded face per row from `createAvatarPool` on a fork keyed by
  entity and field, dealing the team's faces last: no repeats within the field until all
  175 are used, more rows keep the earlier faces, and other values do not shift
  (generator SDK 5).

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
`shuffleAvatar`, `bulkUpdate` and `bulkRemove`. `shuffleAvatar(id, field?)` saves the next face
for an avatar field (default: the first) with the same checks as `update` (operation
`<entity>.shuffleAvatar`); the face comes from `nextAvatar(current, '<entity>:<id>:<field>')`,
a deterministic walk with no clock or random source that never repeats the current face and
visits all 175 before any repeat. Entities without an avatar field reject it with a
`ValidationError`. `list` hides soft-deleted rows; `trash` reads the indexed
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

## Brief to blueprint

`blueprintFromBrief(brief, { archetype?, name? })` turns a short product brief into a valid
blueprint, offline and deterministically (same brief, same JSON; no network or model):

```ts
import { blueprintFromBrief } from '@protoyard/blueprint';

const { blueprint, json, archetype, layout, rationale } = blueprintFromBrief(
  'A dog grooming salon that books appointments, tracks groomers and invoices with amount and due date.'
);
// archetype 'booking'; entities appointment, client, groomer, invoice; rationale explains each choice
```

- **Archetype:** keyword scoring over `ARCHETYPES` (help desk, CRM, booking, logistics,
  assistant, team chat, SaaS onboarding, analytics, projects, LMS, clinic, finance, wiki, IoT,
  social and marketplace). The assistant, team-chat, SaaS-onboarding and analytics seeds recognize
  high-signal cues, add their portable config to `blueprint.archetype`, and expose every matched
  cue in the rationale. When equally strong kit cues conflict, synthesis falls back to the generic
  `tracker`; `blueprintFromBrief(..., { archetype })` explicitly overrides scoring. Other
  archetypes retain their earlier-order tie break. A lone stray keyword is not
  enough unless it names an archetype entity; otherwise the brief's main noun becomes the tracker
  entity.
- **Entities:** nouns after verbs such as *track*, *manage*, *log* or *schedule* ("track
  groomers and invoices") become entities linked to the main one; attribute words
  ("locations", "prices") do not.
- **Fields:** "… with amount, due date and status" infers kinds from cue words
  (`fieldFromPhrase`): dates, datetimes, money, numbers, enums, geo, personas, email, phone,
  URL, tags, long text and booleans. Brief-wide cues (a location, a price, a deadline, an
  owner) add a field to the main entity when it lacks that kind.
- **Screens** follow the data: list for every entity, board for a status enum, calendar for
  upcoming dates, timeline for start/end pairs, map for geo, a dashboard at `/`, analytics for
  amounts, a tabbed detail and settings. `protoyard generate` emits lazy route wrappers for
  declared screens; wrappers read the matching config from the runtime blueprint.
- **Faces:** people-like entities (`PEOPLE_ENTITIES`: customer, contact, lead, client,
  patient, student, member, driver, agent, volunteer, follower and similar) get an optional
  `avatar` field labeled Photo (named `photo` when `avatar` is taken).
- Always the roles `owner`, `admin`, `member`, `viewer`; a brand seed picked by name hash from
  the catalog's AA-checked seeds; `layout` is `mobile-tabs` for phone briefs, else `sidebar`.
  This is a suggested layout in the `blueprintFromBrief()` result and can be included as the
  blueprint's top-level `{ "id": "mobile-tabs" }` layout configuration.

It is a heuristic starting point: read the `rationale`, then refine `blueprint.json`.

## Computed expressions

Computed values use a small JSON AST and are evaluated at read time. They are never stored in a
row, generated as JavaScript or included in storage migrations. Import the opt-in module only
where the consumer needs computed values. The source entry is opt-in; a public `./computed`
package export is not part of this task:

```ts
import {
  evaluateComputedExpression,
  validateComputedExpression,
} from './src/computed/index.ts';

const expression = {
  op: 'dateDiff',
  start: { op: 'field', field: 'startedAt' },
  end: { op: 'field', field: 'dueAt' },
  unit: 'days',
};
const check = validateComputedExpression(expression, { sourceEntity, entities });
const result = evaluateComputedExpression(expression, {
  sourceEntity, entities, row, relations,
});
```

The grammar allows scalar literals, scalar field references, numeric `add` / `subtract` /
`multiply` / `divide`, string `concat`, date `dateDiff` and relation `aggregate` (`count`,
`sum`, `avg`, `min`, `max`). Arithmetic accepts number, integer and money fields; `concat`
accepts text-like fields; date differences accept date/datetime fields; aggregates validate the
relation target and the aggregate field kind. `validateComputedExpression` reports the inferred
result type and whether it may be null. Missing field values, empty non-count aggregates,
invalid runtime values and division by zero return `null`; count over an absent relation is zero.
Dates are input as ISO strings or epoch milliseconds, and differences use the requested unit.

`safeParseComputedExpression` and `parseComputedExpression` enforce strict object shapes, a
maximum depth of 32 and at most 256 object/array nodes before recursive parsing. The evaluator
walks only these fixed operators; strings remain literal data and cannot invoke code. This is a
standalone authoring/runtime primitive: the blueprint storage schema and generated prototypes do
not yet declare computed fields.

## Aggregates

`aggregate(rows, spec, entity?)` computes one aggregate in a single pass;
`createAggregateQuery(services, { entity, ...spec })` returns a `liveQuery` querier that reads
through the entity service, so `session.assert('<entity>:read')` applies, and resolves to
`null` when the persona cannot read (like the generated Home counts).

```ts
import { createAggregateQuery } from '@protoyard/blueprint';

const revenue = liveQuery(
  createAggregateQuery(services, {
    entity: 'invoice',
    aggregate: 'sum',
    field: 'amount',
    groupBy: 'status',
    bucket: { field: 'createdAt', unit: 'week' },
    filter: { field: 'status', op: 'in', value: ['paid', 'sent'] },
  }),
  { initial: null }
);
// revenue.current?.series → [{ key: '2026-05-04T00:00:00.000Z|paid', bucket, group, count, value }, …]
```

- `aggregate`: `count` (default), `sum`, `avg`, `min`, `max`. Money sums stay integer cents;
  money and integer averages round to integers; `min`/`max` over dates return epoch ms
  (`valueKind` says `money`, `date` or `number`). `avg`/`min`/`max` over no values are `null`.
- `groupBy`: relations and personas group by id, tags and many-relations count once per
  item, booleans as `'true'`/`'false'`. Enum groups keep the declared order and every value
  appears, even at zero; rows without a value go to `NO_GROUP`, last.
- `bucket`: UTC days, weeks starting Monday, months starting on the 1st, over a date or
  datetime field or `createdAt`/`updatedAt`. Buckets are contiguous between the data's first
  and last bucket, or over `range: { from, to }`; more than `MAX_BUCKETS` (5,000) throws.
- `filter`: `eq`, `in`, `gte`, `lte`; dates compare as instants, array fields match any item.
- Soft-deleted rows are always skipped. Keys (`<bucket|*>|<group|*>`) are stable.

Measured: 10,000 rows grouped by status and bucketed by day in 10.7 ms in Vitest while the
machine was under heavy load (`pnpm vitest run packages/blueprint/tests/aggregate.test.ts`).

## App model

`deriveAppModel(blueprint)` returns the app a blueprint describes as plain data
([ADR-029](../../docs/DECISIONS.md)), with no Svelte or Lucide imports:

- `routes`, in router order. Each has a `name`, `path`, `title` and `description`,
  plus a `view` that says what it renders:
  - `home`: the overview with a count per entity;
  - `members`: workspace people and their simulated roles;
  - `entity`: the entity page (list, create, edit), with the `screenIndex` and
    `screenType` of the `list`, `form` or tab-less `detail` screen that claims it;
  - `screen`: a screen with its own view (board, calendar, timeline, map,
    analytics, dashboard, settings, tabbed detail), with its `screenIndex`,
    `screenType` and a unique `component` id such as `Dashboard1Screen`.
- `nav`: sidebar rows. Home comes first (`exact: true`), then entities without a
  list screen, then visible screens by `nav.order` and blueprint order, then
  Members. Icons are `SCREEN_NAV_ICONS` ids.
- `navGroups`: Overview, Records, Views and Workspace, with empty groups dropped.
- `layout`: `{ id, mobile? }`, `sidebar` by default.
- `icons`: every icon id the navigation may reference.

A later route on the same path replaces an earlier one in place, so a screen can
claim an entity's default list or detail route. `screenNavIcon`, `screenHasOwnView`
and `entityLabel` expose the per-screen rules. The model matches what
`protoyard generate` writes to `src/generated/routes.ts` and `layout.ts` for every
catalog blueprint; `tests/app-model.test.ts` checks this byte for byte.

## Tests

Services run on the real runtime with the help desk fixture in
`tests/fixtures/blueprint-prototype.ts`, a prototype whose stores, policy and integrity are
all derived from its blueprint.

```bash
pnpm vitest run packages/blueprint
pnpm --filter @protoyard/blueprint typecheck
```
