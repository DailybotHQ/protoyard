# AGENTS.md — Lattice (`lattice-saas-demo`)

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

- `projects` is the only table this prototype owns. Every project write goes
  through `createProjectServices` in `src/domain/projects.ts`, which scopes
  rows to the active workspace (`organizationId`) and sets
  `ownerPersonaId` from the session. Status is `planning`, `active` or
  `complete` (`PROJECT_STATUSES`).
- Accounts, tokens, MFA, invitations, inbox, onboarding and billing belong to
  the SaaS kits (`@protoyard/saas`, `@protoyard/saas-ui`; see
  [docs/SAAS_KITS.md](../../docs/SAAS_KITS.md)). Change them in the kit
  packages, not here, and use the kit services instead of writing `saas_*`
  tables.
- Money is integer cents: the plan catalog (`pro` 1900, `team` 4900 cents per
  seat per month, 14-day trials) is passed to `createBilling` in
  `src/App.svelte`. Seeded subscriptions use the kit's default prices, so
  keep both in mind when changing prices.
- The app boots signed out (`auth.signedOutByDefault`) and
  `applySaasScenarioSession` signs out once per load in `signed-out`. `/app`
  and `/projects` use `requireSaasApp` (signed in and onboarded); keep new
  app routes behind the same guard.
- `src/database/schema.ts` spreads `saasStores(1)`; add kit or project
  changes in a new schema version. Integrity merges
  `saasScenarioIntegrity()` with the project relations in
  `src/prototype.ts`. Bump `B2B_SAAS_GENERATOR_VERSION` when
  `generateB2bSaasWorld` output changes.
- Every seeded persona signs in with `demo-password`; the scenario actor is
  `owner@example.com`. Keep all addresses fictional (`example.com`).

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev lattice-saas-demo                  # run it (DevTools included)
pnpm vitest run prototypes/lattice-saas-demo          # unit + integration tests
pnpm protoyard validate lattice-saas-demo --build     # contract, schema, build
pnpm protoyard spec lattice-saas-demo --check         # generated spec regions are current
pnpm protoyard export lattice-saas-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
