# Pipeline CRM — `crm-demo`

A lightweight sales CRM built on Protoyard. Companies, contacts, an editable
deal pipeline and an activity history, with owner, admin, sales-rep and
viewer personas. Every action persists in the browser (IndexedDB) and
survives reloads. All companies and people are fictional, and the roles are
simulated, not real security.

```bash
pnpm protoyard dev crm-demo        # run it (DevTools included in dev)
pnpm protoyard build crm-demo      # static build → artifacts/crm-demo/dist
pnpm protoyard export crm-demo     # + portable ZIP
pnpm vitest run prototypes/crm-demo
```

## Spec

- [AGENTS.md](AGENTS.md): rules for agents working on this prototype
- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, scenarios, honest boundaries, rebuild path
- [docs/SCREENS.md](docs/SCREENS.md): every route and its states
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, relations, field notes, the v1 → v2 migration
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, record-level rules, personas

## Tests

- `tests/generators.test.ts`: determinism, referential integrity and time
  bounds for every scenario, and scenario semantics.
- `tests/services.test.ts`: runs on the **real runtime** with an in-memory
  IndexedDB. Covers CRUD across reloads, persona switches with service-level
  permissions, overrides that never touch records, offline failures, snapshot
  restore, scenario reload determinism, idempotent time advance (7×1 day
  equals 1×7 days) and `lostReason` / `closedAt` consistency.
- `tests/enterprise-scale.test.ts`: the `enterprise-scale` world is large,
  deterministic and referentially valid.
