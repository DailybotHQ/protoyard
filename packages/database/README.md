# @protoyard/database

IndexedDB persistence for Protoyard prototypes, built on [Dexie 4](https://dexie.org).
Each prototype owns exactly two databases, named from its manifest namespace:

| Database | Contents |
| --- | --- |
| `protoyard.<namespace>.data` | the prototype's domain tables + reserved `py_organizations`, `py_personas`, `py_memberships`, `py_events` |
| `protoyard.<namespace>.control` | active scenario, overrides, clock, actor/org, timeline checkpoint, per-persona preferences, snapshots |

Keeping them apart means session, theme or snapshot bookkeeping can never touch domain
rows, and loading a scenario never deletes saved snapshots.

## API

```ts
import {
  openPrototypeStorage, // both DBs + StorageStatus, with honest in-memory fallback
  openPrototypeDatabase, // data DB only (runs migrations)
  openControlStore,
  dumpTables, restoreTables, clearWorld, countTables,
  deleteProtoyardDatabases,
  probeStorage, requestPersistence,
  StorageError, mapStorageError,
  liveQuery,
} from '@protoyard/database';
```

### Data database and migrations

```ts
const db = await openPrototypeDatabase(definition); // { manifest.storage, database.versions }
const deals = db.rows<Deal>('deals'); // typed Dexie table; unknown names throw
db.domainTables; // ['companies', 'deals']
db.allTables; // domain + reserved
```

- Every `database.versions` entry is declared in order; the reserved tables are merged into
  every version. An `upgrade(tx)` runs through Dexie's `.upgrade()` with a Dexie `Transaction`.
- Tables starting with `py_` are reserved and rejected.
- Opening an **older** database migrates it. Opening a database written by **newer** code
  throws `StorageError('version-newer')` and deletes nothing (Dexie 4 would otherwise open
  it silently, so the native version is compared explicitly).

### Control store

```ts
const control = await openControlStore('crm-demo');
await control.writeState({ actorId: 'user_0002', overrides: null }); // one transaction; null deletes
await control.setPreference('user_0002', { themeId: 'ocean', mode: 'dark' });
await control.putSnapshot(snapshot); // summary and table payload stored separately
await control.listSnapshots(); // newest first, never loads rows
```

### Snapshot I/O

- `dumpTables(db)` reads every domain + reserved table in one read transaction.
- `restoreTables(db, tables, { knownTables })` clears and refills **all** known tables in ONE
  read-write transaction. Unknown tables are skipped and reported. Any failure aborts the
  transaction, so current data stays untouched.
- `clearWorld(db)` empties domain + reserved tables in one transaction.

### Storage status, errors and degraded mode

`StorageError.code` is one of `unavailable | quota-exceeded | version-newer | blocked | unknown`,
with a friendly `message`. `mapStorageError(err)` recognises DOM and Dexie errors, including
errors wrapped in Dexie's `inner` (for example `OpenFailedError` → `InvalidStateError` in
Firefox private mode).

`openPrototypeStorage()` falls back to an in-memory IndexedDB (`fake-indexeddb`, loaded lazily
with a dynamic `import()` so it never ships in the normal path) **only** when IndexedDB is
unavailable. It then reports `{ backend: 'memory', persistent: false, warning }`. Quota,
version and blocked errors are thrown rather than hidden behind memory storage.

`probeStorage()` reports availability, `navigator.storage.estimate()` and `persisted()`.
`requestPersistence()` asks for persistent storage and returns `false` when refused.

`deleteProtoyardDatabases(namespace)` deletes only that prototype's two databases.

**Sandboxes:** `sandboxNamespace(namespace, name)` returns `<namespace>~<name>`; the `~`
never appears in a manifest namespace. `listProtoyardDatabases(namespace)` returns
`{ supported, databases, sandboxes }` using `indexedDB.databases()`, and reports
`supported: false` where the browser can't enumerate. `parseDatabaseName(name)` reads any
`protoyard.<namespace>[~<sandbox>].<data|control>` name.

## Tests

`pnpm vitest run packages/database` covers migrations, version-newer, atomic restore, the
control store, error mapping, memory fallback and namespace-scoped deletion.

## Package output

The manifest keeps TypeScript source exports for workspace development. `pnpm build:packages --filter engine` creates the ESM and declaration files under `dist/` that the packed manifest exposes.
