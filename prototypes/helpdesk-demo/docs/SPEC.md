# Beacon Help Desk: spec

## Problem

Small support teams answer customers from a shared inbox and lose track of
which tickets are about to miss their response deadline, who owns them and
what was already said. Beacon Help Desk keeps customers, tickets (status,
priority, channel, SLA due time, assignee, attachments, tags) and the reply
thread in one place, with an SLA dashboard, a status board, per-record change
history and in-app notifications.

It is the flagship for `protoyard generate`: the data model, policy, entity
services, world generator, routes and list/form screens are derived from
[blueprint.json](../blueprint.json) (files under `src/generated/`, built on
the `crud-app` template), and a few owned files add the help desk on top (the
dashboard, the ticket workspace, the scenario enrichment and the search
palette).

## Users

All roles are simulated personas; see [PERMISSIONS.md](PERMISSIONS.md). The
role labels come from blueprint.json.

| User | Role | What they do |
| --- | --- | --- |
| Founder or head of support who set up the desk | `owner` (Owner) | Everything (`*`) |
| Support lead | `admin` (Support lead) | Everything (`*`); receives the "New ticket" notification for tickets other people create |
| Support agent | `member` (Agent) | Reads, creates and updates customers and tickets, imports and exports tickets, exports customers, writes replies; edits and deletes only their own replies, deletes tickets assigned to them, and cannot delete customers |
| Stakeholder reading along | `viewer` (Viewer) | Reads every list, ticket and history entry; every write is blocked |

## Capabilities

- Add, edit and delete customers, with Undo: [Create a customer](FLOWS.md#create-a-customer), [Edit a customer](FLOWS.md#edit-a-customer), [Delete a customer](FLOWS.md#delete-a-customer-or-a-ticket-to-the-trash-with-undo).
- Open a ticket and edit any of its fields, including reassigning it: [Create a ticket](FLOWS.md#create-a-ticket), [Edit or reassign a ticket](FLOWS.md#edit-or-reassign-a-ticket).
- Move tickets across the status board and mark them solved: [Move a ticket on the status board](FLOWS.md#move-a-ticket-on-the-status-board), [Mark a ticket solved](FLOWS.md#mark-a-ticket-solved).
- Delete a ticket to the trash and undo it: [Delete a customer or a ticket to the trash, with Undo](FLOWS.md#delete-a-customer-or-a-ticket-to-the-trash-with-undo).
- Delete several records at once: [Delete several selected records](FLOWS.md#delete-several-selected-records).
- Reply to a customer or add an internal note, and edit or delete replies: [Reply or add an internal note](FLOWS.md#reply-or-add-an-internal-note), [Edit a reply](FLOWS.md#edit-a-reply), [Delete a reply](FLOWS.md#delete-a-reply).
- Attach images, PDFs or text files to a ticket: [Attach files to a ticket](FLOWS.md#attach-files-to-a-ticket).
- Import and export tickets and customers as CSV: [Import records from CSV](FLOWS.md#import-records-from-csv), [Export a list as CSV](FLOWS.md#export-a-list-as-csv).
- Read and clear in-app notifications: [Read notifications](FLOWS.md#read-notifications).
- Read the SLA dashboard, agent load, lists, change history and team list (described in [SCREENS.md](SCREENS.md)); search every record with ⌘K.

## Non-goals

- No email, chat or phone integration: "Send reply" stores a reply row and
  nothing is delivered (the toast says "Reply sent (simulated)"). `channel` is
  a label on the ticket.
- No customer-facing portal: customers are records, not users.
- No SLA engine: `slaDueAt` is computed only by the scenario generator
  (created + 4/8/24/72 h by priority). Creating a ticket or changing its
  priority in the UI does not set or recompute it.
- No automations, macros, escalations or background jobs.
- No team management: the Members screen is read-only, and the `members:*`
  capability is not used by any screen or service in this prototype.
- No attachment preview, download or removal in the UI (only upload and the
  file list).
- No permanent delete from the Trash view; records can be restored there or
  recovered with Undo for the simulated 30-second window.
- No sign-in: the active persona comes from the scenario or DevTools.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Active | Roles | normal | 123002 | — | A normal density workspace for day-to-day demos. |
| `empty` | Empty | General | empty | 123001 | — | Team only — no records yet. |
| `massive` | Massive | Roles | massive | 123004 | — | Dense seed for list virtualization and budget checks. |
| `viewer` | Viewer | Roles | sparse | 123003 | — | Read-only stroll through seeded work. |
<!-- /protoyard:generated:scenarios -->

The scenario descriptions in `src/scenarios/index.ts` still use the template's
wording ("projects or tasks"). What each one actually seeds: `active` is the
default, with the owner as the active persona, 6 people, 8 customers, 24
tickets and 36 replies; `empty` has the team (4 people, owner active) and no
records; `viewer` is a sparse desk (2 customers, 6 tickets, 9 replies) seen
by a viewer; `massive` (owner active, 12 people) has 200 customers, 600
tickets and 900 replies for performance checks. Every non-empty scenario also
seeds `create` audit entries for a sample of the records (about half of
those the blueprint generator made before the help desk enrichment topped
tickets and replies up) and a few notifications.

## Honest boundaries

Everything below is a simulation. See
[docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

| Concern | What this prototype does |
| --- | --- |
| Data | Stored in IndexedDB in the visitor's browser (namespace `helpdesk-demo`). Nothing is shared between visitors or devices; there is no sync, collaboration or backup. Two agents "working the same queue" are personas in one browser. |
| Identity | Personas from the scenario. The persona is switched in DevTools, which is part of `pnpm protoyard dev` but not of the static build (`build.includeDevtools: false`). There is no sign-in and no authentication. |
| Permissions | Capabilities derived from the blueprint roles and six `:own` record rules, checked by `session.assert` in the generated entity services (`createEntityServices` in `@protoyard/blueprint`). They shape the UX and make forbidden calls fail even from the browser console, but they are not authorization or security. |
| Customer messages | "Send reply" only stores a `replies` row; nothing is emailed or delivered. Internal notes are a boolean on the same row. |
| Notifications | Rows in the `notifications` table written in the same transaction as the ticket change. No email, push or background delivery. |
| Attachments | File bytes are stored in IndexedDB in this browser (images, PDF or text, up to 2 MB each, 50 MB per prototype). They are not uploaded anywhere, and JSON snapshots do not preserve the bytes. |
| Payments | None. `customers.plan` (`free`, `pro`, `enterprise`) is a label; nobody is billed. |
| Network | No network calls. Mutations run through `environment.run` (operations named `ticket.create`, `files.upload`, `notifications.markRead`…), which can add latency, fail as offline or inject errors from DevTools. Reads are local and never fail on the simulated network. |
| Time | A simulated clock set to the scenario reference time (for example `2026-06-01T14:00:00.000Z` for `active`) and stopped unless changed in DevTools. SLA states ("Breached 3 h ago", "Due in 5 h") and the 30-second Undo window use that clock. There is no timeline: advancing time applies no events. |
| People and customers | Generated, fictional data (customer emails on `example.com` / `example.org`, support copy from fixed lists in `src/scenarios/helpdesk.ts`). The generator is deterministic: the same seed, reference time and versions build the same desk. |

## Rebuild as a real app

The hand-off for building the production version. No vendor or framework is
chosen here. See
[docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

| Prototype piece | Real counterpart to design |
| --- | --- |
| blueprint.json entities and the derived stores (`customers`, `tickets`, `replies`, plus `auditEntries`, `files`, `notifications`; [DATA_MODEL.md](DATA_MODEL.md)) | Server database tables with the same ids, foreign keys, indexes (status, priority, SLA due, assignee, tags) and soft-delete columns |
| `deriveDatabaseVersions` and the blueprint `history` (none yet: schema v1) | Server migrations generated or written from the same history |
| Generated entity services (zod from the field rules, `session.assert`, one transaction per mutation, cascade on delete, audit and notification writes in the same transaction) | API endpoints or server actions with the same inputs, checks and transaction boundaries ([FLOWS.md](FLOWS.md)); bulk delete keeps the soft-delete semantics the dialog promises |
| `derivePolicy` roles and the `:own` rules | Server-side authorization on every request, including "agents delete only tickets assigned to them" and "authors edit only their own replies" ([PERMISSIONS.md](PERMISSIONS.md)) |
| Personas and the DevTools persona switch | A real identity provider, sessions and team memberships |
| `slaDueAt` from the generator only | A real SLA policy service: compute the due time on create and on priority change, pause it on pending or on hold, and alert before a breach |
| Replies stored locally | Outbound email or chat delivery, inbound message threading, and a customer-facing channel |
| `notifications` rows | A notification service with in-app, email or push delivery and per-person preferences |
| Attachments in IndexedDB | Object storage with upload limits, malware scanning, signed download links and removal |
| `auditEntries` written by services | An append-only audit log written server-side in the same transaction as the change |
| `environment.run` failures (offline, timeout, server error) | The error, retry and offline states the real UI must keep (toasts, inline field errors) |
| Scenarios and `enrichHelpdeskWorld` | Seed data for staging, demo desks and test fixtures |
| Screens and flows ([SCREENS.md](SCREENS.md)) | The UI to keep; the listed empty, loading, error and denied states are the acceptance list |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.helpdesk-demo` |
| slug | `helpdesk-demo` |
| name | Beacon Help Desk |
| version | 0.1.0 |
| platform | responsive |
| category | support |
| default scenario | `active` |
| default theme | `ocean` |
| storage namespace | `helpdesk-demo` |
| schema version | 2 |
| generator version | 4121424688 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
