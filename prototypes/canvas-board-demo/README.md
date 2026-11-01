# Canvas Board Demo

Planning boards on an infinite canvas: frames, sticky notes, shapes and
connectors, drawn with `CanvasView` from `@protoyard/views-ui/canvas` (Texuli's
`@texuli/canvas` editor). Every change saves the board through a service into
IndexedDB, so it survives a reload. Two personas (owner, viewer) and five
scenarios.

| Scenario | What you see |
| --- | --- |
| `empty` | Brand-new workspace, no boards yet |
| `active` *(default)* | Three planning boards (Ideas, Doing, Done frames of sticky notes, connectors) |
| `crowded` | The first board holds 1,500 sticky notes: pan, zoom, the minimap and the shape list |
| `awkward` | Nested frames, a rotated and a locked note, a long note, connectors to a free point and between frames |
| `viewer` | Same world as `active`, read-only (editing blocked in the UI **and** the services) |

Open DevTools with **Ctrl/⌘ + .** to switch persona, load scenarios, go
offline, change theme, travel in time and take snapshots.

## Using a board

- Tab moves between shapes in reading order; arrow keys move them one grid
  step; Enter edits text; Ctrl/⌘ + Z undoes.
- "Download SVG" exports the board; "Import JSON" replaces it with a canvas
  file, which is validated as untrusted input first.
- A save that fails (offline, a simulated failure, or a viewer) puts the
  stored board back.

## Layout

```text
protoyard.json               manifest (id, slug, scenarios, storage namespace + schemaVersion)
src/prototype.ts             definePrototype(): wires everything below
src/database/schema.ts       Dexie store `boards` + the Board row (canvas: CanvasDocument)
src/domain/policy.ts         roles → boards:read/create/update/delete
src/domain/boards.ts         services: assert → validate (title, validateCanvas) → environment.run → write
src/scenarios/index.ts       scenario definitions (seed, referenceTime, actor, generators.boards/boardLevel)
src/scenarios/generators.ts  generate(ctx) → WorldSeed, boards from generateCanvasBoard (deterministic)
src/screens/BoardsList.svelte   create and list boards
src/screens/BoardScreen.svelte  one board in CanvasView (lazy route) and delete
tests/canvas-board.test.ts   generator, scenario and service tests (vitest, fake IndexedDB)
```

## Checks

```bash
pnpm vitest run prototypes/canvas-board-demo
pnpm protoyard validate canvas-board-demo --build
```

Honest limits: one person edits a board at a time (no collaboration), the
whole board saves after each change, and export is SVG only.
