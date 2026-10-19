# Lattice — `lattice-saas-demo`

Lattice is a fictional team-planning SaaS workspace: a project portfolio per
workspace wrapped in the full product journey around it (landing page,
sign-up and sign-in, magic links, password reset, simulated MFA, onboarding,
workspaces, members and invitations, an inbox, plans, checkout and a billing
portal). It is built from the `b2b-saas` template and is the flagship for the
[SaaS kits](../../docs/SAAS_KITS.md). Every action persists in the browser
(IndexedDB). All people and organizations are fictional; authentication,
email, invitations, roles and billing are local simulations, not security.

```bash
pnpm protoyard dev lattice-saas-demo                  # run it (DevTools included in dev)
pnpm vitest run prototypes/lattice-saas-demo          # unit + integration tests
pnpm protoyard scenario list lattice-saas-demo
pnpm protoyard scenario validate lattice-saas-demo
pnpm protoyard validate lattice-saas-demo --build
```

Start with the default `signed-out` scenario: sign in as `owner@example.com`
with the simulated password `demo-password`, finish onboarding, then work
with projects, members, the inbox, plans and settings. You can also create
an account (its confirmation message opens from "Open simulated inbox") or
use a simulated "Continue with …" provider, which lands a new account in
onboarding. Every role signs out from the header. Seven more scenarios
cover mid-onboarding, a trial ending, past-due billing, a multi-workspace
admin, a viewer, MFA and a pending invitation.

## Spec

- [AGENTS.md](AGENTS.md): rules for agents working on this prototype
- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, scenarios, honest boundaries, rebuild path
- [docs/SCREENS.md](docs/SCREENS.md): every route, its guard and its states
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): `projects` and the `saas_*` kit tables
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, personas
