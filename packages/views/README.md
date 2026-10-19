# @protoyard/views

Framework-free engines for Protoyard's rich views kit (ADR-022). Board ranks
and WIP limits, calendar recurrence, schedule dependencies, grid
virtualization and filters, trees, offline geo, comments and deterministic
scenario generators run in Node tests, in services and in generators, so this
package never imports Svelte or a UI package. The Svelte half is
[`@protoyard/views-ui`](../views-ui/README.md).

> **Status:** `./board` is implemented; the other subpaths exist and are
> empty until their PLAN_003 task lands, and this README documents each one then.

## Subpaths

Import an engine from its own subpath, never from the root:

```ts
import { rankBetween } from '@protoyard/views/board'; // once the board engine lands
```

| Subpath | Engine |
| --- | --- |
| `./board` | Ordering ranks, WIP limits, swimlanes, keyboard move state |
| `./calendar` | Month/week/day grids, recurrence subset, overlap layout |
| `./timeline` | Dependencies, critical path, cascade |
| `./grid` | Row/column virtualization, column state, grouping, filter AST, saved views |
| `./tree` | Flatten, move, indent/outdent, cycle-safe reparent |
| `./map` | Fictional offline basemap, projection, clustering, geofences |
| `./editor` | Markdown text commands |
| `./activity` | Mention tokenizer, day grouping, change summaries |
| `./notifications` | Notification grouping helpers |
| `./files` | File and folder helpers, deterministic thumbnails |
| `./settings` | Settings helpers |
| `./states` | Query state classification |
| `./commands` | Command registry model |
| `./scenarios` | Deterministic generators and scenario fragments |

The root entry (`@protoyard/views`) exports types only (`ViewName`).

## Board (`@protoyard/views/board`)

Pure functions; persisting a move is the prototype's service job (policy,
zod, `environment.run`, one transaction), and **services must enforce hard
WIP limits too**.

```ts
import { groupBoard, moveIntent, pickUp, rankBetween, validateMove } from '@protoyard/views/board';

const grid = groupBoard(tasks, {
  columns: [{ id: 'todo', title: 'To do' }, { id: 'doing', title: 'Doing', wip: { soft: 3, hard: 5 } }],
  lanes: [{ id: 'web', title: 'Web' }], // optional swimlanes
  id: (t) => t.id, column: (t) => t.status, lane: (t) => t.team, rank: (t) => t.rank,
  label: (t) => t.title,
});
const result = validateMove(grid, 'task-1', { columnId: 'doing', index: 0 });
if (result.ok) await services.moveTask(result.move); // rank, column, lane (+ rerank)
```

- **Ranks** (`rankBetween`, `rankSequence`, `isRank`): fractional base-62
  keys in plain code-unit order. 10,000 appends or prepends stay at most 4
  characters; inserts between neighbors grow only the fraction. When old data
  has duplicate or invalid ranks, `validateMove` returns `move.rerank` (fresh
  ranks for the whole cell) instead of failing.
- **WIP** (`evaluateWip`): `warn` at or above `soft`, `blocked` when the
  column holds `hard` or more (full). Moves into a full column are rejected
  with a reason; reordering inside a column never is.
- **Keyboard drag** (`pickUp`, `moveIntent`): Arrow Left/Right change column,
  Up/Down position, Shift+Up/Down lane, Home/End, Space/Enter drop, Escape
  cancel. Every step returns an `aria-live` announcement; a rejected drop
  keeps the card in hand and says why; a successful drop returns `commit`.
- **Size** (esbuild, minified, gzip -9, 2026-10-19): the whole subpath is
  3.1 KB; `rankSequence` alone 0.95 KB; `groupBoard` + `validateMove` 2.1 KB.

## Tests

```bash
pnpm vitest run packages/views
pnpm --filter @protoyard/views typecheck
```

`tests/package-shape.test.ts` fails if a source file imports Svelte or a UI
package, if the root entry gains a runtime export, or if a subpath is missing.
