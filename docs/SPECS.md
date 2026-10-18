# Prototype specs

Every prototype should ship a **spec**: a small set of documents next to the
code that lets any agent or developer understand the product and rebuild it
as a real application. This page defines that harness: which files exist,
what each one contains, where its facts come from, and which parts are
generated from code. The decision is recorded in
[ADR-019](DECISIONS.md#adr-019--prototype-specs-and-performance-budgets-are-part-of-the-contract).

The layout follows the per-module and per-feature tiers of the DeepWorkPlan
[documentation standard](../.agents/skills/deepworkplan/spec/DOCUMENTATION_STANDARD.md)
(§2 for `AGENTS.md`, §4 and §4.1 for nested `docs/`). A prototype is a
self-contained sub-app with its own contracts (schema, policy, scenarios), so
it qualifies for its own `AGENTS.md` and `docs/` folder.

## Status

| Part | State today |
| --- | --- |
| This standard (files, sections, sources, markers) | Defined (this page) |
| Hand-written spec files in a prototype | Can be written now, by hand, following this page |
| `protoyard spec <slug\|--all> [--write\|--check] [--init]` | Available. `--init` creates missing files (never overwrites), `--write` refreshes generated regions, `--check` exits 4 on a stale region or an invalid marker. |
| `protoyard validate` spec check (`--strict-spec`) | Available. Missing spec files warn (fail with `--strict-spec`); stale generated regions and invalid markers always fail. |
| Statically importable route table (`src/routes.ts`) for `SCREENS.md` | Available: `defineRoutes` in `@protoyard/renderer-svelte`; `crm-demo` and the `dashboard` template use it. Other prototypes still declare routes in `src/App.svelte`. |
| Fact extraction for generated regions | Available: `inspectSpec()` in `packages/cli/src/lib/inspect.ts` runs the definition in a child process (inspect runner `spec` mode); `protoyard spec` renders from it. |
| Spec skeletons in templates (`protoyard new`) | Available. Every template ships `AGENTS.md` and `docs/` (TODO prompts, plus the template's description under Problem). `protoyard new` retitles them for the new prototype and refreshes the generated regions for its slug; if the definition cannot load yet (before `pnpm install`), `new` still succeeds and says to run `spec <slug> --init --write`. |

Start a spec with `pnpm protoyard spec <slug> --init`, write the prose, and keep
the facts current with `--write` (`--check` in CI or review). Update this
table when the remaining tooling ships.

## The files

```text
prototypes/<slug>/
├── AGENTS.md              lean entry point for agents: what it is, rules, commands, doc index
├── README.md              short human intro: what it is, how to run it, links to docs/
└── docs/
    ├── SPEC.md            problem, users, capabilities, non-goals, honest boundaries, rebuild path
    ├── DATA_MODEL.md      tables, keys, indexes, relations, schema versions and migrations
    ├── FLOWS.md           user flows, each mapped to a service, a capability and the tables it writes
    ├── SCREENS.md         every route: purpose, data shown, actions, states, required capability
    └── PERMISSIONS.md     roles × capabilities matrix, record-level rules, personas
```

All six files are required for a prototype with `"status": "ready"`. Others
may start with `AGENTS.md` and `docs/SPEC.md`. The prototype `README.md`
stays short and links into `docs/` instead of repeating tables.

### `AGENTS.md` (per prototype)

The same three roles as the root [AGENTS.md](../AGENTS.md), scoped to one
prototype and kept under about 80 lines:

1. **Index**: one line per `docs/` file.
2. **Rules**: only what is specific to this prototype (for example "money is
   integer cents in `accounts.balanceCents`" or "reps edit only their own
   deals"). Link to the root rules; do not copy them.
3. **Quick commands**: `pnpm protoyard dev <slug>`,
   `pnpm vitest run prototypes/<slug>`,
   `pnpm protoyard validate <slug> --build`, `pnpm protoyard export <slug>`.

### `docs/SPEC.md`

| Section | Content | Source |
| --- | --- | --- |
| Problem | The product problem in two or three sentences | Hand-written |
| Users | Who uses it, mapped to the prototype's roles | Hand-written |
| Capabilities | What a user can do, one line each, linked to `FLOWS.md` | Hand-written |
| Non-goals | What the prototype deliberately does not do | Hand-written |
| Scenarios | Catalogue: id, name, group, description, seed, density | **Generated** (`scenarios`) |
| Honest boundaries | Everything simulated, named as a simulation (see below) | Hand-written |
| Rebuild as a real app | How each simulated part maps to real infrastructure (see below) | Hand-written |
| Manifest facts | id, slug, platform, category, default scenario/theme, storage namespace, schema version | **Generated** (`manifest`) |

### `docs/DATA_MODEL.md`

| Section | Content | Source |
| --- | --- | --- |
| Overview | The domain in words, and why the model looks this way | Hand-written |
| Tables | Per table in the latest version: primary key and indexes | **Generated** (`tables`) from `database.versions` in `src/database/schema.ts` |
| Schema history | Each version and the tables it adds or changes | **Generated** (`versions`) |
| Relations | Foreign keys and cardinalities (an ER sketch is welcome) | Hand-written: Dexie store strings do not declare relations |
| Field notes | Units (integer cents, ISO dates), enums, invariants | Hand-written, from the row types and `integrity` rules |
| Migrations | What each `upgrade` does to existing rows | Hand-written |

Reserved platform tables (`py_*`) are listed once, as platform tables, not
as domain tables.

### `docs/FLOWS.md`

Entirely hand-written: there is no reliable way to infer intent from code.
Each flow is a short numbered list that ends in the service layer:

```text
### Move a deal to another stage
1. Pipeline → drag the card, or "Move to…" on the card.
2. Service: `deals.moveStage(id, stage)` in src/domain/services.ts
3. Capability: `deals:update` (reps: own deals only)
4. Writes (one transaction): `deals` (stage, probability, lostReason, closedAt, updatedAt), `activities` (a stage-change entry)
5. Failure states: permission denied, simulated offline (nothing written)
```

Every mutation in `src/domain/services.ts` should appear in at least one
flow. That is the path agents follow when they rebuild the app: UI → service
→ `session.assert` → zod → `environment.run` → `db.transaction`.

### `docs/SCREENS.md`

| Section | Content | Source |
| --- | --- | --- |
| Route list | Path, title, required capability | **Generated** (`routes`) once routes are importable; hand-written until then |
| Per screen | Purpose, data shown, actions, empty / loading / error / denied states | Hand-written |
| Shell | Device or host shell and viewport the prototype is designed for | Hand-written, from `preview` in `protoyard.json` |

### `docs/PERMISSIONS.md`

| Section | Content | Source |
| --- | --- | --- |
| Capability matrix | Roles × capabilities (✓ / blank) | **Generated** (`capability-matrix`) from `policy.roles` |
| Record-level rules | Rule names and what they mean | Rule names **generated** (`rules`). Meaning hand-written: rules are functions. |
| Personas | The personas of the default scenario and their roles | **Generated** (`personas`) |
| Boundary | "Simulated permissions: UX only, not security." | Hand-written, always present |

## Generated regions

A generated region is fenced by an opening and a closing marker with the
same id:

```markdown
<!-- protoyard:generated:capability-matrix -->
| Capability | owner | admin | rep | viewer |
| --- | --- | --- | --- | --- |
| `deals:update` | ✓ | ✓ | ✓ |  |
<!-- /protoyard:generated:capability-matrix -->
```

Rules:

- Text **between** the markers belongs to the generator. A refresh replaces
  it, and the check fails when it differs from what the code produces.
- Text **outside** the markers is hand-written and is never touched.
- Markers are not nested, and each id appears at most once per file.
  Unbalanced or duplicate markers are an error, not something to repair
  silently.
- Generated content is deterministic: rows sorted by a stable key, no
  timestamps, no machine paths. Regenerating twice gives identical bytes.
- Facts come only from the prototype definition (`src/prototype.ts` and what
  it imports), loaded in a child process as `validate` does today. Nothing
  is scraped from compiled output.

Region ids:

| Id | File | From |
| --- | --- | --- |
| `manifest` | `SPEC.md` | `protoyard.json` |
| `scenarios` | `SPEC.md` | `definition.scenarios` (resolved against presets) |
| `tables` | `DATA_MODEL.md` | the live store set after every entry of `definition.database.versions` |
| `er-diagram` | `DATA_MODEL.md` | the same tables as a Mermaid `erDiagram`; relations inferred from indexed `…Id` fields that match a table name |
| `versions` | `DATA_MODEL.md` | every entry of `definition.database.versions` |
| `capability-matrix` | `PERMISSIONS.md` | `definition.policy.roles` |
| `rules` | `PERMISSIONS.md` | keys of `definition.policy.rules` |
| `personas` | `PERMISSIONS.md` | personas generated by the default scenario |
| `routes` | `SCREENS.md` | the route table, once it is importable outside Svelte |
| `commands` | `AGENTS.md` | the slug (the standard command list) |

## Rebuild kit

`pnpm protoyard spec <slug> --bundle` writes
`artifacts/<slug>/<slug>-rebuild-kit.zip`: one file to hand to a team or an
agent building the prototype as a real app. It contains a generated
`REBUILD.md` (contents with sizes and sha256, how to use the kit, and a
starting prompt that asks before choosing any vendor), then `AGENTS.md`,
`README.md`, `docs/**/*.md`, `protoyard.json`, `src/prototype.ts`,
`src/routes.ts`, `src/database/schema.ts`, and the `.ts`, `.md` and `.json`
files under `src/domain/` and `src/scenarios/` (tests excluded). Nothing
outside that allow-list is read: no screens, components, assets, tests or
environment files. The command prints the ZIP's sha256. The same files give
the same bytes.

The kit is refused, and nothing is written, when the spec is missing or
stale, when a symlink leaves the prototype folder or sits on the allow-list,
or when a file matches the repository's public-hygiene rules (secret shapes,
personal paths, private emails). Findings are reported as `path:line rule`,
never with the matched text. The kit lives under `artifacts/`, never in
`dist/`, so it is not part of any hosted build.

## Honest boundaries

`SPEC.md` names every simulated part plainly. A prototype has no backend:

| Concern | In the prototype | Never claim |
| --- | --- | --- |
| Data | IndexedDB in the visitor's browser, per origin. Nothing is shared between visitors. | Sync, multi-user collaboration, backups |
| Identity | Personas you switch between. Simulated sign in, sign up, SSO and MFA when a prototype uses them ([ADR-018](DECISIONS.md#adr-018--simulated-authentication-oauth-mfa-and-billing-kits)). | Authentication, account security |
| Permissions | Capabilities checked in services (`session.assert`) | Authorization or security |
| Payments | Integer-cent amounts and simulated billing states | Charging anyone, PCI scope |
| Network and AI | Simulated latency, failures and offline mode (`environment.run`). Scripted or simulated assistants. | Real API calls or a real model |
| Time | The simulation clock and timeline | Real schedules or background jobs |

## Rebuild as a real app

This section of `SPEC.md` is the hand-off to a team or an agent building the
production version. For each row below, it states what the prototype does
and what a real implementation needs. It never names a vendor as if it were
already chosen:

| Prototype piece | Real counterpart to design |
| --- | --- |
| `src/database/schema.ts` tables and indexes | Server database schema. Ids, indexes and integer-cent money carry over. |
| Schema versions and `upgrade` functions | Server migrations |
| `src/domain/services.ts` (zod inputs, `session.assert`, transactions) | API endpoints or server actions with the same inputs, checks and transaction boundaries |
| `policy.roles` and `rules` | Server-side authorization, enforced on every request |
| Personas and simulated sign-in | A real identity provider and session management |
| `environment.run` failure modes | The error, retry and offline states the real UI must still handle |
| Scenarios and generators | Seed data for staging, demo accounts and test fixtures |
| Screens and flows | The UI to keep. The states listed in `SCREENS.md` are the acceptance list. |

## Writing a spec

1. `pnpm protoyard spec <slug> --init` creates `AGENTS.md` and the `docs/`
   files that are missing (existing files are never overwritten), with TODO
   prompts for the prose and the generated regions already filled.
2. Replace the TODOs. Move long tables out of `README.md` into `docs/` and
   link to them.
3. After changing the schema, policy, scenarios or routes, run
   `pnpm protoyard spec <slug> --write`; `--check` fails (exit 4) while a
   region is stale.
4. Check that every relative link resolves and every command shown runs.

The [crm-demo README](../prototypes/crm-demo/README.md) already contains
most of the facts a first spec needs (screens, routes, data model).
