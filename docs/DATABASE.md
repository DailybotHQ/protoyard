# Database

Every prototype has a real database in the browser: IndexedDB through
[Dexie 4](https://dexie.org). Records persist across reloads, writes are
transactional, and reads are reactive. This page covers how to model data,
migrate it, write to it and read from it. The API reference is
[packages/database/README.md](../packages/database/README.md); the design
decision is ADR-005 in [DECISIONS.md](DECISIONS.md).

## Two databases per prototype

Names come from `storage.namespace` in `protoyard.json`:

| Database | Contents | Changed by |
| --- | --- | --- |
| `protoyard.<namespace>.data` | Your domain tables plus the reserved `py_*` tables | Services, scenario loads, snapshot restores, time advance |
| `protoyard.<namespace>.control` | Active scenario, overrides, clock, current actor and organization, timeline checkpoint, per-persona preferences, saved snapshots | The runtime and DevTools |

For `crm-demo` (namespace `crm-demo`) that is `protoyard.crm-demo.data` and
`protoyard.crm-demo.control`. A prototype created with `protoyard new` gets
its slug as namespace.

A blueprint that runs without generated code (the player, ADR-030) has no
`protoyard.json`. Its namespace comes from its content instead:
`blueprintIdentity(blueprint)` in `@protoyard/blueprint` returns the SHA-256
of the blueprint's canonical JSON (keys sorted at every depth, no whitespace,
`$schema` left out, defaults applied by `parseBlueprint`), plus the namespace
`bp-` followed by 26 base32 characters of that digest (130 bits), for example
`bp-rey57uisdctysuipi7ptzjvq67`. Key order and formatting never change the
namespace, but any content edit does, so an edited blueprint opens a fresh
world and two blueprints on one origin never share data. `canonicalJson`
is exported for other content-addressed uses. The digest uses Web Crypto,
never the 32-bit `hashString` that generator versions use.

Keeping them apart means a theme or persona change never writes a domain row,
and loading a scenario never deletes your saved snapshots.

### Reserved tables

The platform adds these to every version of your schema. You cannot declare
tables that start with `py_` (opening the database throws).

| Table | Primary key and indexes | Holds |
| --- | --- | --- |
| `py_organizations` | `id` | Organizations (`Organization` in core) |
| `py_personas` | `id` | Simulated people you can act as |
| `py_memberships` | `id, personaId, organizationId` | Who belongs where, with which role |
| `py_events` | `id, type, at, source` | Seed history and applied timeline events (`source`: `seed`, `timeline`, `user`) |

Your rows can reference personas through `py_personas` in integrity rules
(see [SCENARIOS.md](SCENARIOS.md#integrity-rules)).

## Declaring the schema

`src/database/schema.ts` exports a `DatabaseDefinition`: a list of versions
in Dexie store syntax. The first key is the primary key; the rest are
indexes (`*tags` is a multi-entry index). Every row needs a string `id`.

From `templates/blank/src/database/schema.ts`:

```ts
export type Note = {
  id: string;
  title: string;
  body: string;
  /** Persona id (`py_personas`). */
  authorId: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BlankDatabase = Dexie & {
  notes: EntityTable<Note, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [{ version: 1, stores: { notes: 'id, authorId, pinned, updatedAt' } }],
};
```

`BlankDatabase` is how components and services get typed tables:
`runtime.db.notes` is an `EntityTable<Note, 'id'>`. Use a `type` alias (not an
`interface`) for row types so they stay assignable to the generic `Row`.

### Blueprint relation direction

For a blueprint relation, the declaring entity owns the stored foreign key:
`cardinality: 'one'` stores `<field>Id`, and `cardinality: 'many'` stores
`<field>Ids`. `required` controls whether the input must provide an id or a
non-empty id list. The target entity does not get a mirrored column. Related
detail screens resolve the inverse by finding target-side relation fields
whose `to` names the current entity; their field labels are used by the form,
and the related section uses the target entity's plural label. Adding this
metadata does not alter v1 store strings, so existing blueprint databases need
no migration for these semantics.

`definePrototype()` enforces two rules when the app starts:

- Versions must be strictly increasing.
- `storage.schemaVersion` in `protoyard.json` must equal the latest version.

`pnpm protoyard validate <slug>` checks the same thing without opening a
browser.

## Versions and migrations

Never edit a version that has shipped. Add a new one. A version only needs
the stores that change; Dexie keeps the others.

The CRM demo's v1 → v2 migration is the reference example
(`prototypes/crm-demo/src/database/schema.ts`):

```ts
{
  // v2: deals gain a `probability` (indexed for forecast sorting) and
  // companies gain a multi-entry `tags` index. Existing rows are kept and
  // backfilled — nothing is deleted.
  version: 2,
  stores: {
    companies: 'id, name, industry, ownerId, createdAt, *tags',
    deals: 'id, companyId, contactId, ownerId, stage, probability, closeDate, createdAt',
  },
  upgrade: async (tx) => {
    const transaction = tx as Transaction;
    await transaction
      .table<Deal>('deals')
      .toCollection()
      .modify((deal) => {
        if (typeof deal.probability !== 'number') {
          deal.probability = STAGE_PROBABILITY[deal.stage] ?? 0;
        }
      });
    await transaction
      .table<Company>('companies')
      .toCollection()
      .modify((company) => {
        if (!Array.isArray(company.tags)) company.tags = [];
      });
  },
},
```

Then bump `"schemaVersion": 2` in `protoyard.json`.

Rules for migrations:

| Rule | Why |
| --- | --- |
| Never delete user data unless the migration says so explicitly | People have edits in their browser that no seed can recreate |
| Setting a store to `null` deletes that table (Dexie semantics) | Only do it on purpose |
| In `upgrade(tx)`, await only Dexie calls on `tx` | It runs inside an IndexedDB transaction. Awaiting `fetch`, timers or other promises lets the transaction auto-commit and the upgrade fails. |
| Make the upgrade idempotent (`if (typeof x !== 'number')`) | Rows may already have the field (for example, rows seeded by a v2 generator) |
| Update the generator to produce the new shape | Scenario loads write rows directly with the latest schema |

What happens when a browser opens the database:

| Stored version | Result |
| --- | --- |
| Older than the code | Each `upgrade` runs in order. Edits are kept. |
| Same | Opens normally |
| Newer than the code | Throws `StorageError('version-newer')` and deletes nothing. The boot screen offers to reload or reset only this prototype's data. |

## Services: the only way the UI writes

Components never write to the database. They call domain services in
`src/domain/`, and services follow the same four steps:

1. **Policy**: `session.assert(capability, record?)`. A forbidden action
   fails even from the browser console.
2. **Validation**: zod (or hand-written checks) that throw an error with an
   `issues` object, for inline form errors.
3. **Environment**: `environment.run('<area>.<action>', fn)`, so simulated
   latency, offline mode and failures apply (see
   [SCENARIOS.md](SCENARIOS.md#environment)).
4. **Transaction**: `db.transaction('rw', …tables, fn)` whenever more than
   one row or table changes, so related writes land together or not at all.

### Public form response services

Page and doc forms use `createFormServices` from `@protoyard/pages`. It accepts
the runtime and the document's form blocks, validates values against the
selected form, validates the persisted row with `FormResponseSchema`, and
writes only through the `formResponses` feature table. `submit` asserts
`form:submit`; `list` and `exportCsv` assert `form:read`; `clear` asserts
`form:admin`. Each write runs through the simulated environment and a Dexie
transaction. Exported CSV cells are quoted per RFC 4180 and formula-like text
is prefixed so spreadsheet software displays it as text.

Those capabilities are simulated policy checks, not authentication or data
protection. They must be granted by the runtime's policy to the intended
simulated roles. The page/doc minimal runtime currently has an empty world and
policy, so its host must provide an active simulated principal and those grants
before these operations can succeed.

From `prototypes/crm-demo/src/domain/services.ts`:

```ts
async create(input: DealInput): Promise<Deal> {
  session.assert(CAPABILITIES.dealsCreate);
  assertActivePlan();
  const data = parse(DealInputSchema, input);
  return environment.run('deals.create', () =>
    db.transaction('rw', db.companies, db.deals, db.activities, async () => {
      if (!(await db.companies.get(data.companyId))) {
        throw new ValidationError({ companyId: 'That company no longer exists' });
      }
      const deal: Deal = {
        id: createRuntimeId('deal'),
        // …
        createdAt: now(),
        updatedAt: now(),
      };
      await db.deals.add(deal);
      await db.activities.add(
        logActivity('created', `Opened deal “${deal.title}”`, { dealId: deal.id, companyId: deal.companyId })
      );
      return deal;
    })
  );
},
```

When the permission depends on the record, load it first and pass it to
`assert`, so record rules can run (CRM reps edit only their own deals):

```ts
const existing = await db.deals.get(id);
if (!existing) throw new Error('Deal not found');
session.assert(CAPABILITIES.dealsUpdate, existing);
```

When the permission depends on the input, validate first. The banking
transfer (`prototypes/mobile-banking-demo/src/domain/services.ts`) parses the
amount, asserts with it (joint holders are limited to $500), and then moves
money in one transaction that writes the transfer, the debit and credit
ledger rows and both balances:

```ts
const amountCents = Math.round(data.amount * 100);
session.assert(CAPABILITIES.transfersCreate, { amountCents });
// …
return environment.run('transfers.create', () =>
  db.transaction('rw', db.accounts, db.transactions, db.transfers, db.beneficiaries, async () => {
    const from = usable(await db.accounts.get(data.fromAccountId), 'Source');
    // … limit and balance checks throw TransferError → nothing is written
    await db.transfers.add(transfer);
    await db.transactions.add(debit);
    await db.accounts.update(from.id, { balanceCents: from.balanceCents - amountCents });
    if (to) {
      await db.transactions.add({ ...debit, id: createRuntimeId('txn'), accountId: to.id, amountCents /* … */ });
      await db.accounts.update(to.id, { balanceCents: to.balanceCents + amountCents });
    }
    return transfer;
  })
);
```

Read balances and checks inside the transaction, not before it, so a
concurrent write cannot slip in between.

Use the simulated clock for timestamps (`runtime.clock.now()`), never
`new Date()`, so records created while previewing time get consistent
dates.

In components, wrap service calls with `runService()` from
`@protoyard/renderer-svelte`. Permission and simulated network errors become
toasts; errors with an `issues` object come back for inline display:

```ts
const result = await runService(() => services.create(input), { success: 'Created' });
if (!result.ok && isValidationError(result.error)) errors = result.error.issues;
```

### Runtime-created identities

Sign-up, accepted invitations and new workspaces create real personas,
organizations and memberships. Write them through `runtime.identity.write`
(from `@protoyard/runtime`) instead of touching the `py_*` tables directly:

```ts
await environment.run('auth.signUp', () =>
  runtime.identity.write(
    async (ops) => {
      const organization = await ops.putOrganization({ name: data.workspace });
      const persona = await ops.putPersona({ name: data.name, email: data.email });
      await ops.putMembership({ personaId: persona.id, organizationId: organization.id, role: 'owner' });
      await db.workspaces.add({ id: organization.id /* … */ });
      return persona;
    },
    { tables: ['workspaces'] } // domain tables written in the same transaction
  )
);
await session.signIn(persona.id);
```

- Every row is validated with `PersonaSchema`, `OrganizationSchema` or
  `MembershipSchema` before it is written; defaults are filled, `id` defaults
  to a runtime id and timestamps to the simulated clock. A membership must
  point at an existing persona and organization, once per pair. Invalid input
  throws `IdentityValidationError` with an `issues` object (inline form
  errors) and nothing is written.
- The callback runs in one read-write transaction over the identity tables
  plus `tables`; if it throws, nothing is written.
- Afterwards the session re-reads identities, so `personas()`,
  `memberships()` and `principal()` include the change without calling
  `session.refresh()`.
- `identity.write` does not check permissions (sign-up runs signed out).
  Call `session.assert` first when a policy applies. Like personas, this is
  UX simulation, not authentication.
- Runtime-created identities are ordinary rows: they persist across reloads,
  snapshots capture and restore them, and a scenario load replaces them.

## Reactive reads with `liveQuery`

```ts
import { liveQuery } from '@protoyard/renderer-svelte';

const notes = liveQuery(() => runtime.db.notes.toArray(), { initial: [] });
// notes.current, notes.loading, notes.error
```

A live query re-runs whenever the tables it read change, including after a
scenario load, a snapshot restore or a time advance. Call it during component
initialisation (it owns an `$effect`).

| Option | Use |
| --- | --- |
| `initial` | Value of `current` until the first result arrives (`[]` avoids `undefined` checks in lists) |
| `deps` | A function that reads every reactive value the query uses |
| `deferResults` | When `true`, publishes each result from a fresh task instead of the Dexie notification task. Use it when one notification publishes a large result set whose synchronous UI update would make that task too long. Pending publications are cleared when the component unsubscribes. |

`deps` matters because Dexie runs the query asynchronously, outside Svelte's
dependency tracking. Without it, a query that uses a route param or a filter
keeps showing the old result when that value changes. From
`templates/blank/src/screens/NoteDetail.svelte`:

```ts
const note = liveQuery(() => runtime.db.notes.get(id), { deps: () => id });
```

With several inputs, return them all: `deps: () => [id, stage]`.
`deferResults` does not change dependency tracking: continue listing every
reactive query input in `deps`, including inputs only read after an `await`.

## Seeded ids vs runtime ids

| Created by | Helper | Example | Reproducible? |
| --- | --- | --- | --- |
| Scenario generator | `ctx.ids.next('deal')` | `deal_0007` | Yes: same seed, same ids |
| The user, at runtime | `createRuntimeId('deal')` from `@protoyard/core` | `deal_u3f9a1c0b7e42` | No: random by design |

The `u` marker means runtime ids can never collide with seeded ids. Because
they are random, the only way to reproduce a world that contains user edits
is a snapshot (see [SCENARIOS.md](SCENARIOS.md#snapshots)).

## Storage errors

Every IndexedDB or Dexie failure is mapped to a `StorageError` with a
friendly message:

| `code` | Typical cause | What the person sees |
| --- | --- | --- |
| `unavailable` | Private browsing or storage disabled | Memory fallback (below) or an explanation |
| `quota-exceeded` | Origin storage is full | "Delete old snapshots or reset a prototype to free space." |
| `version-newer` | Data written by newer code | "Update the prototype, or reset its data from DevTools. Nothing was deleted." |
| `blocked` | Another tab has an older version open | "Close the other tabs of this prototype and reload." |
| `unknown` | Anything else | A generic message; the original error is kept in `cause` |

If the runtime cannot boot, the renderer shows a recovery screen instead of a
blank page, with "reload" and "reset only this prototype's databases".

### Memory fallback

When IndexedDB is unavailable, the runtime opens an in-memory IndexedDB
(`fake-indexeddb`, loaded only in that case) and reports it:
`runtime.storage()` returns `{ backend: 'memory', persistent: false, warning }`
and the app shows a banner. Changes are lost on reload. Quota, version and
blocked errors are never hidden behind memory storage.

## Persistence caveats

Be honest with the people using a prototype:

- **Per browser and per origin.** Data does not sync between browsers,
  devices or hosts. `localhost:5173` and a published URL are different
  origins with different data.
- **The browser may evict it** under storage pressure. Persistence is never
  assumed. `requestPersistence()` in `@protoyard/database` asks the browser to
  keep the data and returns `false` when refused; the runtime does not call
  it for you.
- **Snapshots count against the same quota.** They are stored in the control
  database.
- **Private windows** may block IndexedDB (memory fallback) or clear it when
  the window closes.
- **Export snapshots of anything worth keeping.** A downloaded snapshot file
  is the only copy that survives the browser.

### Player explorations

The static player keeps its catalog in `protoyard.player.index`, separate from
the data and control databases of every blueprint. By default a blueprint's
content identity supplies a `bp-…` namespace, so two blueprints on one origin
cannot accidentally share rows. `?keep=<name>` instead derives a stable
`keep-…` namespace; reopening that name lets the blueprint's
`deriveDatabaseVersions` migration chain update the existing world.

The player can list each stored exploration by name, last-opened time and a
best-effort origin storage estimate. Clearing an exploration requires explicit
confirmation and deletes only its `.data` and `.control` databases plus its
index row. Storage estimates are origin-wide because browsers do not expose
byte counts per IndexedDB database. This remains an origin-local convenience,
not a security boundary.

### Uploaded files (blobs)

Blueprint file fields store each upload as a row in the shared `files` table,
with the bytes in a `blob` column (`@protoyard/blueprint` `createFileServices`;
50 MB per prototype by default, enforced by the service).

- **Blobs use the same origin storage** as the rest of the data. An upload
  over the prototype's file quota fails with `FileUploadError` code
  `quota-exceeded`. Full origin storage is the `quota-exceeded` storage error
  above.
- **Snapshots leave the bytes out.** Snapshots are JSON, so binary fields are
  set to `null` and only the metadata is kept (`stripBinaryFields` in the
  runtime). A restored snapshot lists the files without their contents.
- **Showing a blob** goes through `URL.createObjectURL`. Revoke the URL when
  the screen goes away. `@protoyard/views-ui/files` (`FileManager`) reads
  blobs through its `getBlob` prop and revokes every URL it created when it
  is destroyed.
- **Files without bytes**, such as seeded files or files restored from a
  snapshot, get a generated SVG thumbnail. It is made from the id alone
  (`@protoyard/views/files` `thumbnailSvg`), with no network and no storage.

## Same origin is not a security boundary

Separate database names keep prototypes from touching each other's data by
accident. They do not stop a script on the same origin from reading or
changing any IndexedDB database there. The gallery and a dev session serve
many prototypes from one origin, so treat every prototype on it as trusted
code. Untrusted prototypes need separate origins. Roles and permissions are a
UX simulation, not security (see [PRODUCT_SPEC.md](PRODUCT_SPEC.md)).

## Testing data code

Run services against the real runtime on an in-memory IndexedDB with the
shared harness in `tests/support/runtime.ts`. `reload()` closes the runtime
and reopens it on the same storage, like a page reload. From
`prototypes/mobile-banking-demo/tests/services.test.ts`:

```ts
let harness = createHarness<BankDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<BankDatabase>(definition);
});

it('transfers atomically between own accounts and the ledger stays balanced after reload', async () => {
  let runtime = await harness.boot('active-customer');
  const bank = createBankServices(runtime);
  const checking = await runtime.db.accounts.get('acct_checking');
  const savings = await runtime.db.accounts.get('acct_savings');
  if (!checking || !savings) throw new Error('accounts');
  await bank.transfer({ fromAccountId: checking.id, toAccountId: savings.id, amount: 125.5, memo: 'Trip fund' });
  runtime = await harness.reload(runtime);
  expect(await ledgerIsBalanced(runtime.db)).toBe(true);
});
```

Run them with `pnpm vitest run prototypes/<slug>`.

## HTTP-style access (optional)

The mock HTTP layer ([`@protoyard/http`](../packages/http/README.md)) never
writes to IndexedDB on its own. Route handlers call the same domain services
(`session.assert` → validation → `environment.run` → `db.transaction`), so
HTTP and direct calls share one source of truth and the same atomicity. The
network log lives in memory only: it is not persisted and is never part of a
snapshot.
