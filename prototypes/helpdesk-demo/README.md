# Beacon Help Desk — `helpdesk-demo`

A support desk **generated from a blueprint**: the PLAN_002 flagship for
`protoyard generate`. Customers, tickets with SLA due times and a status
board, replies and internal notes, attachments, change history,
notifications, CSV import and export, and owner, support lead, agent and
viewer personas. Every action persists in the browser (IndexedDB). All data
is fictional, and the roles are simulated, not real security.

```bash
pnpm protoyard dev helpdesk-demo                  # run it (DevTools included in dev)
pnpm vitest run prototypes/helpdesk-demo          # unit + integration tests
pnpm protoyard validate helpdesk-demo --build     # contract, schema, build
PROTOYARD_E2E_PROTOTYPES=helpdesk-demo pnpm test:e2e
```

[blueprint.json](blueprint.json) declares the entities, roles and
notification rules; `protoyard generate` turns it into `src/generated/**`
(never edit by hand). The dashboard, ticket workspace, scenario enrichment
and search palette are hand-written owned files. After a blueprint change:

```bash
pnpm protoyard generate helpdesk-demo --blueprint prototypes/helpdesk-demo/blueprint.json
pnpm protoyard validate helpdesk-demo
```

## Spec

- [AGENTS.md](AGENTS.md): rules for agents, including generated vs owned files
- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, scenarios, honest boundaries, rebuild path
- [docs/SCREENS.md](docs/SCREENS.md): every route and its states
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, relations, field notes, migrations
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, `:own` rules, personas

Scenarios: `active` (default, 24 tickets), `empty`, `viewer` (read-only) and
`massive` (600 tickets, for performance checks).
