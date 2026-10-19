# Admin Console

A Protoyard starter for **internal tools**. Staff manage **tenants** (customer
organizations), the **people** in them, **subscriptions**, and an **audit log**
that records every staff action. A support agent can **impersonate** a tenant
person to see what they see. Destructive actions are role-gated and need a
confirmation, and suspending a tenant or impersonating someone also needs a
written reason.

```bash
pnpm protoyard new my-console --template admin-console
pnpm protoyard dev my-console
```

> **Simulation, not security.** Staff roles, impersonation and billing are UX
> simulations in the browser (ADR-008, ADR-018). Impersonation switches the
> runtime's acting persona: nothing real is accessed, and no card or payment
> processor exists.

| Scenario | What you see |
| --- | --- |
| `empty` | Day one: the staff team and no tenants. Shows every empty state. |
| `operations` *(default)* | 24 tenants in every state, their people, subscriptions and history, seen by the platform owner |
| `incident` | 30 tenants, many suspended or past due, seen by the support lead (no billing changes) |
| `support-agent` | Same world as `operations`. Can read and impersonate, can't suspend, disable or change billing. |
| `auditor` | Same world as `operations`, read-only. Every action is hidden and blocked in the services. |

| Staff role | Read | Impersonate | Suspend / disable | Billing (cancel, resume) |
| --- | --- | --- | --- | --- |
| owner (platform owner) | ✓ | ✓ | ✓ | ✓ |
| admin (support lead) | ✓ | ✓ | ✓ | — |
| member (support agent) | ✓ | ✓ | — | — |
| viewer (auditor) | ✓ | — | — | — |

Tenant people have roles `tenant_owner`, `tenant_admin` and `tenant_member`,
with no console capability. While staff impersonate one of them, the app shows
only that person's view under a banner: **"Impersonating Jane Doe (Acme) as
Sam Patel. Simulated session, every action is audited."** and **Stop
impersonating**.

## How it is built

- **Identities.** Every tenant is an organization in `py_organizations`
  (`type: 'tenant'`), and its people are personas with memberships. That's
  what lets impersonation use `session.switchActor`. Staff belong to the
  scenario organization (`type: 'internal'`).
- **Domain tables** (`src/database/schema.ts`): `tenants` (status, plan,
  region, suspension), `user_access` (disable sign-in per person),
  `subscriptions` (plan, status, MRR in integer cents, seats, renewal,
  cancel at period end), and `impersonation` (the active session, so a reload
  keeps the banner).
- **Audit log** = the reserved `py_events` table. Services write an entry
  (`source: 'user'`, with the actor, message, tenant and reason) in the same
  transaction as the change. Generated history has `source: 'seed'`.
- **Services** (`src/domain/services.ts`): `tenants.suspend/reactivate`,
  `users.setDisabled`, `subscriptions.cancel/resume`, and
  `impersonation.start/stop/current`. Each one runs `session.assert` →
  zod → `environment.run` → one transaction. `impersonation.stop()` skips the
  simulated network on purpose, so the way back works even when DevTools has
  the app offline.
- **Screens** (lazy chunks): Overview (KPIs and recent actions), Tenants
  (DataTable with status and plan filters), Tenant detail (people, subscription,
  suspend, reactivate, impersonate), Users (across tenants), and Audit log
  (DataTable with an action filter). Confirmations use `ReasonDialog` (reason
  → audit) or `AlertDialog`.

## Layout

```text
protoyard.json               manifest (scenarios, storage namespace + schemaVersion)
src/prototype.ts             definePrototype(): schema + policy + scenarios + generator + integrity
src/database/schema.ts       Dexie stores + row types
src/domain/policy.ts         staff and tenant roles → capabilities
src/domain/services.ts       services + audit entries + impersonation
src/scenarios/index.ts       scenarios from @protoyard/scenarios presets + `generators.admin` knobs
src/scenarios/generators.ts  generateAdminWorld(ctx): staff → tenants → people → billing → audit
src/lib/queries.ts           read models for screens (liveQuery-friendly)
src/components/              ImpersonationBanner, ReasonDialog, StatusBadge, PageHeader
src/screens/                 Overview, Tenants, TenantDetail, Users, Audit, ImpersonatedView
tests/generators.test.ts     determinism, integrity, identity model, cents
tests/services.test.ts       suspend + audit + reload, role denials, impersonation, offline, UI flows
```

## Customize

- **Add a staff action:** add a capability in `policy.ts` and a service that
  calls `session.assert`, validates, runs `environment.run` and writes the
  change plus `events().add(audit(...))` in one `db.transaction`. Add its
  label to `AUDIT_LABELS`, then add a button behind `can(...)` and a confirmation.
- **Show your product while impersonating:** replace
  `src/screens/ImpersonatedView.svelte` with your app's home screen. The
  banner stays above it.
- **Scenario knobs** (`generators.admin`): `tenants`, `suspendedShare`,
  `pastDueShare`. Generators use `ctx.rng`, `ctx.faker`, `ctx.ids` and
  `ctx.time` only. Bump `ADMIN_GENERATOR_VERSION` when output changes.

## Checks

```bash
pnpm vitest run templates/admin-console
pnpm --filter @protoyard-template/admin-console typecheck
pnpm protoyard validate admin-console --build
```

## Layouts

The admin console starts with the sidebar layout. DevTools can switch it to the
icon rail, top navigation or dual sidebar; navigation and the active persona
are supplied as data to `LayoutHost`.
