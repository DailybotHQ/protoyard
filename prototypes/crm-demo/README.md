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

- `tests/services.test.ts` (the only file since PLAN_009): runs on the **real
  runtime** with an in-memory IndexedDB. The boot smoke checks determinism and
  integrity for every scenario (the massive one for integrity only), then the
  file covers deal CRUD across reloads, persona switches with service-level
  permissions, overrides that never touch records with honest offline
  failures, and snapshot restore.
