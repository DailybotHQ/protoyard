# Pipeline CRM: spec

## Problem

Small sales teams track accounts, people and open opportunities in
spreadsheets and lose sight of what is about to close, who owns it and what
happened last. Pipeline CRM is a lightweight CRM that keeps companies,
contacts, a stage-based deal pipeline and an activity history in one place,
with metrics derived from the stored deals (open pipeline, weighted
forecast, recent wins, win rate).

## Users

All roles are simulated personas; see [PERMISSIONS.md](PERMISSIONS.md).

| User | Role | What they do |
| --- | --- | --- |
| Founder or sales lead who set up the workspace | `owner` | Everything, including the billing card on Team & settings |
| Operations lead | `admin` | Everything except `billing:manage` (deletes companies and contacts, edits any deal) |
| Account executive | `rep` | Works the pipeline: creates companies, contacts, deals and activities; edits, moves and deletes only the deals they own |
| Finance or leadership stakeholder | `viewer` | Reads dashboards, lists and history; every write is blocked |

## Capabilities

- Add a company and edit its details: [Create a company](FLOWS.md#create-a-company), [Edit a company](FLOWS.md#edit-a-company).
- Delete a company with its contacts, deals and activity in one step: [Delete a company](FLOWS.md#delete-a-company-and-everything-it-owns).
- Add, edit and delete contacts: [Create a contact](FLOWS.md#create-a-contact), [Edit a contact](FLOWS.md#edit-a-contact), [Delete a contact](FLOWS.md#delete-a-contact).
- Open a deal and edit it: [Create a deal](FLOWS.md#create-a-deal), [Edit a deal](FLOWS.md#edit-a-deal).
- Move a deal through the pipeline, recording a reason when it is lost: [Move a deal to another stage](FLOWS.md#move-a-deal-to-another-stage), [Mark a deal as lost](FLOWS.md#mark-a-deal-as-lost).
- Delete a deal and its activity: [Delete a deal](FLOWS.md#delete-a-deal).
- Log calls, emails, meetings and notes on a deal: [Log an activity on a deal](FLOWS.md#log-an-activity-on-a-deal).
- Read the dashboard, pipeline board, tables, activity feed and team list (read-only screens, described in [SCREENS.md](SCREENS.md)).

## Non-goals

- No email, calendar or telephony integration: "call", "email" and
  "meeting" are activities a person types in, nothing is sent.
- No team management in the UI: members and roles are shown but cannot be
  invited, changed or removed (`team:manage` and `settings:manage` exist as
  capabilities but no screen or service uses them).
- No billing flow: plan and status are displayed to the owner only; the
  expired state comes from the `trial-expired` scenario.
- No multi-currency: every deal is in USD.
- No import or export of CRM records (snapshots in DevTools are the only
  way to save and restore a world).
- No sign-in: the active persona comes from the scenario or DevTools.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `admin-view` | Admin managing the team | Roles | normal | 4218 | `{"crm":{"companies":18,"dealsPerCompany":[1,3],"winRate":0.55}}` | An admin who can manage people and settings but not billing. |
| `enterprise-scale` | Enterprise scale (15k+ records) | Scale | massive | 77001 | `{"crm":{"companies":300,"contactsPerCompany":[2,4],"dealsPerCompany":[8,12],"winRate":0.5}}` | A large sales org after 18 months: ~300 companies, ~900 contacts, ~3,000 deals and 10k+ activities. Loads in chunks with progress — use it to check lists, search and performance. |
| `growing-team` | Growing team, day 30 | Lifecycle | normal | 4218 | `{"crm":{"companies":18,"dealsPerCompany":[1,3],"winRate":0.55}}` | A 12-person startup one month into using the CRM: a healthy pipeline, recent activity and an owner who set everything up. |
| `mature-company` | Mature company, year one | Lifecycle | dense | 9001 | `{"crm":{"companies":64,"dealsPerCompany":[2,6],"winRate":0.48}}` | A year of history: 60+ companies, hundreds of deals across every stage and a long activity trail. Good for density and performance. |
| `new-company` | Brand-new signup | Lifecycle | empty | 1 | `{"crm":{"companies":0,"dealsPerCompany":[0,0],"winRate":0}}` | The owner just created the workspace: no companies, no deals, onboarding checklist not started. |
| `offline-mode` | Offline / flaky network | Conditions | normal | 4218 | `{"crm":{"companies":18,"dealsPerCompany":[1,3],"winRate":0.55}}` | Every save fails as if the network dropped — check the error states. |
| `rep-view` | Sales rep who joined last month | Roles | dense | 9001 | `{"crm":{"companies":64,"dealsPerCompany":[2,6],"winRate":0.48}}` | The year-one company seen by Priya, a rep invited 28 days ago. She can work her own deals; others are read-only. |
| `trial-expired` | Trial expired | Billing | normal | 4218 | `{"crm":{"companies":18,"dealsPerCompany":[1,3],"winRate":0.55}}` | Same team, but the subscription lapsed: data is visible, new deals are paywalled. |
| `viewer-view` | Read-only viewer | Roles | normal | 4218 | `{"crm":{"companies":18,"dealsPerCompany":[1,3],"winRate":0.55}}` | A finance stakeholder with view access: every create, edit and delete is blocked. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

Everything below is a simulation. See
[docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

| Concern | What this prototype does |
| --- | --- |
| Data | Stored in IndexedDB in the visitor's browser (namespace `crm-demo`). Nothing is shared between visitors or devices; there is no sync, collaboration or backup. |
| Identity | Personas from the scenario (for example Alex Rivera, owner). The persona is switched in DevTools, which is part of `pnpm protoyard dev` but not of the static build (`build.includeDevtools: false`). There is no sign-in and no authentication. |
| Permissions | Capabilities and two record-level rules checked by `session.assert` in `src/domain/services.ts`. They shape the UX and make forbidden calls fail even from the browser console, but they are not authorization or security. |
| Payments | No payments. The plan and billing status (`active` or `expired`) are scenario data; an expired subscription only paywalls new companies, contacts and deals (`PaywallError`). Nobody is charged. |
| Network | No network calls. Every mutation runs through `environment.run`, which can add latency, fail as offline (the `offline-mode` scenario) or inject simulated errors from DevTools. |
| Time | A simulated clock fixed at the scenario reference time (`2026-10-16T10:00:00-05:00`). Advancing time in DevTools applies the deterministic timeline (1–3 follow-up notes per simulated day, sometimes a stage advance); nothing runs in the background. |
| People and companies | Generated, fictional data (`.example` domains). The generator (`src/scenarios/generators.ts`, version 3) is deterministic: the same seed, reference time and versions produce the same world. The timeline is idempotent: advancing 7×1 day equals 1×7 days. |

## Rebuild as a real app

The hand-off for building the production version. No vendor or framework is
chosen here. See
[docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

| Prototype piece | Real counterpart to design |
| --- | --- |
| `companies`, `contacts`, `deals`, `activities` in `src/database/schema.ts` ([DATA_MODEL.md](DATA_MODEL.md)) | Server database tables with the same ids, foreign keys and indexes (stage, owner, close date, probability, tags). Decide whether `amount` stays whole USD or moves to integer cents. |
| Schema v2 `upgrade` (probability and tags backfill) | A server migration with the same backfill rules |
| `src/domain/services.ts` (zod inputs, `session.assert`, one transaction per flow) | API endpoints or server actions with the same inputs, checks and transaction boundaries, including the company-delete cascade and the contact-delete unlink ([FLOWS.md](FLOWS.md)) |
| `policy.roles` and the `deals:update` / `deals:delete` rules | Server-side authorization on every request, including the "reps act only on their own deals" rule ([PERMISSIONS.md](PERMISSIONS.md)) |
| Personas and the DevTools persona switch | A real identity provider, sessions and workspace memberships |
| `assertActivePlan` and the `trial-expired` scenario | A billing system that reports subscription status to the API |
| `environment.run` failures (offline, timeout, server error) | Error, retry and offline handling the real UI must keep (toasts, inline field errors) |
| Activities written by services and by the timeline | An audit or activity log written server-side in the same transaction as the change |
| Scenarios and `generateCrmWorld` | Seed data for staging, demo workspaces and test fixtures |
| Screens and flows ([SCREENS.md](SCREENS.md)) | The UI to keep; the listed empty, loading, error and denied states are the acceptance list |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `example.crm` |
| slug | `crm-demo` |
| name | Pipeline CRM |
| version | 0.1.0 |
| platform | responsive |
| category | sales |
| default scenario | `growing-team` |
| default theme | `violet` |
| storage namespace | `crm-demo` |
| schema version | 2 |
| generator version | 3 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
