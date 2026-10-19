# SaaS Dashboard

A Protoyard starter for admin-style SaaS apps: a sidebar shell, an **Overview**
with stat cards (30-day sparklines) and a revenue bar chart computed from
stored rows (`@protoyard/charts-ui`: keyboard navigation, tooltips and a data
table toggle), a **Customers**
table (search, status/plan filters, sorting, pagination) with detail pages and
create / edit / delete, **Orders** whose status changes are written together
with an audit event in one transaction, and a **Settings** page whose sections
depend on the persona's role. Everything is persisted in IndexedDB.

```bash
pnpm protoyard new my-admin --template dashboard
pnpm protoyard dev my-admin
```

| Scenario | What you see |
| --- | --- |
| `empty` | Brand-new workspace: every empty state, owner persona |
| `active` *(default)* | 30 days in: 36 customers, ~100 orders in every status, a busy audit trail |
| `power-user` | A year of heavy use: 180 customers, ~900 orders — density and pagination |
| `viewer` | Same world as `active`, seen by a read-only viewer (controls hidden **and** services blocked) |

Personas are fixed so links stay meaningful: `user_0001` Olivia (owner),
`user_0002` Marcus (admin), `user_0003` Priya (member), `user_0004` Victor
(viewer). Open DevTools with **Ctrl/⌘ + .** to switch persona, load
scenarios, go offline, travel in time and take snapshots.

| Role | Customers | Orders | Workspace settings | Billing |
| --- | --- | --- | --- | --- |
| owner | create, edit, delete | create, change status | edit | visible |
| admin | create, edit, delete | create, change status | edit | hidden |
| member | create, edit | create, change status | read-only | hidden |
| viewer | read | read | read-only | hidden |

## Layout

```text
protoyard.json               manifest (id, slug, scenarios, storage namespace + schemaVersion)
src/prototype.ts             definePrototype(): schema + policy + scenarios + generator + integrity rules
src/database/schema.ts       Dexie stores + row types (customers, orders, events, settings); v2 moved order amounts to integer cents
src/domain/policy.ts         roles → capabilities
src/domain/validation.ts     zod input schemas + ValidationError (field → message)
src/domain/services.ts       services: assert → validate → environment.run → db.transaction
src/domain/metrics.ts        pure read-model helpers for the Overview (stats, daily revenue)
src/scenarios/index.ts       scenarios composed from @protoyard/scenarios presets
src/scenarios/generators.ts  generate(ctx) → WorldSeed (deterministic)
src/lib/context.ts           provideDashboard()/useDashboard(): runtime, db, services, live settings
src/lib/format.ts            money (integer cents → currency from settings), dates relative to the SIMULATED clock
src/App.svelte               AppShell + Sidebar + hash routes
src/screens/*.svelte         Overview, Customers, CustomerDetail, Orders, Settings
src/components/*.svelte      dialogs, status badge/menu, MetricCard (StatCard + Sparkline), page header
tests/generators.test.ts     determinism, integrity, density, viewer = active world
tests/services.test.ts       CRUD + reload persistence, status transitions, roles, offline
tests/money.test.ts          exact cents parsing, integer storage, the v1 → v2 migration
tests/overview-charts.test.ts  daily trend series (cents, UTC days, simulated now), MetricCard sparkline
```

## Add a table

Example: a `notes` table attached to customers.

1. **Schema** — in `src/database/schema.ts` add the row type and a **new**
   version (never edit an existing one; this template is at version 2):

   ```ts
   export type Note = { id: string; customerId: string; body: string; authorId: string; createdAt: string };
   // in DashboardDatabase:
   notes: EntityTable<Note, 'id'>;
   // in database.versions:
   { version: 3, stores: { notes: 'id, customerId, createdAt' } },
   ```

   Add `upgrade(tx)` to the version only if existing rows need transforming.
   Upgrades run on the stored database, not on snapshot files: a snapshot
   saved before a version restores its rows as-is (the import warns). For
   example, a v1 snapshot brings back orders with `amount` in dollars and no
   `amountCents`, so the money views cannot total them. Save snapshots again
   after a schema change.
2. Bump `storage.schemaVersion` in `protoyard.json` to `3`.
3. **Generator** — create rows in `generateDashboardWorld` with `ctx.ids.next('note')`,
   `ctx.rng` and `ctx.time`, and return them in `tables: { …, notes }`.
4. **Integrity** — in `src/prototype.ts` add
   `notes: { customerId: 'customers', authorId: 'py_personas' }` to `relations` and
   `notes: ['createdAt']` to `timestamps`. If customers can be deleted, delete their notes
   inside `customers.remove`'s transaction (add `db.notes` to its table list).

## Add a service

Follow `src/domain/services.ts`:

1. Add a capability to `CAPABILITIES` in `src/domain/policy.ts` and grant it to roles.
2. Add a zod schema to `src/domain/validation.ts`.
3. Add the method: `session.assert(CAPABILITIES.x)` first (so it holds even if the
   UI is bypassed), then `parse(Schema, input)`, then
   `environment.run('area.action', () => db.transaction('rw', db.a, db.events, async () => { … }))`
   so offline / latency / failure simulation applies and every related write is atomic.
   Log an `events` row in the same transaction when the change matters to the audit trail.
4. In components call it through `runService(() => services.x(…), { success: 'Saved' })`:
   permission and simulated-network errors become toasts; `ValidationError.issues`
   come back for inline `FormField` errors.
5. Cover it in `tests/services.test.ts` using `harness.boot()` / `harness.reload()`.

## Add a screen

1. Create `src/screens/Invoices.svelte`. Read data with
   `liveQuery(() => db.invoices.toArray(), { initial: [] })` from `useDashboard()`.
   Put any reactive inputs (route params, filters used inside the query) in
   `deps: () => …` — Dexie runs the query outside Svelte's tracking.
2. Register the route in `src/App.svelte`: `{ path: '/invoices', component: Invoices, title: 'Invoices' }`
   (detail pages get `params`, e.g. `/invoices/:id`).
3. Add a `nav` entry in `src/App.svelte` with a Lucide icon and
   `active: router.isActive('/invoices')`.
4. Hide controls with `{#if can(CAPABILITIES.x)}` — the service still enforces the rule.

## Add a scenario

1. Append to `src/scenarios/index.ts`, starting from a preset and overriding what
   differs:

   ```ts
   presetScenario('subscription-expired', {
     id: 'lapsed',
     name: 'Lapsed subscription',
     seed: 77,
     referenceTime: REFERENCE_TIME,
     organization: { ...organization },
     actor: { id: 'user_0001', role: 'owner' },
     generators: { dashboard: { customers: 20, ordersPerCustomer: [0, 3] } },
   }),
   ```
2. List its id in `protoyard.json → scenarios`.
3. The generator reads `generators.dashboard` (`customers`, `ordersPerCustomer`).
   Never use `Math.random()` or `Date.now()` in generators — use `ctx.rng`,
   `ctx.faker`, `ctx.ids` and `ctx.time`. Bump `DASHBOARD_GENERATOR_VERSION`
   when the same seed would produce a different world.
4. `tests/generators.test.ts` runs integrity checks over every scenario automatically.

## Checks

```bash
pnpm vitest run prototypes/my-admin
pnpm --filter @prototype/my-admin typecheck
pnpm protoyard build my-admin
```

## Layouts

The dashboard starts with the sidebar layout and supports the icon rail, top
navigation and dashboard grid. `LayoutHost` receives the workspace navigation
and the currently selected layout from the runtime appearance state.
