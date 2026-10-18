# Beacon Help Desk

A support desk **generated from a blueprint**: the PLAN_002 flagship for
`protoyard generate`. Everything is fictional and simulated (roles are UX, not
security; data lives only in this browser).

```bash
pnpm protoyard dev helpdesk-demo
pnpm vitest run prototypes/helpdesk-demo
pnpm protoyard validate helpdesk-demo --build
PROTOYARD_E2E_PROTOTYPES=helpdesk-demo pnpm test:e2e
```

## What comes from the blueprint

[blueprint.json](blueprint.json) declares customers, tickets (status, priority,
channel, SLA due, assignee, attachments, tags) and replies, four roles (owner,
support lead, agent, viewer) and notification rules. `protoyard generate`
turned it into:

- `src/generated/**` (hash-headed, rewritten by regeneration; never edit):
  the Dexie schema, capability policy, entity services, the lazy world
  generator, routes and one lazy screen per entity.
- Generated list, form and detail screens from `@protoyard/crud`: search,
  sort, pagination, bulk delete, soft delete with Undo and a Trash view,
  CSV import and export, audit history.

## What is hand-written (owned files)

| File | What it adds |
| --- | --- |
| `src/screens/Home.svelte` + `src/lib/metrics.ts` | Dashboard: SLA counters, a status board with move buttons, agent load |
| `src/screens/TicketWorkspace.svelte` | Ticket workspace: drag-and-drop attachments, replies and internal notes, Mark solved |
| `src/scenarios/helpdesk.ts` | Deterministic enrichment of the generic world: support subjects, weighted statuses and priorities, SLA due = created + 4/8/24/72 h by priority |
| `src/components/AppSearch.svelte` | ⌘K search across every entity, driven by the blueprint |
| `src/App.svelte`, `src/prototype.ts` | The workspace route, nav labels and icons; integrity without the future-dated `slaDueAt` |

## Regenerate after a blueprint change

```bash
pnpm protoyard generate helpdesk-demo --blueprint prototypes/helpdesk-demo/blueprint.json
pnpm protoyard validate helpdesk-demo
```

Only untouched files under `src/generated/` are rewritten; owned files stay
as they are. A storage change appends a database version from the history in
blueprint.json, so existing browser data migrates.

## Scenarios

`empty`, `active` (24 tickets), `viewer` (read-only) and `massive` (600 tickets,
for performance checks).
