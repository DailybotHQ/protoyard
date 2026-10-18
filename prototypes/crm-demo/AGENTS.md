# AGENTS.md — Pipeline CRM (`crm-demo`)

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

- `deals.amount` is a whole number of US dollars (not cents) and
  `currency` is always `'USD'`; `lib/format.ts` formats it as dollars. Do not
  mix units without a migration.
- Reps update, move and delete only deals they own (`ownerId`): the
  `deals:update` and `deals:delete` rules in `src/domain/policy.ts`. Pass the
  stored deal to `session.assert` and `can`.
- Every stage change sets `probability` from `STAGE_PROBABILITY`, keeps
  `lostReason` only on `lost` and sets or clears `closedAt`, and writes a
  `stage-change` activity in the same transaction (`deals.update`,
  `deals.moveStage` and `applyCrmEvent` must stay consistent).
- Creates call `assertActivePlan()` first, so an expired plan paywalls new
  companies, contacts and deals while data stays readable and editable.
- Deleting a company cascades to its contacts, deals and their activities in
  one transaction; deleting a contact only unlinks it from deals.
- Timeline events depend only on the day and sorted deal ids; follow-ups
  never touch deleted or closed deals. Bump `CRM_GENERATOR_VERSION` when
  generated output changes, and add a schema version with an `upgrade` for
  stored-row changes (v2 is the reference).

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev crm-demo                  # run it (DevTools included)
pnpm vitest run prototypes/crm-demo          # unit + integration tests
pnpm protoyard validate crm-demo --build     # contract, schema, build
pnpm protoyard spec crm-demo --check         # generated spec regions are current
pnpm protoyard export crm-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
