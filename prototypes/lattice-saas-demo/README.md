# Lattice

Lattice is a fictional team-planning SaaS workspace for coordinating project
portfolios, delivery health, and team collaboration. It is built from the
`b2b-saas` template and showcases the SaaS kits inside a complete product
experience.

## Run locally

```bash
pnpm protoyard dev lattice-saas-demo
pnpm protoyard scenario list lattice-saas-demo
pnpm protoyard scenario validate lattice-saas-demo
pnpm protoyard validate lattice-saas-demo --build
```

Start with the signed-out visitor scenario to walk through sign-up or simulated
Google SSO and consent, then continue into the onboarding wizard. In the
workspace, create and update projects, switch workspaces, invite teammates,
review the inbox, choose a simulated plan, and manage profile and security
settings.

## Walkthrough scenarios

- `signed-out` — public Lattice landing page and simulated sign-in / sign-up.
- `mid-onboarding` — a workspace owner halfway through setup.
- `trial-ending` — two days remain in the simulated trial; compare plans or
  continue into checkout.
- `past-due` — review a failed invoice and the simulated billing portal.
- `multi-workspace-admin` — an admin with three workspaces and project access.
- `viewer` — a read-only role for the project portfolio.
- `mfa-enrolled` — an account with simulated multi-factor authentication.
- `pending-invite` — a workspace with a pending teammate invitation.

The project portfolio is stored in this prototype's IndexedDB database.
Project writes go through validated, permission-checked services; onboarding,
workspace membership, invitations, billing and settings use the SaaS kits.

## Simulation boundaries

All people and organizations are fictional. Authentication, Google SSO, email,
invitations, roles, and billing are local simulations: no provider, mailbox,
payment method, or external service is contacted. Simulated roles demonstrate
the product experience and are not a security boundary.
