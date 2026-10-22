# Protoyard blueprint reference

A **blueprint** is a data-only JSON description of a product: entities with
typed fields and relations, roles with per-entity permissions, screens,
notification rules and optional branding. The same blueprint runs in two
places:

- **A quick exploration** (`protoyard quick`): the prebuilt player opens it
  in the browser with no build.
- **A full prototype** (`protoyard generate`, or `protoyard quick promote`):
  source files under `prototypes/<slug>/` that you own, test, build and export.

This page is a map for the `new` and `quick` skills, not the full format. The
full guides are repository paths: inside a Protoyard checkout open them
locally (`docs/GENERATOR.md`, `docs/BRIEF_TO_PROTOTYPE.md`). Otherwise read
them in the [Protoyard repository](https://github.com/DailybotHQ/protoyard/tree/main/docs)
or at <https://protoyard.app/docs/>. The package README
(`packages/blueprint/README.md`) lists every option and cross-reference check.

## Check a blueprint

```bash
protoyard blueprint validate my-idea.blueprint.json
```

- **Exit codes:** 0 with a summary, 4 with every issue and its JSON path, 3
  for a missing file.
- **Unknown keys fail.** The format is strict: an unknown key anywhere fails.
- **Editor schema:** for completion, set `"$schema"` to the JSON Schema that
  `@protoyard/blueprint` exports as `@protoyard/blueprint/schema.json`
  (`packages/blueprint/schema/blueprint.schema.json` in the repository). The
  schema checks shape only. `blueprint validate` also checks that entities,
  fields, routes and archetypes refer to each other correctly, so run it
  before trusting a file.

## Top-level keys

| Key | Required | Meaning |
| --- | --- | --- |
| `formatVersion` | yes | Always `1` |
| `kind` | no | `app` (the default when omitted). `deck`, `page` and `doc` are content kinds (decks, pages and documents built from blocks); app blueprints never need it |
| `name` | yes | Up to 80 characters; the product name |
| `description` | no | Up to 280 characters |
| `entities` | yes | Records with typed fields; each gets a route `#/<plural>` |
| `roles` | yes | Per-entity actions (`read`, `create`, `update`, `update:own`, `delete`, `delete:own`, `import`, `export`); define `owner`, `admin`, `member` and `viewer` |
| `notifications` | no | Rules that write notification rows when records change |
| `screens` | no | `list`, `detail`, `form`, `board`, `calendar`, `timeline`, `map`, `analytics`, `dashboard` and `settings` screens |
| `brand` | no | A seed color or preset that becomes an accessible theme, or a theme library id |
| `layout` | no | The app shell layout (`id`, plus an optional `mobile` layout) |
| `archetype` | no | `assistant`, `team-chat`, `saas-onboarding` or `analytics`: wires that kit into the first experience |
| `validation` | no | 1–20 usability tasks with a route or data success condition (quick explorations) |
| `catalog`, `tags`, `icon`, `category` | no | Catalog metadata |
| `history` | no | Written by `generate`; never edit it by hand |

**Field kinds:**
- `text`, `longText`, `number`, `integer`, `money` (integer cents), `boolean`,
  `date`, `datetime`, `enum`;
- `email`, `url`, `phone` (always fictional `example.com` and 555 forms);
- `tags`, `relation`, `persona`, `file`, `json`, `geo` (fictional regions),
  `avatar` (fictional portraits).

The platform manages `id`, `createdAt`, `updatedAt`, `deletedAt` and
`deletedBy`; they cannot be declared.

## Brief archetypes

`protoyard blueprint new --from-brief <file>` drafts a blueprint offline and
deterministically, and prints why it chose each piece. `--archetype <id>`
forces one of these starting shapes:

`helpdesk`, `crm`, `booking`, `logistics`, `analytics`, `assistant`,
`team-chat`, `saas-onboarding`, `pm`, `lms`, `clinic`, `fintech`, `wiki`,
`iot`, `social`, `marketplace`, and `tracker` (the generic fallback).

The `archetype` block in a blueprint is a different, smaller set:
`assistant`, `team-chat`, `saas-onboarding` and `analytics`. It selects a kit
adapter, while the brief archetype only shapes the drafted entities.

## Ready-made blueprints

- `blueprints/*.json` in the repository is a catalog of branded examples.
  `protoyard list --kind blueprint` lists them.
- `blueprints/quick/*.json` holds compact starters for the four kit
  archetypes.

Copy one, rename it, and edit it rather than starting from an empty file.

## From exploration to full prototype

One blueprint, two runtimes:
- **The same app.** The player and `generate` derive the same definition from
  a blueprint: database versions, policy, scenarios, theme, routes and
  navigation.
- **The same world.** A blueprint behaves the same in a quick exploration and
  in the prototype generated from it, and seeds the same world for the same
  scenario.

| Step | Command | What changes |
| --- | --- | --- |
| Try it | `protoyard quick --blueprint my-idea.blueprint.json --slug my-idea` | Nothing outside `.protoyard/quick/my-idea/`; disposable |
| Compare shells | `protoyard quick --blueprint my-idea.blueprint.json --slug my-idea --variants 3` | `v1/`…`v3/` differ in layout, theme, density and first entity, never in the domain |
| Keep it | `protoyard quick promote my-idea my-app` (add `--variant v2` for a variant) | `prototypes/my-app/` generated from that blueprint; `promotedTo` recorded in `quick.json` |
| Or generate directly | `protoyard generate my-app --blueprint my-idea.blueprint.json` | `prototypes/my-app/` |

After promotion or generation, `prototypes/<slug>/blueprint.json` is the
source of truth. The exploration stays a disposable record, and later edits
to it do not flow into the prototype.

## Regenerating a full prototype

Edit `prototypes/<slug>/blueprint.json`, then run
`protoyard generate <slug> --blueprint prototypes/<slug>/blueprint.json`
(`--dry-run` first). What happens:

- **Storage changes migrate.** A new entity, field or index adds a schema
  version, and existing browser data is kept and backfilled with defaults.
  Label and copy changes add no version.
- **Owned files are untouched.** That means everything outside
  `src/generated/`.
- **Hand edits stop the run.** A hand-edited generated file stops the run
  (exit 1). Never edit `src/generated/**`; add behavior in owned files.
- **Drops need `--allow-drop`.** Dropping a table or field is refused (exit
  4) unless `--allow-drop` is passed, and that deletes the data in it. A
  rename is a drop plus an add.
- **Drift is checked.** `protoyard validate <slug>` fails when
  `blueprint.json` changed since the last generation, or when a generated
  file is stale or edited.

## Limits

- **Size:** a blueprint read as untrusted input (`quick`, the player, share
  links) is capped at 256 KB.
- **Fictional data only:** the generator uses an allow-list of fake-data
  paths.
- **Owned code for workflows:** product-specific workflows and bespoke
  screens belong in owned Svelte files that call the generated entity
  services.
- **Simulation only:** roles and permissions are enforced by the services,
  but they are a simulation, never security.
