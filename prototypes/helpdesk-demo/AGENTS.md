# AGENTS.md — Beacon Help Desk (`helpdesk-demo`)

The entry point for agents working on this prototype. Repository-wide rules
live in the root [AGENTS.md](../../AGENTS.md); the spec standard is
[docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations, schema versions
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, screens and their states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, rules, personas

## Rules for this prototype

- blueprint.json is the source of truth for entities, fields, roles and
  notification rules. Never edit `src/generated/**` (hash-headed): change
  blueprint.json and run
  `pnpm protoyard generate helpdesk-demo --blueprint prototypes/helpdesk-demo/blueprint.json`.
  Only untouched generated files are rewritten.
- Owned files hold the help desk behavior: `src/screens/Home.svelte` and
  `src/lib/metrics.ts` (dashboard), `src/screens/TicketWorkspace.svelte`,
  `src/scenarios/helpdesk.ts` (enrichment), `src/components/AppSearch.svelte`,
  `src/App.svelte` and `src/prototype.ts`. Screens change data only through
  the generated entity services, `createFileServices` and
  `createNotificationService`.
- Ticket status is `open` → `pending` → `on-hold` → `solved` (`STATUSES` in
  `src/lib/metrics.ts` must match the blueprint enum). SLA math uses the
  simulated clock passed in as `now`, never the real one, and a solved ticket
  counts as met.
- `slaDueAt` is created + `SLA_HOURS[priority]` (4/8/24/72 h) only in the
  generator, and it stays out of the timestamp integrity rule in
  `src/prototype.ts` because it is a future instant. Bump `generatorVersion`
  (now 2) when `enrichHelpdeskWorld` output changes.
- `:own` rules key on `accountManagerId` (customers), `assigneeId` (tickets)
  and `authorId` (replies); without a record they are false for agents. Pass
  the stored record to `can()` when gating a per-record action.
- Customers and tickets soft-delete (Trash, 30-second Undo on the simulated
  clock); replies hard-delete; `bulkRemove` and `purge` hard-delete. A
  customer delete cascades to its tickets and their replies.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev helpdesk-demo                  # run it (DevTools included)
pnpm vitest run prototypes/helpdesk-demo          # unit + integration tests
pnpm protoyard validate helpdesk-demo --build     # contract, schema, build
pnpm protoyard spec helpdesk-demo --check         # generated spec regions are current
pnpm protoyard export helpdesk-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
