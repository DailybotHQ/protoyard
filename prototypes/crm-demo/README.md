# Pipeline CRM — `crm-demo`

A lightweight sales CRM built on Protoyard. Companies, contacts, an editable
deal pipeline and an activity history, with owner, admin, sales-rep and
viewer personas. Every action persists in the browser (IndexedDB) and
survives reloads. All companies and people are fictional.

```bash
pnpm protoyard dev crm-demo        # run it (DevTools included in dev)
pnpm protoyard build crm-demo      # static build → artifacts/crm-demo/dist
pnpm protoyard export crm-demo     # + portable ZIP
pnpm vitest run prototypes/crm-demo
```

## What you can do

| Screen | Route | Real behavior |
| --- | --- | --- |
| Dashboard | `#/` | Metrics derived from stored deals (open pipeline, weighted forecast, recent wins, win rate), stage breakdown, your next closes, recent activity. Onboarding checklist on an empty workspace. |
| Pipeline | `#/pipeline` | Kanban by stage. Drag and drop, or use the keyboard-accessible "Move to…" menu. Marking a deal lost asks for a reason. Filter and "mine only". |
| Deals | `#/deals` | Searchable, sortable, paginated table with stage and owner filters. Create deals. |
| Deal | `#/deals/:id` | Edit, change stage, delete (with confirmation), log calls, emails, meetings and notes, contact tab. |
| Companies | `#/companies` | Table with open-pipeline rollups and industry filter. Create companies. |
| Company | `#/companies/:id` | Deals and contacts. Edit. Delete the company with everything it owns in one transaction. |
| Contacts | `#/contacts` | Create, edit and delete. Deals keep existing when their contact is deleted. |
| Activity | `#/activity` | Full history, filter by type, load more. |
| Team & settings | `#/team` | Members and roles, your capability matrix, owner-only billing. |

## Data model (`src/database/schema.ts`)

```text
py_organizations ─┬─ py_memberships ── py_personas      (platform identity tables)
                  │
companies 1─* contacts
companies 1─* deals *─1 contacts (optional)
activities → deal | company | contact, actorId → py_personas
```

Schema **v2** adds `deals.probability` (indexed) and a multi-entry
`companies.tags` index. The v1 → v2 `upgrade` backfills existing rows and
deletes nothing. It is the reference example for migrations.

## Roles (`src/domain/policy.ts`) — simulated, not real security

| Role | Can |
| --- | --- |
| `owner` | Everything, including billing |
| `admin` | Everything except billing |
| `rep` (custom role) | Work the pipeline; edit or delete **only their own** deals |
| `viewer` | Read only |

Services call `session.assert(capability, record)`, so a forbidden action
fails even from the browser console.

## Scenarios (`src/scenarios/`)

| Id | What it shows |
| --- | --- |
| `new-company` | Brand-new owner, empty workspace, onboarding not started |
| `growing-team` *(default)* | 12-person startup, day 30, healthy pipeline |
| `mature-company` | Year one, 250+ deals across every stage (density) |
| `rep-view` | The mature company seen by a sales rep who joined 28 days ago |
| `viewer-view` | Read-only finance stakeholder |
| `admin-view` | Admin without billing access |
| `trial-expired` | Data readable, new records paywalled |
| `offline-mode` | Every save fails as offline, with visible errors |

The generator (`generators.ts`, version 2) is deterministic: the same seed,
reference time and versions produce the same world. The timeline adds 1–3
follow-ups per simulated day and sometimes advances a stage. It is idempotent:
advancing 7×1 day equals 1×7 days.

## Tests

- `tests/generators.test.ts`: determinism, referential integrity and time
  bounds for every scenario, and scenario semantics.
- `tests/services.test.ts`: runs on the **real runtime** with an in-memory
  IndexedDB. Covers CRUD across reloads, persona switches with service-level
  permissions, overrides that never touch records, offline failures, snapshot
  restore, scenario reload determinism and idempotent time advance.
