---
name: add-entity
description: Add a domain entity to a Protoyard prototype — Dexie table and row type, schema version and migration, policy capabilities, a validated service, liveQuery reads and real-runtime tests.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
# === Documentation (ignored by harnesses, useful for humans) ===
tier: standard
intent: create
max-files: 8
---

# Skill: Add an entity

## Goal

Add a table to a prototype's fake database with the full domain path, so the
UI reads it live and changes it only through a service that enforces policy,
validation, the simulated environment and atomic writes.

## When to use

- A prototype needs a new record type (tasks, invoices, comments…) or a new
  field or index on an existing one.

## Inputs

- `slug`, the entity name (plural table name, singular row type), fields,
  relations, and which roles may read, create, update and delete it.

## Steps

1. **Row type and table** in `prototypes/<slug>/src/database/schema.ts`
   (model: `prototypes/crm-demo/src/database/schema.ts`). Every row has a
   string `id`; money is integer cents; timestamps are ISO strings. Add the
   table to the typed database (`EntityTable<Row, 'id'>`).
2. **Schema version.**
   - On a prototype that has never shipped data, you may extend the existing
     version entry.
   - Otherwise append a **new** entry to `database.versions` with only the
     stores that change, for example
     `{ version: 3, stores: { invoices: 'id, companyId, status, createdAt' } }`.
     Index every field you will query with `where()`; prefix `*` for
     multi-entry arrays.
   - Backfill new fields in `upgrade(tx)`; never delete rows silently.
   - Set `storage.schemaVersion` in `protoyard.json` to the latest version
     (the runtime throws if they differ).
   - Never name a table with the reserved `py_` prefix.
3. **Policy** in `src/domain/policy.ts`: add `resource:action` capabilities
   to `CAPABILITIES` and grant them in `definePolicy({ roles, rules })`
   (`roles` maps each role to capabilities, `'*'` and `-<capability>`
   exclusions; `rules` adds per-record checks such as ownership — see
   `prototypes/crm-demo/src/domain/policy.ts`).
4. **Service** in `src/domain/services.ts`, in this exact order:
   ```ts
   async create(input: InvoiceInput): Promise<Invoice> {
     session.assert(CAPABILITIES.invoicesCreate);          // 1. simulated policy
     const data = parse(InvoiceInputSchema, input);        // 2. zod → ValidationError.issues
     return environment.run('invoices.create', () =>       // 3. latency / offline / failures
       db.transaction('rw', db.invoices, db.activities, async () => {  // 4. atomic writes
         const invoice: Invoice = { id: createRuntimeId('invoice'), ...data, createdAt: now(), updatedAt: now() };
         await db.invoices.add(invoice);
         return invoice;
       })
     );
   }
   ```
   Runtime ids come from `createRuntimeId()`; time from `clock.now()`, never
   `Date.now()`.
5. **Reads** in screens: `liveQuery(() => db.invoices.where('companyId').equals(id).toArray(), { initial: [], deps: () => [id] })`
   from `@protoyard/renderer-svelte`. Every reactive input the querier reads
   goes in `deps`.
6. **Writes** from components only via `runService(() => services.invoices.create(form), { success: 'Invoice created' })`;
   show `ValidationError.issues` inline.
7. **Generator and integrity.** Seed the table in
   `src/scenarios/generators.ts` (deterministic ids via `ctx.ids.next()`),
   add `integrity.relations` / `integrity.timestamps` in `src/prototype.ts`,
   and bump the generator version constant.
8. **Tests** in `prototypes/<slug>/tests/services.test.ts` on the real
   runtime (`createHarness` from `tests/support/runtime.ts`, or the local
   `boot()` pattern in `prototypes/crm-demo/tests/services.test.ts`):
   - create → `reload()` → the row is still there;
   - a restricted persona (`runtime.session.switchActor(<id>)`) gets
     `PermissionDeniedError`;
   - invalid input rejects with field `issues`;
   - `runtime.overrides.set({ environment: { network: 'offline' } })` makes
     the save reject (`code: 'offline'`) and writes nothing.
   For a migration, also open the old version, write a row, upgrade and
   assert the backfill.

## Validation

```bash
pnpm vitest run prototypes/<slug>
pnpm --filter @prototype/<slug> typecheck
pnpm protoyard scenario validate <slug>
pnpm protoyard validate <slug>              # includes the schema-version check
```

## Notes

- Components never call `db.<table>.add/put/update/delete`.
- Related writes (a record and its activity log) share one transaction.
- Roles are a UX simulation, not security; say so in copy where relevant.
