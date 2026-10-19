# @protoyard/views

Framework-free engines for Protoyard's rich views kit (ADR-022). Board ranks
and WIP limits, calendar recurrence, schedule dependencies, grid
virtualization and filters, trees, offline geo, comments and deterministic
scenario generators run in Node tests, in services and in generators, so this
package never imports Svelte or a UI package. The Svelte half is
[`@protoyard/views-ui`](../views-ui/README.md).

> **Status: scaffold.** The subpaths exist and are empty. Each one is filled
> by its PLAN_003 task, and this README documents each engine when it lands.

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

## Tests

```bash
pnpm vitest run packages/views
pnpm --filter @protoyard/views typecheck
```

`tests/package-shape.test.ts` fails if a source file imports Svelte or a UI
package, if the root entry gains a runtime export, or if a subpath is missing.
