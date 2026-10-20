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
| `templates/crud-app` | The base template `generate` copies: AppShell navigation, entity pages, search palette, members and notifications. |
| `protoyard generate` / `protoyard blueprint validate` | CLI commands that validate, generate, regenerate and check drift. |
| [`blueprints/`](../blueprints/README.md) | A catalog of branded example blueprints you can generate from. |

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
| `relation` | `to` (an entity name), `cardinality` `one` \| `many`, `onDelete` `restrict` \| `cascade` \| `nullify` (default `restrict`) | `<name>Id` or `<name>Ids` |
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

### Computed expressions

The blueprint package exposes an opt-in data-only computed expression module for read-time
derived display values. Its allow-listed JSON AST supports arithmetic, string concatenation, date
differences and aggregates over declared relations. `validateComputedExpression` checks source
and target field references and operand/result types; `evaluateComputedExpression` reads the
current row and caller-supplied related rows without modifying either. Computed values are not
persisted, so they do not alter storage history or migrations. This primitive is not yet attached
to blueprint fields or generated screens.

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
  and `nav`. Generation emits a typed lazy route wrapper for each declaration;
  its screen config is read from `blueprint.screens` through `useCrudApp()`, so
  generated files do not inline stale JSON literals. Independently, every
  entity still gets its standard list and detail routes, plus a create route.
  Screen behavior comes from the typed `screenKinds` registry in
  `@protoyard/crud`; codegen reads Svelte-free import metadata from
  `@protoyard/crud/registry-meta`, while each view-kit component stays in its
  matching lazy `@protoyard/crud/screens/*` entry. For styling, see the CSS
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
in `@protoyard/blueprint` is pure and deterministic. Today the library parses,
checks and evaluates the block; no screen shows the tasks yet.

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

### Checks

After the shape parses, cross-references are checked, each with a path-specific
message: relation targets, title and owner fields, enum values and defaults,
the `py_` prefix, duplicate names, `:own` actions without an `ownerField`,
board `groupBy` and dashboard sums. For example:

```text
✗ Invalid blueprint (1 issue): entities.1.titleField — titleField "headline" is not a field of "support-ticket"
```

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
| `src/generated/routes.ts` | generated | Hash routes (`#/`, `#/<plural>`, `#/<plural>/:id`, `#/members`) and sidebar entries. Every screen is a lazy chunk. |
| `src/generated/layout.ts` | generated | The selected `layout.id`, optional mobile layout, and grouped navigation derived from blueprint screens. |
| `src/generated/screens/<Entity>Page.svelte` | generated | One lazy screen per entity. |
| `src/generated/screens/<DeclaredScreen>.svelte` | generated | Typed lazy wrappers for declared board, calendar, map, analytics, dashboard, settings and detail-tab routes. Wrappers read their config from `blueprint.screens`. |
| `src/generated/brand-theme.ts` | generated | Only with `brand`. |
| `src/generated/blueprint.snapshot.json` | managed | The blueprint the generated code reflects, and its schema version. |
| `src/App.svelte`, `src/screens/Home.svelte`, `README.md`, `tests/generators.test.ts`, `tests/services.test.ts` | owned | Written once, from the blueprint. |
| everything else | owned | Copied from the template (entity page, search palette, members, scenarios, spec docs). |

`routes.ts` and `layout.ts` print one data model, `deriveAppModel(blueprint)` from
`@protoyard/blueprint` ([ADR-029](DECISIONS.md)). It holds the routes (what each
one renders), the sidebar rows with icon ids, the navigation groups and the
layout. The same model is meant for a renderer that runs a blueprint without
generating code. `packages/blueprint/tests/app-model.test.ts` prints the model
and compares it, byte for byte, with what `generate` emits for every catalog
blueprint and every generated prototype. Any drift between the two fails that
test.

The manifest gets id `local.<slug>`, namespace `<slug>`, `storage.schemaVersion: 1`,
the template's scenarios (`empty`, `active`, `viewer`, `massive`) and the
blueprint name and description. All written files are already in the
repository's Biome style, so `pnpm lint` passes and `biome check --write` never
rewrites them.

Set the optional top-level `layout` to `{ "id": "top-nav", "mobile": "mobile-tabs" }`
to choose a registered desktop layout and an optional narrow-screen layout.
The default is `sidebar`. Regeneration updates `src/generated/layout.ts` and
the generated `App.svelte` reads that module, builds grouped navigation from
the blueprint screens and wraps the router in `LayoutHost`. Runtime layout
overrides still take precedence; the generated mobile choice applies below
768 px unless a scenario or explicit override selects another layout.
Regeneration leaves an owned `src/App.svelte` untouched. For older generated
apps that do not consume the module, `generate` warns that the selected
layout is not applied. See [LAYOUTS.md](LAYOUTS.md) for the shared catalog and
the manual adoption path.

The `crud-app` template also imports the stylesheets for `views-ui`,
`charts-ui` and `analytics-ui`, and registers each package source with Tailwind
using `@source`. Keep these imports and sources when adding view-based screens
to a hand-built consumer; otherwise their utility classes may be absent from
the production CSS. See [`packages/crud/README.md`](../packages/crud/README.md).

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
  them. Add routes and screens there. To change seeded data beyond what the
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
   `conflicted` (hand-edited) or `removed` (a screen of a removed entity).
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
   product-specific workflows and custom screens in owned files (src/screens,
   src/App.svelte routes) and call the generated entity services.
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
