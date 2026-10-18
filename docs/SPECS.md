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
| `protoyard spec <slug>` (generate, refresh, `--check`) | **Not implemented yet** |
| `protoyard validate` spec check (`--strict-spec`) | **Not implemented yet** |
| Statically importable route table (`src/routes.ts`) for `SCREENS.md` | **Not implemented yet**: routes still live inside `src/App.svelte` |
| Spec skeletons in templates (`protoyard new`) | **Not implemented yet** |

Until the CLI lands, generated regions are written by hand from the sources
listed below. Update this table when the tooling ships.

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
| `tables` | `DATA_MODEL.md` | latest entry of `definition.database.versions` |
| `versions` | `DATA_MODEL.md` | every entry of `definition.database.versions` |
| `capability-matrix` | `PERMISSIONS.md` | `definition.policy.roles` |
| `rules` | `PERMISSIONS.md` | keys of `definition.policy.rules` |
| `personas` | `PERMISSIONS.md` | personas generated by the default scenario |
| `routes` | `SCREENS.md` | the route table, once it is importable outside Svelte |
| `commands` | `AGENTS.md` | the slug (the standard command list) |

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

## Writing a spec today

1. Create `AGENTS.md` and `docs/` in the prototype folder with the files
   above.
2. Fill the generated regions by hand from the sources in the tables (for
   example, copy the role lists from `src/domain/policy.ts` into the
   capability matrix), inside the markers, so the future `protoyard spec`
   command can take them over.
3. Write the hand-written sections. Move long tables out of `README.md` into
   `docs/` and link to them.
4. Check that every relative link resolves and every command shown runs.

The [crm-demo README](../prototypes/crm-demo/README.md) already contains
most of the facts a first spec needs (screens, routes, data model).
