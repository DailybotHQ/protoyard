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
- Money is integer cents, and `LATTICE_PLANS` in `src/domain/plans.ts` is the
  only price source (`pro` 1900, `team` 4900 cents per seat per month,
  14-day trials): `createBilling` in `src/App.svelte` and the generator
  (`seededPlanPrices()`) both read it. Change prices there and bump
  `B2B_SAAS_GENERATOR_VERSION`.
- The app boots signed out (`auth.signedOutByDefault`) and
  `applySaasScenarioSession` signs out once per load in `signed-out`. Routes
  and the kit UI config (SSO providers, the sign-up inbox hand-off) live in
  `src/saas.ts`. `/app` and `/projects` use `requireSaasApp` (signed in and
  onboarded); keep new app routes behind the same guard. Lattice serves
  `/inbox` (signed in, or `?account=` for a pending sign-up,
  `src/domain/pending-inbox.ts`) and `/onboarding` (the kit wizard with
  `latticeOnboardingSteps`, `src/domain/onboarding.ts`) itself.
- Onboarding data changes are engine step `effect`s, never `apply`: they run
  in the same `identity.write` transaction as the step's answer.
- Every signed-in persona signs out from the header (`SignOutButton`,
  `auth.signOut`, no capability); Settings → Security's sign-out stays
  `settings:security`.
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
