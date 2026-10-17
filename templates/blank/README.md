# Blank

A minimal but real Protoyard prototype: a **Notes** list with create / edit /
pin / delete, persisted in IndexedDB, two personas (owner, viewer) and three
scenarios. Copy it with:

```bash
pnpm protoyard new my-idea --template blank
pnpm protoyard dev my-idea
```

| Scenario | What you see |
| --- | --- |
| `empty` | Brand-new workspace, empty state |
| `active` *(default)* | 12 notes, some pinned |
| `viewer` | Same world as a read-only viewer (create/edit/delete blocked in UI **and** services) |

Open DevTools with **Ctrl/⌘ + .** to switch persona, load scenarios, go
offline, change theme, travel in time and take snapshots.

## Layout

```text
protoyard.json            manifest (id, slug, scenarios, storage namespace + schemaVersion)
src/prototype.ts          definePrototype(): wires everything below
src/database/schema.ts    Dexie stores + typed rows
src/domain/policy.ts      roles → capabilities
src/domain/notes.ts       services: assert → validate → environment.run → write
src/scenarios/index.ts    scenario definitions (seed, referenceTime, actor, density…)
src/scenarios/generators.ts  generate(ctx) → WorldSeed (deterministic)
src/screens/*.svelte      routed screens   src/components/*.svelte  pieces
tests/blank.test.ts       generator + service tests (vitest, fake IndexedDB)
```

## Add a table

1. In `src/database/schema.ts` add a **new** version — never edit an old one:
   `{ version: 2, stores: { tags: 'id, name' } }` and add `tags: EntityTable<Tag, 'id'>` to `BlankDatabase`.
   Add an `upgrade(tx)` if existing rows need transforming.
2. Bump `storage.schemaVersion` in `protoyard.json` to `2`.
3. Return rows from the generator: `tables: { notes, tags }`.

## Add a service

Follow `src/domain/notes.ts`: `session.assert('<capability>')` first (so the
rule holds even if the UI is bypassed), validate input, wrap the write in
`environment.run('<area>.<action>', …)` so offline/latency/failure simulation
applies, then write with Dexie (use `db.transaction('rw', …)` for multi-table
writes). Add the capability to a role in `src/domain/policy.ts`. In
components, call services through `runService()` for consistent toasts.

## Add a screen

Create `src/screens/Thing.svelte` (it receives `params`), register
`{ path: '/things/:id', component: Thing }` in `src/App.svelte`, and link with
`<a href="#/things/1">`. Read data reactively with
`liveQuery(() => runtime.db.things.toArray())`.

## Add a scenario

Append to `src/scenarios/index.ts` **and** list its id in
`protoyard.json → scenarios`. Use `generators` for template-specific knobs
(`generators: { notes: 30 }`). Generators must use `ctx.rng`, `ctx.faker`,
`ctx.ids` and `ctx.time` — never `Math.random()` or `Date.now()`.

## Checks

```bash
pnpm vitest run templates/blank
pnpm --filter @protoyard-template/blank typecheck
pnpm --filter @protoyard-template/blank build
```
