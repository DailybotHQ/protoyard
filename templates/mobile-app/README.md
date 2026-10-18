# Mobile app

A mobile-first Protoyard starter: a bottom navigation, a sticky mobile header, and a real
**Items** list → detail → create/edit flow persisted in the browser. It has two personas
(owner, read-only viewer) and three scenarios. Built to be extended.

```bash
pnpm protoyard new my-phone --template mobile-app   # create a prototype from this template
pnpm protoyard dev my-phone                          # run it
pnpm vitest run prototypes/my-phone                  # tests
pnpm --filter @prototype/my-phone typecheck
```

## What's inside

```text
src/
├── App.svelte              router (hash routes) + MobileAppShell + in-flow BottomNav
├── prototype.ts            definePrototype: manifest + schema + policy + scenarios + generator
├── database/schema.ts      the `items` table (Dexie store syntax) and its row type
├── domain/items.ts         services: assert permission → validate → environment.run → write
├── domain/policy.ts        roles → capabilities (owner: everything, viewer: read)
├── scenarios/index.ts      empty · active · viewer
├── scenarios/generators.ts deterministic world (seeded rng, fixed reference time)
├── lib/context.ts          provideApp()/useApp(): runtime, db and services for screens
├── components/             Page (MobileHeader + banners), Notice, Segmented, StatusBadge
└── screens/                ItemsList, ItemDetail, ItemEdit (new + edit), Profile
```

- **Persistence:** screens read with `liveQuery(() => db.items…)`, so every change (yours,
  a scenario load, a snapshot restore) re-renders on its own. Reloading keeps your edits.
- **Permissions:** the UI hides what a role can't do (`can(...)`), and the services also call
  `session.assert(...)`, so bypassing the UI still fails.
- **Conditions:** offline, slow and failing-server modes from DevTools show a banner. Failed
  writes save nothing, and `runService` turns them into toasts.
- **Mobile:** `MobileAppShell` (from `@protoyard/ui`) is exactly one app height tall. Only
  `<main>` scrolls, and the `BottomNav` sits in normal flow below it (`fixed={false}`), so the
  nav is always visible and the page itself never scrolls. On a desktop window the renderer
  frames the app as a phone (`platform: "mobile"`, ADR-016); on a real phone it is full-bleed.
  Screen-level primary actions can go in the shell's `stickyFooter` snippet. The template
  also has 44px touch targets and safe-area insets (simulated inside the frame).
  Light/dark/system is saved per persona from Profile.

## Extend it

**Add a table**

1. In `src/database/schema.ts`, add a type and a **new** version. Never edit a version that
   has shipped:
   ```ts
   versions: [
     { version: 1, stores: { items: 'id, status, ownerId, updatedAt' } },
     { version: 2, stores: { tags: 'id, name' } },
   ]
   ```
2. Bump `storage.schemaVersion` in `protoyard.json` to `2`.
3. Add `tags: EntityTable<Tag, 'id'>` to `AppDatabase`.
4. Generate rows in `scenarios/generators.ts` (`tables: { items, tags }`), and declare
   foreign keys in `prototype.ts` → `integrity.relations` so broken generators fail loudly.

**Add a service:** copy the shape of `createItemServices` and keep the four steps
(`session.assert` → validate → `environment.run` → Dexie write). Throw an error with an
`issues` object for field errors; forms read them from `runService`'s result.

**Add a screen:** create `src/screens/Thing.svelte`, register `{ path: '/things/:id',
component: Thing }` in `App.svelte`, and optionally add a tab to the `BottomNav` items. Wrap
it in `<Page title="…" backHref="#/">` to get the header and condition banners.

**Add a scenario:** append it to `scenarios/index.ts` **and** list its id in
`protoyard.json` → `scenarios`. Reuse presets with `extends: 'first-week'` (see
`@protoyard/scenarios`). Seeds and `referenceTime` make every world reproducible. Bump
`generatorVersion` in `prototype.ts` when the same seed starts producing different data.

**Add a role:** add it to `domain/policy.ts` and give a persona that membership role in the
generator.
