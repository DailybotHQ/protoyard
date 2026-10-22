# Generator: blueprints to prototypes

A **blueprint** is a data-only JSON description of a product: entities with typed
fields and relations, roles with per-entity actions, screens, notification rules
and optional branding. `pnpm protoyard generate` turns one into a working
prototype: a versioned Dexie schema, a capability policy, entity services,
deterministic scenario data and lazily loaded CRUD screens. You then add the
hand-written screens that make it feel like the real product.

Everything stays a simulation, as everywhere in Protoyard. Data lives in the
browser, roles are UX and not security, and all generated data is fictional.
The decision is recorded in [ADR-017](DECISIONS.md#adr-017--data-only-blueprints-generate-prototypes).

## Pieces

| Piece | Role |
| --- | --- |
| [`@protoyard/blueprint`](../packages/blueprint/README.md) | Framework-agnostic. The zod schema and JSON Schema, plus the derivations: stores and integrity, migrations, input validation, policy, generator and entity services (`session.assert` → zod → `environment.run` → `db.transaction`). |
| [`@protoyard/crud`](../packages/crud/README.md) | Svelte CRUD kit: `EntityList`, `EntityForm`, `EntityDetail`, `RelationPicker`, `NotificationsBell`, `MembersScreen`. |
| `templates/crud-app` | The base template `generate` copies: an `App.svelte` that renders the shared `BlueprintApp` shell from `@protoyard/crud/app`, the scenarios, the stylesheet and the spec docs. |
| `protoyard generate` / `protoyard blueprint validate` | CLI commands that validate, generate, regenerate and check drift. |
| [`blueprints/`](../blueprints/README.md) | A catalog of branded example blueprints you can generate from. |
| [`blueprints/quick/`](../blueprints/quick/README.md) | Compact archetype starters with kit, route, source-size and validation-exercise metadata. |

## The loop

```bash
# 0. (Optional) Start from a product brief instead of writing JSON by hand
echo "A salon that books appointments and tracks invoices with amount" \
  | pnpm protoyard blueprint new prototypes/my-desk.blueprint.json --from-brief -

# 1. Check the blueprint (exit 4 lists every issue with its path)
pnpm protoyard blueprint validate prototypes/helpdesk-demo/blueprint.json

# 2. See what would be written (nothing is written)
pnpm protoyard generate my-desk --blueprint prototypes/helpdesk-demo/blueprint.json --dry-run

# 3. Generate, install, fill the spec docs (AGENTS.md, docs/)
pnpm protoyard generate my-desk --blueprint prototypes/helpdesk-demo/blueprint.json

# 4. Run it, test it, gate it
pnpm protoyard dev my-desk
pnpm vitest run prototypes/my-desk
pnpm protoyard validate my-desk --build

# 5. Change the blueprint in place, then regenerate
pnpm protoyard generate my-desk --blueprint prototypes/my-desk/blueprint.json
```

`blueprint new <file>` writes a validated blueprint from a brief, offline and
deterministically (`blueprintFromBrief` in `@protoyard/blueprint`), and prints
why it chose each archetype, entity, field and screen. People-like entities
(customers, contacts, clients, patients, students, members, drivers, agents,
volunteers and similar) get an optional `avatar` field labeled Photo. The brief comes from
`--from-brief <file>`, from stdin with `--from-brief -`, or from seven questions
with `--interactive` (terminal only). `--archetype <id>` and `--name` steer it;
`--generate <slug>` chains into `generate` (add `--dry-run` to plan only: then
nothing is written at all). It never writes outside the workspace, never
writes workspace config (`package.json`, `protoyard.json`, `biome.json`,
`tsconfig*.json`), `.protoyard/`, `node_modules/`, `src/generated/` or a
symbolic link, and with `--force` it replaces an existing file only when that
file already is a valid blueprint.

Every command accepts `--json` and returns `{ ok, command, data?, error? }`.
`generate` exits with 0 on success, 1 on a conflict (an existing prototype it did
not generate, or hand-edited generated files), 2 for usage errors, 3 when the
blueprint file is missing and 4 when the blueprint is invalid or a regeneration
would lose data.

For a JSON editor with autocompletion, set `"$schema"` to
`packages/blueprint/schema/blueprint.schema.json` (relative to the file). The
JSON Schema covers the shape; the cross-reference checks run in `parseBlueprint`. Agent
authoring tools can call `validateBlueprintForAuthoring(input)` from
`@protoyard/blueprint` to get a full validity flag and diagnostics with JSON paths and repair
hints. The result uses `BlueprintSchema`, so a shape-only JSON Schema pass is not reported as
full blueprint validity. Existing `parseBlueprint` and `safeParseBlueprint` behavior is
unchanged.

## Agent authoring loop

The distributable skill walks agents through this loop in its
[`protoyard-new` flow](../skills/protoyard/new/SKILL.md), with a
[blueprint reference](../skills/protoyard/references/blueprints.md) that maps
this page.

Keep the blueprint as the source of truth and make each generated result reviewable. Brief
synthesis, validation and shape imports run locally. Pass `--no-install` to generation when the
workspace dependencies are already linked and the loop must not invoke a package install:

```bash
# Let the local synthesizer draft a blueprint.
printf '%s\n' 'A fictional team assistant that organizes conversations and messages.' \
  | pnpm protoyard blueprint new tmp/my-assistant.blueprint.json --from-brief - --dry-run

# After reviewing the rationale, write the synthesized draft and check it.
printf '%s\n' 'A fictional team assistant that organizes conversations and messages.' \
  | pnpm protoyard blueprint new tmp/my-assistant.blueprint.json --from-brief -
pnpm protoyard blueprint validate tmp/my-assistant.blueprint.json

# Review planned paths first, then generate when the draft is ready.
pnpm protoyard generate my-assistant --blueprint tmp/my-assistant.blueprint.json --dry-run --no-install
pnpm protoyard generate my-assistant --blueprint tmp/my-assistant.blueprint.json --no-install
```

When the idea started as a `protoyard quick` exploration, `pnpm protoyard quick promote
<exploration> <slug>` runs the same generation from its blueprint and checks the result is the
same app ([Promoting a quick exploration](#promoting-a-quick-exploration)).

For hand-authored JSON, use the exported [JSON Schema](../packages/blueprint/schema/blueprint.schema.json)
for editor completion, then run `blueprint validate`: the schema checks shape, while the package
parser also checks entity, field, route and archetype references. For agent interfaces that need
machine-readable repair steps, call `validateBlueprintForAuthoring(input)` and show each
diagnostic's `jsonPath`, `message` and `hint`; apply a focused edit and validate again. The CLI
reports issues but does not expose that helper's hint structure.

When an idea starts from existing data or a database definition, the package's lazy authoring
modules infer a value-free draft: `inferCsvEntity` from `@protoyard/blueprint/import/csv-shape`,
`inferJsonShape` from `@protoyard/blueprint/import/json-shape`, or `importSqliteSchema` from
`@protoyard/blueprint/import/sqlite-schema`. Review their notes and inferred relations; JSON shape
inference also returns relation candidates, while SQLite imports map supported foreign keys. Add
the draft entities to a complete blueprint with roles and screens, then validate it. Imports inspect
shape only; they do not copy rows, SQL defaults or sample values. See the runnable interface
examples and parser limits in the
[blueprint package guide](../packages/blueprint/README.md).

Choose `blueprint.archetype` when an assistant, team-chat, SaaS-onboarding or analytics kit adapter
is part of the first experience. The portable block maps entity slots, screens, scenario defaults
and allow-listed lazy kit entry points; it is metadata, never executable code. Start from the
[quick catalog](../blueprints/quick/README.md) when one of its compact examples fits, or use
`blueprint new --archetype <id>` to steer brief synthesis.

Declare common list, detail, form and kit-backed views in the blueprint, including per-entity
`screenDefaults`, so both the player and generated prototypes can render them from data. The
optional `@protoyard/blueprint/workflows` module validates a data-only state model separately; it
is not embedded in formatVersion 1 or wired into generated services. Product-specific transitions,
multi-step interactions and screens therefore still belong in owned Svelte files and services.
Never edit `src/generated/**`: refine the blueprint and regenerate, then add custom behavior in
owned files that call the generated entity services. Use
[From a brief to a prototype](BRIEF_TO_PROTOTYPE.md) for the full review, test and export path.

## The blueprint format

A blueprint is strict: an unknown key anywhere fails validation.

```json
{
  "$schema": "../../packages/blueprint/schema/blueprint.schema.json",
  "formatVersion": 1,
  "name": "Beacon Help Desk",
  "description": "Customers, tickets with SLAs and replies.",
  "entities": [ … ],
  "roles": [ … ],
  "notifications": [ … ],
  "screens": [ … ]
}
```

| Top-level key | Required | Meaning |
| --- | --- | --- |
| `formatVersion` | yes | Always `1`. |
| `kind` | no | `app` (the default when missing), `deck`, `page` or `doc`. See [Blueprint kinds](#blueprint-kinds). |
| `name` | yes | Up to 80 characters. It becomes the prototype name unless `--name` is passed. |
| `description` | no | Up to 280 characters. It becomes the manifest description unless `--description` is passed. |
| `entities` | yes | One or more entities (see below). |
| `roles` | yes | One or more roles with permissions. |
| `notifications` | no | Notification rules. |
| `screens` | no | Route declarations for generated `list`, `detail`, `form`, `board`, `calendar`, `timeline`, `map`, `analytics`, `dashboard` and `settings` screens. |
| `brand` | no | A seed color or preset that `generate` turns into a WCAG AA theme, or a `libraryTheme` id it uses as-is. |
| `catalog`, `tags`, `icon`, `category` | no | Catalog metadata for files under `blueprints/`. |
| `history` | no | Written by `generate`; never edit it by hand (see [Migrations](#regeneration-and-migrations)). |
| `validation` | no | Validation tasks for exploration sessions (see [Validation tasks](#validation-tasks)). |

### Blueprint kinds

A blueprint's `kind` (ADR-036) names what it renders as. A missing `kind` means `app`: everything
on this page describes apps, and every blueprint written before kinds existed is an app.

- `kind: "app"` is accepted and removed when the blueprint is parsed, so an app with and without it
  has one content identity (share links, player namespaces and world caches do not change). A
  golden file, `packages/blueprint/tests/fixtures/identity-golden.json`, freezes the identity of
  every shipped blueprint.
- `deck`, `page` and `doc` are content kinds. They share the root keys `formatVersion`, `name`,
  `description`, `catalog`, `tags`, `icon`, `category` and `brand`, plus one body key named
  after the kind (`"deck": { … }`). App-only keys (`entities`, `roles`, `screens`, `layout`,
  `archetype`, `notifications`, `history`, `validation`) are rejected on them.
- A kind this version does not know fails on `kind` with a "needs a newer Protoyard" message.
  `formatVersion` stays `1`.

In code, `parseBlueprint` and the `Blueprint` type stay app-only. `parseAnyBlueprint`,
`safeParseAnyBlueprint` and the `AnyBlueprint` union accept every kind, and `blueprintKind()`,
`isAppBlueprint()`, `isDeckBlueprint()`, `isPageBlueprint()` and `isDocBlueprint()` tell them
apart. **Status today:** the envelope ships, but the deck, page and doc body schemas are not
wired yet. Until they are, a content-kind blueprint fails with "not available in this build of
Protoyard yet", and the player and `generate` still run apps only.

### Entities

| Key | Meaning |
| --- | --- |
| `name`, `plural` | Lowercase kebab-case, for example `support-ticket` / `support-tickets`. The route is `#/<plural>`. |
| `label` | Optional display name for navigation and headings. |
| `table` | Optional Dexie table name. The default is the plural in lowerCamelCase (`supportTickets`). The `py_` prefix is reserved. |
| `fields` | One or more fields. `id`, `createdAt`, `updatedAt`, `deletedAt` and `deletedBy` are managed by the platform and cannot be declared. |
| `titleField` | The field shown as the record's title in lists, pickers and search. It must be text-like (`text`, `email`, `url`, `phone`, `enum` or `integer`). |
| `searchable` | Fields matched by list and global search. |
| `ownerField` | A `persona` field. It enables `update:own` / `delete:own` and defaults to the acting persona on create. |
| `indexes` | Extra Dexie indexes. Relations, personas, tags and files are always indexed. |
| `defaultSort` | `{ "field": "slaDueAt", "direction": "asc" }`. |
| `seedCount` | Rows the generic generator seeds at `normal` density (1–500, scaled by density). Default 4 for entities nothing points at, 8 otherwise. |
| `screenDefaults` | Optional `{ "views": ["list", "detail"], "list": { "columns": ["title"] }, "detail": { "tabs": ["overview", "related:task"] } }`. When set, `views` selects that entity's standard list/detail/form routes. List columns and detail tabs are cross-reference checked. |
| `features` | `softDelete`, `audit`, `notifications`, `files` and `csv`, all `false` by default. |

### Field kinds

Every field has a lowerCamelCase `name` and a `kind`, plus these optional keys:
`label`, `description`, `required` (default `false`), `sensitive` (redacted from
audit diffs) and `fake`, a generator hint taken from an allow-list such as
`company.name`, `person.fullName`, `lorem.sentence`, `internet.email`,
`commerce.productName`, `commerce.department`, `company.buzzPhrase`,
`location.streetAddress` or `word.words` (`ALLOWED_FAKE_PATHS`). Contact data
stays fictional: `email`, `url` and `phone` fields always use example.com /
example.org addresses and 555 numbers, and an `internet.email`, `internet.url` or
`phone.number` hint on a text field produces the same fictional forms.

| Kind | Options | Stored as |
| --- | --- | --- |
| `text` | `minLength`, `maxLength` (default and maximum 200), `default` | string, trimmed |
| `longText` | `minLength`, `maxLength` (default and maximum 10,000), `default` | string |
| `number` | `min`, `max`, `default`, `trend` | number |
| `integer` | `min`, `max`, `default` (integers), `trend` | number |
| `money` | `currency` (ISO 4217, default `USD`), `min`, `max`, `default` in **integer cents**, `trend` | integer cents (`"12.34"` → `1234`) |
| `boolean` | `default` | boolean |
| `date` | `window` | `YYYY-MM-DD` |
| `datetime` | `window` | ISO instant in UTC |
| `enum` | `values` (lowercase, at least one), `labels`, `default` (one of the values), `weights` (one per value) | string |
| `email` | — | lowercased string |
| `url` | — | http(s) URL |
| `phone` | — | string |
| `tags` | `maxItems` (default 8, max 64) | string array |
| `relation` | `to` (an entity name), `cardinality` `one` \| `many`, `required` (optional unless true), `onDelete` `restrict` \| `cascade` \| `nullify` (default `restrict`) | `<name>Id` or `<name>Ids` |
| `persona` | — | `<name>Id`, a `py_personas` row |
| `file` | `accept` (MIME types or `image/*`), `maxSizeBytes` (default 5 MB, max 50 MB), `multiple` | `<name>Id` or `<name>Ids` in the `files` table |
| `json` | — | any JSON value |
| `geo` | `region` (a fictional region from `@protoyard/scenarios`: `harbor-bay`, `north-valley`, `metro-grid`, `coral-reach`) | `{ lat, lng }`, 5 decimals; never indexed, searched or sorted |
| `avatar` | — | a face from `@protoyard/avatars`, stored as its id (`av-001` … `av-175`; other values fail validation and CSV import); never indexed, searched or sorted |

Relation behavior on delete:

- `cascade` deletes dependents (recursively).
- `nullify` clears single references or removes the id from many-relations.
- `restrict` refuses the whole delete while dependents exist.

All three run in the same transaction as the delete. A `required` relation
cannot use `nullify`.

The declaring entity owns the relation column. Related-detail tabs validate
that the named target exists and has a relation field back to the current
entity. That inverse field supplies its own form label; the UI groups related
rows under the target entity's plural label. This is the v1 inverse contract:
it adds no duplicate foreign key or persisted metadata, so legacy relation
fields keep their parsed defaults and database stores without migration.

### Generation hints

The generic world generator (generator SDK 5) reads these hints. They change
only seeded data, never validation:

- `enum.weights`: relative weights, one per value (`[6, 3, 0]` never picks the
  third). Without weights every value is equally likely; an optional enum's
  `default` is still used for about 15 % of rows.
- `date` / `datetime` `window`: `past` (since the organization started, the
  default), `future` (the next 30 days), `around` (14 days either side) or
  `{ "from": -10, "to": 10 }` in days. Datetimes in a window fall in business
  hours (09:00–17:00 UTC, quarter hours). Dates never precede the organization.
  A window that reaches past now is left out of the "nothing after the
  reference time" integrity check, so due dates and bookings can be upcoming.
- `number` / `integer` / `money` `trend`: `growth`, `decline`, `seasonal`
  (weekly and yearly rhythm) or `flat`. A row's value follows its `createdAt`
  day, centered on the middle of `min`–`max`, so charts over time show it.
- `seedCount` on the entity: rows at `normal` density.
- `avatar` fields: each row gets a seeded face (`createAvatarPool` on a fork
  keyed by entity and field; generator SDK 5). Faces do not repeat within the
  field until all 175 are used, the team's faces are dealt last, adding rows
  keeps the earlier faces, and other fields of the row do not shift.

### Scenario world validation

`protoyard scenario validate` checks each generated world for integrity and
verifies that its scenario actor is present. A world with zero personas is a
valid signed-out starting state; registering creates the first persona. When a
world contains personas, its configured actor must still match one of them.

### Computed expressions

The blueprint package exposes an opt-in data-only computed expression module for read-time
derived display values. Its allow-listed JSON AST supports arithmetic, string concatenation, date
differences and aggregates over declared relations. `validateComputedExpression` checks source
and target field references and operand/result types; `evaluateComputedExpression` reads the
current row and caller-supplied related rows without modifying either. Computed values are not
persisted, so they do not alter storage history or migrations. This primitive is not yet attached
to blueprint fields or generated screens. Import it from the opt-in
`@protoyard/blueprint/computed` subpath.

### Workflow state models

The opt-in `@protoyard/blueprint/workflows` module represents state machines as data: a workflow
binds an entity enum field to named states, an initial state, explicit transitions, optional labels,
simple field-equality guards and role/capability references. `validateWorkflowDefinition` checks
those references against a parsed blueprint; `checkWorkflowTransition` makes a deterministic
decision for a proposed move and record. This is a pure helper, not a service authorization gate.
No callback, expression or JavaScript is accepted. Workflows are deliberately not yet part of
formatVersion 1 or generated CRUD services: adding that persisted block requires a separately
versioned format and migration decision. Until then, generated product-specific workflows remain
in owned Svelte screens and their services.

Generated screens show the face next to the record title in lists, on board
cards and in the detail header. The form edits it with a lazy picker (a searchable grid of
thumbnails: arrow keys, Home and End move, Enter or Space picks) and a
**Shuffle face** button. On a saved record, Shuffle face calls
`services.<entity>.shuffleAvatar(id)` (`session.assert` → zod →
`environment.run('<entity>.shuffleAvatar')` → `db.transaction`) and saves at
once; the next face is deterministic per record (`nextAvatar`) and visits every
face before any repeat. On a new record it changes the draft only.

### Features

| Feature | What turns on |
| --- | --- |
| `softDelete` | `deletedAt` column, a Trash view, restore and an **Undo** toast after a delete. |
| `audit` | An `auditEntries` row for every mutation (changed fields before and after; `sensitive` fields redacted), written in the same transaction. Shown as Change history. |
| `notifications` | Rows in a `notifications` table from the blueprint's notification rules, plus the header bell. |
| `files` | Uploads into the `files` table: Blobs in IndexedDB, size, type and quota checks, simulated progress through `environment.run('files.upload')`. Needs at least one `file` field. |
| `csv` | CSV export of the list and an import that validates every row before writing. |

CSV row import/export and CSV shape authoring are separate surfaces. To create a
reviewable entity draft from headers and a bounded sample, use the lazy authoring
entry:

```ts
import { inferCsvEntity } from '@protoyard/blueprint/import/csv-shape';

const draft = inferCsvEntity(csvText, { entityName: 'invoice' });
// draft.entity is validated; draft.notes contains conservative ambiguity warnings.
```

Shape inference inspects at most 100 non-empty data rows, caps input at the existing
2 MiB / 10,000-row CSV limits, and rejects more than 100 columns or 16 KiB sample
cells. It emits field names, labels and kinds only: sample cell values are never
copied into the entity draft, notes, defaults, enum values or constraints. Ambiguous
columns stay `text` so an author can review them before generation. The importer is
opt-in and does not enter the player package entry.

### Roles and permissions

```json
{
  "name": "member",
  "label": "Agent",
  "permissions": {
    "customer": ["read", "create", "update", "export"],
    "ticket": ["read", "create", "update", "delete:own", "import", "export"],
    "*": ["read"]
  }
}
```

The key is an entity name or `*` (every entity). The actions are `read`,
`create`, `update`, `update:own`, `delete`, `delete:own`, `import`, `export`
and `*`. A capability is `<entity>:<action>`. The `:own` actions need an
`ownerField` and pass when that field is the acting persona; owners and admins
always pass. Services enforce every action even if the UI is bypassed, but
this is still a simulation, not security. The crud-app scenarios use the roles
`owner`, `admin`, `member` and `viewer`, so a blueprint should define those four.

### Notifications

```json
{ "on": "assign", "entity": "ticket", "field": "assignee", "notify": "assignee", "title": "You were assigned: {subject}" }
```

- `on` is `create`, `update` or `assign`. Assign rules name a `persona` field.
- `notify` is `owner`, `assignee` or `role:<name>`.
- Titles are plain text with `{field}` substitutions; HTML is rejected.
- Notifications are written in the mutation's transaction and never go to the
  acting persona.

### Screens, brand and catalog

- `screens`: `list` (with `columns`), `detail` (optional `tabs`), `form`,
  `board` (`groupBy` an enum field), `calendar`, `timeline`, `map`,
  `analytics`, `dashboard` (`widgets` of kind `kpi`, `chart`, `list` and
  `board-summary`; the older `metrics` list still parses) and `settings`. The
  full option list and every cross-reference check are in the
  [`@protoyard/blueprint` README](../packages/blueprint/README.md). Each screen
  can set `path` (defaults such as `/<plural>/board` or `/dashboard`), `title`
  and `nav`. The app shell routes each declaration to its screen at runtime and
  reads its config from `blueprint.screens`, so nothing inlines stale JSON
  literals. An entity without
  `screenDefaults` keeps its legacy list and detail routes. With defaults,
  only the listed CRUD views are synthesized as ordinary screens; a top-level
  screen of the same entity and type remains authoritative for route and options.
  Screen behavior comes from the typed `screenKinds` registry in
  `@protoyard/crud`, and each view-kit component stays in its matching lazy
  `@protoyard/crud/screens/*` entry. For styling, see the CSS
  setup below and the CRUD README.
- `brand`: a `seed` color (`#rrggbb`) and/or a built-in `preset`, plus optional
  `secondary`, `styleProfile`, `font`, `radius` and `density`. `generate`
  writes a hash-headed `src/generated/brand-theme.ts`, registers it and sets
  `defaultTheme`. Contrast failures exit 4. Or `libraryTheme`, a theme
  library id (alone: no seed, preset or style fields): `generate` only sets
  `defaultTheme` to it, with no theme module; an unknown id exits 4 with the
  closest ids ([THEMES](THEMES.md#the-blueprint-brand-block)).
- `catalog`, `tags`, `icon`, `category`: shelf metadata. Files under
  `blueprints/` that set both `brand` and `catalog` are indexed as
  `kind: blueprint` (`pnpm protoyard list --kind blueprint`).

### Validation tasks

An optional `validation.tasks` block (1 to 20 tasks) turns an exploration into a
small usability session. Each task has a kebab-case `id`, a plain-text `prompt`
(up to 280 characters, never rendered as HTML), an optional `timeLimitSeconds`
(10 to 3,600) and a `success` condition. The condition is a `route`, a `data`
predicate, or both, and both must hold when both are given:

```json
"validation": {
  "tasks": [
    {
      "id": "book-friday",
      "prompt": "Book a class for Friday.",
      "timeLimitSeconds": 120,
      "success": {
        "route": { "path": "/bookings", "match": "prefix" },
        "data": { "op": "count>=", "entity": "booking", "value": 1 }
      }
    }
  ]
}
```

| Part | Meaning |
| --- | --- |
| `route` | `path` is an app route (`/bookings`, `/bookings/new`; no query, fragment or `..`). `match` is `exact` (the default) or `prefix`. Trailing slashes and queries in the current route are ignored. |
| `data` `eq` | Some row of `entity` has `field` equal to `value` (a string, number, boolean or `null`, matching the field's kind; a `tags` field matches when it holds the value). `json`, `file` and `geo` fields cannot be compared. |
| `data` `contains` | Some row has a text, `enum` or `tags` `field` containing `value`, ignoring case. |
| `data` `count>=` | `entity` has at least `value` more rows than when the task started (`from: "task-start"`, the default), or at least `value` rows in total (`from: "zero"`). |

There is no expression language: the operator list is closed, values are
literals, and nothing from the blueprint is evaluated as code. Parsing checks
that task ids are unique, that entities and fields exist, and that value types
fit the field. `evaluateValidationSuccess(success, { route, rows, baseline })`
in `@protoyard/blueprint` is pure and deterministic. The player shows them in a
validation panel (lazy, loaded only when the blueprint has tasks): it times each
task, keeps attempts in the browser and downloads a metrics file. There is no
CLI report of those sessions yet.

### Variants

`deriveVariants(blueprint, { count, seed, axes })` in `@protoyard/blueprint`
returns 1 to 8 variants of one blueprint for side-by-side comparison. A variant
changes the shell, never the domain: entities, fields, roles and data stay the
same. Each variant has an id (`v1` … `v8`), a `label` of what changed
(`Rail layout · Ocean theme · Compact · Inspections first`), the `changes`, and
a parsed blueprint.

| Axis | Values | Effect |
| --- | --- | --- |
| `layouts` | layout ids from `@protoyard/core` | `layout.id` (a mobile layout is kept) |
| `themes` | a built-in preset (`violet`, `ocean`, `emerald`, `rose`, `amber`, `monochrome`) or a library theme id | `brand.preset`, or `brand.libraryTheme` used as-is (the brand `name` is kept) |
| `densities` | `compact`, `comfortable`, `spacious` (default: all) | `brand.density` 0.85, default, 1.15; only for preset or seed brands, since a library theme carries its own |
| `emphasis` | `true` (default) or `false` | moves one entity, and its screens, first in navigation |

The caller passes the theme and layout catalogs, so the function needs no theme
code. It is pure: it never mutates its input, and the same blueprint and seed
give byte-identical variants (a core seeded RNG over the seed and the
blueprint's canonical JSON). No variant equals the original, and no two
variants are equal. When the axes cannot produce `count` distinct variants it
throws a `RangeError`, and an unknown layout or a malformed theme id fails
blueprint validation. Library theme ids are not checked against the library
here; `blueprint validate` and `generate` do that.

### Patches

`applyBlueprintPatch(blueprint, operations, { allowDrop })` in
`@protoyard/blueprint` applies an [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902)
JSON Patch (`add`, `remove`, `replace`, `move`, `copy`, `test`) with no
dependency. A patch is untrusted input:

- it is shape-checked (at most 1,000 operations, pointers up to 1,024
  characters), and members an operation does not define are ignored, as RFC
  6902 requires;
- pointers may never name `__proto__`, `constructor` or `prototype`, and values
  may not carry those keys;
- the operations run on a copy and are atomic: a failing operation (a missing
  path, a failed `test`) throws `BlueprintPatchError` with its index and changes
  nothing;
- the result must parse as a blueprint (`invalid-result` lists every issue).

It returns `{ blueprint, migration, destructive }`. `migration` is the
`diffBlueprints` result (`null` when the stored data shape is unchanged), so a
caller knows how the current world moves to the new schema. A patch that drops
an entity or a field, or changes a field incompatibly, loses data: it fails
with `drop-requires-allow` unless `allowDrop` is set, and then reports
`destructive: true`. `applyJsonPatch` is the same engine for any JSON document.

### Checks

After the shape parses, cross-references are checked, each with a path-specific
message: relation targets, title and owner fields, enum values and defaults,
the `py_` prefix, duplicate names, `:own` actions without an `ownerField`,
board `groupBy` and dashboard sums. For example:

```text
✗ Invalid blueprint (1 issue): entities.1.titleField — titleField "headline" is not a field of "support-ticket"
```

## Running a blueprint without generating

`definePrototypeFromBlueprint(blueprint, { namespace })` in `@protoyard/blueprint`
returns the same prototype definition that `generate` writes as files: the
manifest, database versions, policy, integrity, default scenarios, brand theme
and a lazy world generator, plus the app model (routes, navigation, layout). The
player uses it to open a blueprint with no build. Both paths share every
derivation, including `brandDefaultThemeId` for the default theme, so a
blueprint behaves the same before and after `generate`. See the
[package README](../packages/blueprint/README.md#runtime-definition).

## Promoting a quick exploration

An exploration made with `protoyard quick` already runs its blueprint in the
player. When it should become a prototype you own and extend, promote it:

```bash
pnpm protoyard quick promote <exploration> my-idea              # its slug or its folder
pnpm protoyard quick promote <exploration> my-idea --variant v2 # one of its --variants
pnpm protoyard quick promote <exploration> my-idea --no-install
```

Promotion runs the `generate` pipeline in process with the exploration's
`blueprint.json` (or the variant's), so `prototypes/my-idea` is an ordinary
generated prototype. It needs a workspace (otherwise a `not_found` error with
`data.reason: "no_workspace"`), and it never replaces anything: any existing
`prototypes/<slug>` is a `conflict`, even one `generate` made. The blueprint is
read as untrusted input and must still match the sha256 that `quick.json`
recorded.

After generating, it checks the folder contract, the blueprint drift check that
`validate` runs, and parity with the exploration: the written `blueprint.json`
has the same identity and derives the same database versions. Only when every
check passes does it record `promotedTo` (`slug`, `variant`, `at`) in
`quick.json`. A failing check exits 4 and leaves `quick.json` as it was. Since
both paths build from the same blueprint, the generated prototype seeds the
same world as the player for the same scenario; `packages/cli/tests/quick-promote.test.ts`
proves it on a real promotion. Then continue with the usual loop:
`pnpm vitest run prototypes/my-idea` and `pnpm protoyard validate my-idea --build`.

## What `generate` writes

`generate` copies `templates/crud-app` into a hidden staging folder, writes the
files below, and renames it to `prototypes/<slug>`. An interrupted run never
leaves a half-written prototype. It then runs `pnpm install` (skip it with
`--no-install`), fills the spec regions of `AGENTS.md` and `docs/` for the new
slug, and re-indexes.

| Path | Kind | Content |
| --- | --- | --- |
| `blueprint.json` | managed | The blueprint, plus `history` after storage changes. |
| `src/generated/blueprint.ts` | generated | `parseBlueprint(blueprint.json)`. |
| `src/generated/schema.ts` | generated | Every Dexie version, rebuilt from the blueprint and its history (`deriveDatabaseVersions`). |
| `src/generated/policy.ts` | generated | `derivePolicy(blueprint)`. |
| `src/generated/services.ts` | generated | `createEntityServices(runtime, blueprint)`. |
| `src/generated/scenarios.ts` | generated | The world generator, loaded lazily so Faker stays out of the initial chunk. |
| `src/generated/brand-theme.ts` | generated | Only with `brand`. |
| `src/generated/blueprint.snapshot.json` | managed | The blueprint the generated code reflects, its schema version and its `codegenFormat` (currently 3). `validate` reports an older format as outdated and prints the `generate` command that brings it current. |
| `src/App.svelte` | owned | Lazily loads `BlueprintApp` from `@protoyard/crud/app` and renders it with the generated blueprint. |
| `src/prototype.ts` | owned | Only with a built `brand`: registers the brand theme. It declares `generatorVersion: blueprintGeneratorVersion(blueprint)`, so a changed blueprint reseeds stored worlds. |
| `README.md`, `tests/generators.test.ts`, `tests/services.test.ts` | owned | Written once, from the blueprint. |
| everything else | owned | Copied from the template (scenarios, stylesheet, spec docs). |

The app has no generated routes, layout or screen files. `src/App.svelte` renders
`BlueprintApp` from `@protoyard/crud/app`, which derives everything from
`deriveAppModel(blueprint)` in `@protoyard/blueprint` ([ADR-029](DECISIONS.md)):
- the routes, and what each one renders;
- the sidebar rows, with icon ids;
- the navigation groups and the layout.

The player runs the same shell, so a blueprint is the same app at both levels.
Customize a generated app in its owned `App.svelte` through `BlueprintApp`'s
optional props:
- `home`: a component that replaces the overview;
- `extraRoutes`: hand-written routes matched first;
- `recordHref`: where a record opens from its list row or search;
- `actions`: a snippet that replaces the header's search and bell.

The help desk below uses all four.

Four tests pin this:
- `packages/blueprint/tests/app-model.test.ts` pins the model of every catalog
  blueprint (`__snapshots__/app-model.catalog.json`).
- `packages/cli/tests/codegen-model.test.ts` checks that the generator emits no
  route-shaped files and that every generated prototype matches what it emits.
- `packages/blueprint/tests/runtime-parity.test.ts` proves a generated prototype
  and the player agree on storage, policy, scenarios, generator version, routes,
  navigation, layout and the seeded world.
- `templates/crud-app/tests/app.test.ts` drives the template app in a browser
  environment.

The manifest gets id `local.<slug>`, namespace `<slug>`, `storage.schemaVersion: 1`,
the template's scenarios (`empty`, `active`, `viewer`, `massive`) and the
blueprint name and description. All written files are already in the
repository's Biome style, so `pnpm lint` passes and `biome check --write` never
rewrites them.

Set the optional top-level `layout` to `{ "id": "top-nav", "mobile": "mobile-tabs" }`
to choose a registered desktop layout and an optional narrow-screen layout.
The default is `sidebar`. `BlueprintApp` reads the layout from the blueprint,
builds grouped navigation from its screens and wraps the router in
`LayoutHost`, so a layout change regenerates only `blueprint.json` and its
snapshot. Runtime layout overrides still take precedence; the mobile choice
applies below 768 px unless a scenario or explicit override selects another
layout. Regeneration leaves an owned `src/App.svelte` untouched. When an owned
app no longer renders `BlueprintApp`, `generate` warns that the selected layout
is not applied. See [LAYOUTS.md](LAYOUTS.md) for the shared catalog and
the manual adoption path.

The `crud-app` template also imports the stylesheets for `@protoyard/crud`,
`views-ui`, `charts-ui` and `analytics-ui`. Each kit stylesheet registers its
own folder with Tailwind (`@source "./"`), so an app never points `@source` into
another package (that path would point at nothing once installed from npm). Keep
these imports in a hand-built consumer; otherwise the shell's and the kits'
utility classes may be absent from the production CSS. See [`packages/crud/README.md`](../packages/crud/README.md).

## Ownership rules

- **Generated files** (`src/generated/**` except the snapshot) start with a
  header that carries the sha256 of the file body:

  ```ts
  /**
   * @generated by `protoyard generate` from blueprint.json. Do not edit: regenerate instead.
   * Hand-written code belongs outside src/generated/.
   * @hash sha256:…
   */
  ```

  Never edit them. Regeneration rewrites them, and the drift check reports an
  edited one.
- **Owned files** are everything else: screens, components, scenarios, tests,
  `App.svelte`, `prototype.ts`. They are yours, and regeneration never touches
  them. Add routes and screens there (through `BlueprintApp`'s `extraRoutes`). To change seeded data beyond what the
  blueprint expresses, wrap the generator in `src/scenarios/generators.ts`,
  using only `ctx.rng`, `ctx.ids` and `ctx.time`.

## Regeneration and migrations

Run `generate` again on an existing generated slug, with the edited
`prototypes/<slug>/blueprint.json` or another file. It then:

1. Diffs the new blueprint against `src/generated/blueprint.snapshot.json`.
2. When storage changes (a new entity, field or index), it appends the snapshot
   to `history` in `blueprint.json` and bumps `storage.schemaVersion`. The
   generated schema then rebuilds every version from that history; added fields
   are backfilled with their default in the browser's existing IndexedDB data,
   so nothing is reset. Changes that only touch labels or copy add no version.
3. Classifies every generated file as `created`, `changed`, `unchanged`,
   `conflicted` (hand-edited) or `removed`: a file under `src/generated/` the
   generator no longer emits, with its header intact (the route, layout and
   screen-wrapper files of prototypes generated before the shared shell). A file
   there without a generated header is not the generator's and is left alone.
   Owned files are reported as `skipped`.
4. Refuses the whole run if any generated file was edited by hand (exit 1, with
   the files listed in `data.files`). Nothing is written. `--force` overwrites
   them. A symbolic link at `src/`, `src/generated/`, `src/generated/screens/`
   or any generated file is always refused (exit 2, `unsafe_path`) before
   anything is written, and every write and delete is checked to stay inside the
   prototype folder after links are resolved.
5. Refuses to drop a table or field (exit 4, "Regeneration would lose data")
   unless `--allow-drop` is passed. The drop is recorded in `history`, and the
   browser data in that table or field is deleted.

```text
✓ Regenerated prototypes/gen-smoke (schema v1 → v2, 1 upgrade steps)
  changed    blueprint.json
  changed    src/generated/blueprint.snapshot.json
  owned files left untouched: 5
```

`--dry-run` plans a regeneration without writing. Renames are not supported:
a renamed entity or field is a drop plus an add (it needs `--allow-drop`).

For an agent, the whole change loop (which files are generated and which are
owned, `dev`, edit → `--dry-run` → regenerate, handling conflicts and drops,
`spec --write`, tests and `validate --build`, and `quick iterate` for an
exploration) is the distributable skill's
[`iterate` sub-skill](../skills/protoyard/iterate/SKILL.md).

## Validation and drift

`pnpm protoyard validate <slug>` runs a **Blueprint** check on generated
prototypes, reading JSON and file hashes only (no prototype code runs). It
fails when:

- `blueprint.json` does not parse, or its `history` does not rebuild;
- the history rebuilds a schema version other than `protoyard.json` `storage.schemaVersion`;
- `blueprint.json` changed since the last generation ("run generate");
- a generated file is missing, edited by hand (hash mismatch), stale, or
  belongs to no entity.

```text
✓ Blueprint (generated files fresh, versions agree)  3 entities, schema v1, 9 generated files fresh
```

Templates and hand-wired blueprints (no generation snapshot) are skipped.
`pnpm protoyard blueprint validate <file>` checks a file without generating
anything: exit 0 with a summary, 4 with every issue, 3 for a missing file.

## Worked example: Beacon Help Desk

[`prototypes/helpdesk-demo`](../prototypes/helpdesk-demo/README.md) is generated
from [its blueprint](../prototypes/helpdesk-demo/blueprint.json):

- customers, tickets (status, priority, channel, SLA due, assignee,
  attachments, tags) and replies;
- four roles (owner, support lead, agent, viewer);
- assignment and creation notifications;
- audit, files, CSV and soft delete.

The hand-written owned files add what makes it a real help desk:

| Owned file | Adds |
| --- | --- |
| `src/App.svelte` | `BlueprintApp` with the SLA dashboard as `home`, the ticket workspace as an `extraRoutes` entry, tickets opening there from lists and search (`recordHref`), and the help desk search in `actions` |
| `src/screens/Home.svelte`, `src/lib/metrics.ts` | SLA counters, a status board with move buttons, agent load |
| `src/screens/TicketWorkspace.svelte` | Drag-and-drop attachments, replies and internal notes, Mark solved |
| `src/scenarios/helpdesk.ts` | Realistic seeded tickets (support subjects, weighted statuses and priorities, SLA due by priority) |
| `src/components/AppSearch.svelte` | ⌘K search across every entity |

Its tests run the generated services on the real runtime, and
`tests/e2e/helpdesk-demo.spec.ts` drives the static build on desktop and mobile.
The measured bundle and load numbers are in [PERFORMANCE.md](PERFORMANCE.md).

## Prompt for agents

```text
Build a Protoyard prototype for <product> from a blueprint.
1. Write prototypes/<slug>/blueprint.json (formatVersion 1). Use docs/GENERATOR.md and
   prototypes/helpdesk-demo/blueprint.json as the reference. Define the roles owner,
   admin, member and viewer. Use fictional data only.
2. Run `pnpm protoyard blueprint validate prototypes/<slug>/blueprint.json` until it passes.
3. Run `pnpm protoyard generate <slug> --blueprint prototypes/<slug>/blueprint.json`.
4. Never edit src/generated/**. Declare standard CRUD screens in blueprint.json; add
   product-specific workflows and custom screens in owned files (src/screens, passed to
   BlueprintApp in src/App.svelte as home or extraRoutes) and call the generated entity services.
5. Run `pnpm vitest run prototypes/<slug>` and `pnpm protoyard validate <slug> --build`.
6. To change the data model, edit blueprint.json and run step 3 again. Report the
   schema version change.
```

## Limits today

- The generic world generator fills fields from allow-listed Faker paths and
  the distribution hints below. For domain-specific data, wrap it in an owned
  generator, as the help desk does.
- Generated screen declarations provide routes and CRUD screen components;
  domain-specific workflows and bespoke screens still belong in owned files.
  The geo picker and map use a fictional offline basemap, not address lookup or
  real map tiles.
- Notification rules write in the entity mutation transaction. Per-persona
  notification preferences that mute individual rules are not implemented.
- Renames are a drop plus an add. The prototype's `generatorVersion` in
  `src/prototype.ts` is not bumped by regeneration.
- Adding or removing `brand` on regeneration regenerates `brand-theme.ts` but
  does not rewire `src/prototype.ts` or `defaultTheme` (they are set on the
  first generation only).
