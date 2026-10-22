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
| computed | a bounded data-only expression grammar, type/reference validation and read-time evaluation | `./computed` (opt-in) |
| workflows | data-only states, field guards, role/capability references and deterministic transition checks | `./workflows` (opt-in) |
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
| runtime-definition | a complete `definePrototype`-valid definition plus the app model (`definePrototypeFromBlueprint`) | `.` (the generator stays lazy) |
| csv | RFC 4180 parse/serialize + row validation | `./csv` (lazy) |
| csv-shape | bounded CSV header/sample inference into a reviewable entity draft | `./import/csv-shape` (lazy authoring) |
| json-shape | bounded JSON object/array shape inference into reviewable entity drafts | `./import/json-shape` (lazy authoring) |
| sqlite-schema | bounded SQLite `CREATE TABLE` DDL inference into reviewable entity drafts | `./import/sqlite-schema` (lazy authoring) |
| generator | deterministic worlds (`ctx.rng`, `ctx.faker`, `ctx.ids`, `ctx.time`) | `./generator` (lazy) |
| search | ranked, policy-filtered record search across `searchable` fields (the CRUD search palette) | `./search` |
| identity | content sha256 and `bp-…` storage namespace (`blueprintIdentity`); every shipped blueprint's identity is frozen in `tests/fixtures/identity-golden.json` | `.` |

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
`jsonPath`, the original validation `message` and a concise next step in `hint`. Block and asset
failures map to stable codes such as `unknown-block-type`, `invalid-chart-spec`,
`missing-alt-text`, `unsupported-url-scheme`, `invalid-step-or-fragment-target` and
`duplicate-block-id`. Use `diagnosticsFromBlockIssues(issues, pathPrefix)` to lift
`@protoyard/blocks` parse issues into the same shape under a deck/page/doc path. Validation never
fetches remote assets and never renders untrusted markdown as HTML. `parseBlueprint`
and `safeParseBlueprint` keep their existing behavior. The helper is in the package entry module
and is tree-shakeable for consumers that do not import it.

The helper validates every kind through the shared kind union (`safeParseAnyBlueprint`) and returns
the `kind` it used. An input with no `kind` is an app (the compatibility rule), so existing app
blueprints and their diagnostics are unchanged. A deck, page or doc runs through its strict envelope
and body schema: its diagnostics point into the body, under `$["<kind>"]`, and keys that belong only
to apps get a hint naming the keys that kind accepts. Problems with `kind` itself are reported on
`$["kind"]`: `invalid-kind` (not a string) and `unknown-kind` (needs a newer Protoyard) return
`kind: null`, and `kind-unavailable` names a known kind whose engine this build does not ship yet.

A blueprint has `formatVersion: 1`, a `name`, one or more `entities`, one or more `roles` and
optional `screens`, `brand` and `archetype`. Every object is strict, so unknown keys fail.

## Agent authoring sequence

For an offline end-to-end path, start from a [quick blueprint](../../blueprints/quick/README.md)
or synthesize one with `pnpm protoyard blueprint new <file> --from-brief <brief-file>` (use `-`
for stdin). Read the rationale, edit the JSON, and run `pnpm protoyard blueprint validate <file>`.
For machine-actionable repairs, pass the parsed input to `validateBlueprintForAuthoring`; each
diagnostic provides `jsonPath`, `message` and a suggested `hint`. Revalidate after every repair.
The JSON Schema is useful for editor completion, but only the package parser checks
cross-references such as relation targets, screen fields and archetype entity slots.

If data shape is the starting point, use the lazy import modules documented below to infer entities
from CSV headers and samples, JSON objects, or SQLite `CREATE TABLE` statements. These are schema
imports: drafts and notes do not retain sample values or database rows. Review ambiguous kinds and
relation candidates, combine the entities with roles, scenario defaults, routes and any selected
`archetype`, then validate the assembled blueprint. CSV, JSON and SQLite imports currently expose
package APIs rather than a `protoyard` CLI import command.

Select `assistant`, `team-chat`, `saas-onboarding` or `analytics` in the optional portable
`archetype` block when a matching kit adapter should be available at runtime. The player and
generator consume this data and load declared kit entry points lazily. Standard entity
`screenDefaults` and top-level screens cover common routes; specialized workflows still need
owned Svelte screens and services. The separate `./workflows` module validates state-machine data,
but formatVersion 1 and generated services do not yet persist or execute those workflows. See
[the generator guide](../../docs/GENERATOR.md) for the complete author review, generation and
regeneration loop.

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

The integration contract is checked against each kit's public package export map in
`tests/archetypes/kit-contract.test.ts`: AI archetypes target the AI engine and workspace,
SaaS onboarding uses `saasRoutes`' lazy loader, and analytics selects only the grid and
date-range UI subpaths it declares. The test also checks their callback and simulation
contracts. The blueprint package keeps kit names as validated data and does not depend on
or import the kits. The player's route registry is responsible for loading the selected
screen lazily. `@protoyard/ai-ui` currently exports an assistant workspace but no dedicated
team-chat screen, so the player still needs an adapter or a future UI entry for that screen.

- **Entities:** kebab-case `name` (singular) and `plural`, optional `table`, `fields`,
  `titleField`, `searchable`, `ownerField` (a `persona` field, enables `:own` actions),
  `indexes`, `defaultSort`, optional `screenDefaults`, and `features` (`softDelete`, `audit`,
  `notifications`, `files`, `csv`, all off by default). `screenDefaults.views` can enable
  `list`, `detail` and `form` for that entity; `list.columns` selects visible fields and
  `detail.tabs` selects overview, related and feature-backed sections. When the block is absent,
  the legacy list and detail routes remain. Entity defaults materialize as ordinary screens;
  an explicit top-level screen of the same entity and type takes precedence and is not replaced.
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
Entity screen defaults receive the same field, feature, related-entity and route-collision checks
as top-level screens; errors point back to `entities.<n>.screenDefaults`.

Relations keep their stored direction explicit: the entity declaring a relation owns its
`<field>Id` or `<field>Ids` foreign-key property. `required` means a one relation must contain an
id and a many relation must contain at least one id; when omitted, a one relation is optional
and a many relation may be empty. Related-detail tabs name the target entity; the generated UI finds
the inverse relation field(s) on that entity and uses their declared labels (or field names).
This avoids a second, unsynchronized foreign-key declaration. Relation fields retain the v1
shape and defaults, so existing blueprints and derived stores need no migration.

## JSON Schema

`schema/blueprint.schema.json` (draft 2020-12) gives editors autocompletion: point a
blueprint's `$schema` at it. It describes the shape only; the cross-reference checks above
run in `parseBlueprint`. The package exports it as `@protoyard/blueprint/schema.json` (the
packed package ships it as `dist/schema/blueprint.schema.json`). `protoyard blueprint new`
finds it through that export, from this repository or an installed package, and writes a
relative `$schema`. A test fails when the file is out of date. Regenerate it with:

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

### CSV shape authoring

Shape inference is a separate lazy authoring entry, so player consumers that only
need the row codec do not load it:

```ts
import { inferCsvEntity } from '@protoyard/blueprint/import/csv-shape';

const { entity, notes } = inferCsvEntity(csvText, { entityName: 'invoice' });
```

It normalizes headers into deterministic field names, infers conservative kinds from
at most 100 non-empty rows, and returns a validated entity draft with review notes.
The result never includes imported cell values, enum values, sample-derived limits or
row data. The existing 2 MiB / 10,000-row CSV limits still apply; shape inference also
caps the header at 100 columns, header and sampled cells at 16 KiB each, and sample
inspection at 100 non-empty rows. Caller limits can lower these caps only. Ambiguous columns
remain `text` and are called out in `notes` for author review. Formula-like sample
cells are unguarded only while classifying them and are never returned.

### JSON shape authoring

JSON shape inference is also a separate lazy authoring entry. It accepts one
representative object or an array of objects:

```ts
import { inferJsonShape } from '@protoyard/blueprint/import/json-shape';

const { entities, notes, relationCandidates } = inferJsonShape(jsonText, {
  entityName: 'support-ticket',
});
```

The result is a validated, value-free entity draft. Scalar fields infer
conservative text, number, integer, boolean, email, URL, date or datetime
kinds. Missing and null samples make a field optional; mixed shapes and
unrecognized nested values stay `json` with a review note. A single sample
never marks a field required; multiple samples mark it required only when every
sample has a non-null value. Nested objects are
kept as JSON. Arrays of objects produce related entity drafts and candidate
one-to-many fields, which should be reviewed before generation. Arrays of
strings can become `tags`; enum values and sample limits are never copied.

Input is capped at 2 MiB, 100 sampled objects per entity, 8 levels of nesting,
2,000 object/array nodes, 20,000 total value nodes, 100 fields per object and
16 KiB per string value or key. Prototype-related keys and keys with control or
bidirectional formatting characters are rejected. Higher caller limits are
clamped to these hard caps. Output entity and field
ordering is stable regardless of JSON key insertion order, and notes/errors do
not echo source values.

### SQLite schema authoring

SQLite schema import accepts SQL text and never opens a database, runs a
statement or reads table rows. Import it only while authoring a draft:

```ts
import { importSqliteSchema } from '@protoyard/blueprint/import/sqlite-schema';

const { entities, primaryKeys, notes } = importSqliteSchema(`
  CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE
  );
`);
```

The supported grammar is one or more `CREATE [TEMP|TEMPORARY] TABLE [IF NOT
EXISTS]` declarations with plain or quoted identifiers, comma-separated
columns, optional declared types and column or table `PRIMARY KEY`, `NOT NULL`,
`NULL`, `UNIQUE`, `CHECK`, `DEFAULT`, `COLLATE`, `REFERENCES` and `FOREIGN KEY`
constraints. Foreign keys must reference one local column and one declared
table. `ON DELETE CASCADE`, `SET NULL`, `RESTRICT` and `NO ACTION` map to the
blueprint's delete behavior. Table and target names match case-insensitively.

`INTEGER PRIMARY KEY` maps to Protoyard's generated `id`; other primary-key
fields become required and are listed in `primaryKeys`, since blueprint fields
do not enforce uniqueness. The returned `notes` call out that limitation.
`INT` maps to `integer`; `REAL`, `FLOAT`, `DOUBLE`, `NUMERIC` and `DECIMAL` map
to `number`; character, text and CLOB types map to `text`; `BOOLEAN`, `DATE`,
`DATETIME` and `TIMESTAMP` map to their corresponding blueprint kinds. BLOB
and absent types use conservative reviewable representations. Defaults, checks,
unique constraints and collations do not become behavior; default literals are
discarded. Composite foreign keys, unsupported types and non-CREATE statements
are rejected with a path-aware `SqliteSchemaError`. Input is limited to 256 KiB,
50 tables, 100 columns per table, 40,000 tokens and 8 levels of parenthesis
nesting. Caller limits can lower these caps only. SQL literal values and
database rows never appear in the output or parser diagnostics.

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
  `blueprintGeneratorVersion` lives in a small module (`src/generator-version.ts`, re-exported here)
  so the runtime definition reads it without loading the generator.
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

`blueprintFromBrief(brief, { archetype?, name?, kind? })` turns a short product brief into a
valid blueprint (or content draft), offline and deterministically (same brief, same JSON; no
network or model). Kind dispatch runs first (ADR-036):

1. An explicit `kind` (`app` | `deck` | `page` | `doc`) overrides every cue; unknown kinds throw a
   stable `RangeError`.
2. Strong deck / page / doc cues route to kind-specific synthesizers **before** app archetype
   scoring (generic title/agenda/close or section scaffolding — richer outlines land later).
3. App briefs keep the historical result fields and byte-compatible JSON.

```ts
import { blueprintFromBrief, isAppBriefResult } from '@protoyard/blueprint';

const result = blueprintFromBrief(
  'A dog grooming salon that books appointments, tracks groomers and invoices with amount and due date.'
);
if (isAppBriefResult(result)) {
  // archetype 'booking'; entities appointment, client, groomer, invoice
  const { blueprint, json, archetype, layout, rationale, kindDetection } = result;
}
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

### Kind detection

`detectBriefKind(brief, { kind? })` in `src/brief/kind-detection.ts` decides whether a brief asks
for an `app`, a `deck`, a `page` or a `doc` (ADR-036). It runs before archetype scoring. It is
deterministic and offline, and it matches whole words, longest phrase first. It returns
`{ kind, confidence, ambiguous, reason, cues, suggestion }`. `reason` is one sentence a CLI or UI
can show as is.

- **Strong cues** switch the kind: `slides`, `slide deck`, `pitch deck`, `keynote`,
  `presentation` (deck); `landing page`, `marketing site`, `pricing page`, `microsite` (page);
  `a report`, `quarterly report`, `one-pager`, `whitepaper`, `handbook`, `design doc` (doc). The
  full lists are `KIND_CUES`.
- **Weak cues** (`talk`, `website`, a bare `report`, which is often a verb) only fill
  `suggestion`. The kind stays `app`.
- **App fallback.** The kind stays `app`, with `confidence: 'fallback'` and a reason, in four
  cases: there is no cue; a cue names a tool that makes the content (`slide deck builder`,
  `report generator`); an app noun from `APP_CUES` (`app`, `dashboard`, `platform`, `wiki`…)
  comes before the first strong cue; or two content kinds both have strong cues. The last two
  cases set `ambiguous: true`.
- An explicit `kind` overrides every cue (`confidence: 'explicit'`). An unknown explicit kind
  throws a `RangeError`.

`detectBriefKind` and the content synthesizers (`synthesizeDeckFromBrief`,
`synthesizePageFromBrief`, `synthesizeDocFromBrief`) are exported from `@protoyard/blueprint`.
`blueprintFromBrief` returns `AppBriefResult | ContentBriefResult`; narrow with
`isAppBriefResult` / `isContentBriefResult`. Content drafts carry `kind`, `outline`, `json` and
`rationale` (no app `entities` / `roles`); engine body schemas validate them once wired.

## Workflow state models

`@protoyard/blueprint/workflows` validates a workflow separately from the formatVersion 1
blueprint schema. This keeps the first state model opt-in while the serialized blueprint versioning
and migration path are decided. A workflow binds to an existing enum field; its state ids must be
that enum's values. Transitions name explicit endpoints and can add plain equality guards and a
role/capability authorization reference:

```ts
import {
  checkWorkflowTransition,
  validateWorkflowDefinition,
} from '@protoyard/blueprint/workflows';

const validation = validateWorkflowDefinition(workflowData, parsedBlueprint);
if (validation.valid) {
  const decision = checkWorkflowTransition(validation.workflow, 'open', 'resolved', {
    role: 'agent',
    capabilities: ['ticket:update'],
    record: { priority: 1 },
  });
}
```

Validation checks the initial state, enum values, transition endpoints, guard fields and types,
role references, and that each referenced role has the declared capability. The transition check
is a deterministic, pure decision helper; it does not authorize a database write. Services must
still enforce their normal session policy. Workflows are never JavaScript and are not yet embedded
in blueprint formatVersion 1 or generated services.

Measured workflow subpath: 4.2 KB minified (1.76 KB gzip) with zod external, using esbuild on
`src/workflows/index.ts`. Consumers that do not import `@protoyard/blueprint/workflows` do not load
the transition engine.

## Computed expressions

Computed values use a small JSON AST and are evaluated at read time. They are never stored in a
row, generated as JavaScript or included in storage migrations. Import the opt-in module only
where the consumer needs computed values. The `./computed` package subpath is opt-in:

```ts
import {
  evaluateComputedExpression,
  validateComputedExpression,
} from '@protoyard/blueprint/computed';

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
and `entityLabel` expose the per-screen rules. Generated prototypes and the player
both render this model through `BlueprintApp` (`@protoyard/crud/app`), so the
generator emits no route or layout files. `tests/app-model.test.ts` pins the model of
every catalog blueprint in `tests/__snapshots__/app-model.catalog.json`. The snapshot
was taken when the model was proven byte-identical to the generator's former
`routes.ts` and `layout.ts`, so a change is always a reviewed diff.

`blueprintGeneratorVersion(blueprint)` (synchronous, no Faker) is the world
generator's version. Generated prototypes declare it as `generatorVersion`, and so
does the runtime definition, so a stored world reseeds when the blueprint's
generative surface or the generator SDK changes.

## Runtime definition

`definePrototypeFromBlueprint(blueprint, { namespace, slug?, version? })` builds in
memory what `protoyard generate` writes as files ([ADR-029](../../docs/DECISIONS.md)),
so the player can run a blueprint with no build. It returns
`{ definition, appModel }`; the definition passes `definePrototype`:

- `manifest`: `id` `local.<slug>`, the slug (default: the namespace), the blueprint's
  name, description, category, tags and icon, `defaultScenario: "active"`,
  `defaultTheme` from `brandDefaultThemeId` (`violet` without a brand),
  `preview.layout.id` from the app model, `storage.schemaVersion` from
  `latestSchemaVersion`, and the scenario ids;
- `database.versions` from `deriveDatabaseVersions`, `policy`, `integrity` and the
  default `blueprintScenarios`;
- `themes`: the theme a seed or preset brand builds (a library brand ships by id);
- `generate` loads `./generator` on first use, and `generatorVersion` is
  `blueprintGeneratorVersion`.

`brandDefaultThemeId` is the same function codegen uses for `protoyard.json`.
Measured with Vite 8 (minified, gzip -9) on an entry that imports
`definePrototypeFromBlueprint` from the package entry: about 20.0 KB entry plus a
40.5 KB shared chunk at start, and the generator as a separate 5.5 KB lazy chunk.
`tests/runtime-definition.test.ts` boots the definition on the real runtime
(fake IndexedDB): it seeds every default scenario, keeps created rows across a
reload, and seeds the same world twice for the same seed.

## Tests

Services run on the real runtime with the help desk fixture in
`tests/fixtures/blueprint-prototype.ts`, a prototype whose stores, policy and integrity are
all derived from its blueprint.

```bash
pnpm vitest run packages/blueprint
pnpm --filter @protoyard/blueprint typecheck
```

## Package output

The manifest keeps TypeScript source exports for workspace development. `pnpm build:packages --filter engine` creates the ESM and declaration files under `dist/` that the packed manifest exposes.
