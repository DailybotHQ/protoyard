# @protoyard/views

Framework-free engines for Protoyard's rich views kit (ADR-022). Board ranks
and WIP limits, calendar recurrence, schedule dependencies, grid
virtualization and filters, trees, offline geo, comments and deterministic
scenario generators run in Node tests, in services and in generators, so this
package never imports Svelte or a UI package. The Svelte half is
[`@protoyard/views-ui`](../views-ui/README.md).

> **Status:** `./board`, `./calendar`, `./grid`, `./map`, `./editor`,
> `./scenarios`, `./timeline` and `./tree` are implemented; the other
> subpaths exist and are empty until their PLAN_003 task lands, and this
> README documents each one then.

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

## Calendar (`@protoyard/views/calendar`)

Hand-written date math (no date library) in an **explicit IANA time zone**:
pass the persona's `timezone` (core `PersonaSchema`, default `UTC`) and
`today` from the runtime clock. Nothing reads `Date.now()` or the system zone.

```ts
import { expandAll, layoutDay, monthGrid, splitSeries, visibleRange, weekStartFor } from '@protoyard/views/calendar';

const weekStartsOn = weekStartFor(persona.locale); // en-US → 0 (Sunday), fr-FR → 1
const range = visibleRange('week', today, { weekStartsOn, timeZone });
const { occurrences, truncated } = expandAll(series, range, { timeZone }); // ≤ 1,000 per call
const columns = layoutDay(occurrences.map(toTimedEvent), { date: today, timeZone });
const writes = splitSeries(series, occurrenceId, 'following', { start }, { newId: () => ids.next() });
// writes.put / writes.delete go to the service, in one transaction
```

- **Grids:** `monthGrid` (six weeks × seven days, `inMonth`, `isToday`),
  `weekDates`, `visibleRange` for month/week/day/agenda (dates plus the
  instants to query), `stepAnchor`, `weekStartFor(locale)`.
- **Recurrence** (`expandSeries`, `expandAll`, `RecurrenceRuleSchema`,
  `parseRRule`, `formatRRule`): an RFC 5545 subset (FREQ DAILY/WEEKLY/MONTHLY/
  YEARLY, INTERVAL, BYDAY with ordinals such as `2TU` or `-1FR`, BYMONTHDAY
  including negatives, COUNT, inclusive UNTIL), EXDATE and per-occurrence
  overrides (an override can move an occurrence into or out of the window).
  Occurrences repeat at the series' wall-clock time in its zone, so 09:00
  stays 09:00 across DST. COUNT counts EXDATEs, as the RFC does. Dates a rule
  cannot hit (the 31st, Feb 29) are skipped. Results are capped at 1,000 and
  ordered by start, series id, occurrence id. Occurrence ids are the original
  start, so they stay stable when an occurrence moves.
- **DST:** a skipped wall time (02:30 on a spring-forward night) moves forward
  by the jump; a repeated one takes the earlier instant.
- **Edits** (`splitSeries`): `this` writes an override (or an EXDATE for a
  delete); `all` moves the series and re-keys its exceptions; `following`
  ends the series one second before the occurrence (or splits COUNT) and
  starts a new series there (on the first occurrence it is `all`). Unknown or
  excluded occurrences throw a `RangeError`.
- **Day layout** (`layoutDay`): side-by-side columns for overlapping timed
  events, positioned in wall-clock minutes so they line up with hour labels
  on 23- and 25-hour days; multi-day events are clipped (`continuesBefore`,
  `continuesAfter`); all-day events are skipped (they go in the all-day row).
- **Size** (esbuild, minified, gzip -9, zod excluded because every prototype
  already loads it; 2026-10-19): the whole subpath is 4.9 KB; what a calendar
  view imports (grid, expansion, split, layout, rule schema) is 4.3 KB;
  `monthGrid` + `visibleRange` alone 1.2 KB.
- **Limits:** no BYMONTH, BYSETPOS, BYHOUR or BYWEEKNO; weekly rules use WKST
  Monday; a "this and following" edit that changes the time of day keeps the
  later exceptions shifted by the same amount.

## Grid (`@protoyard/views/grid`)

```ts
import { applyView, compileFilter, createAxis, resolveColumns, sanitizeView, windowGrid } from '@protoyard/views/grid';

const columns = [
  { key: 'name', header: 'Name', type: 'text' },
  { key: 'amount', header: 'Amount', type: 'number', accessor: (d) => d.amountCents },
];
const { view, dropped } = sanitizeView(storedView, columns); // stored data may be stale or untrusted
const { rows, groups } = applyView(deals, view, columns, { aggregates: [{ key: 'amount', fn: 'sum' }] });
const layout = resolveColumns(columns, view.columns); // left / center / right / hidden
const visible = windowGrid({ rows: createAxis({ count: rows.length, size: 36 }), columns: centerAxis, … });
```

- **Virtualization** (`createAxis`, `windowAxis`, `windowGrid`): a default
  size plus sparse measured sizes (prefix sums over sorted indices), so
  100,000 rows cost nothing until measured and lookups are O(log n). Pinned
  columns are always rendered and only the center region is windowed. The
  chat virtualizer in `@protoyard/ai-ui` (`virtual.ts`) follows the same idea
  for one axis; the kits do not import each other, so the logic is duplicated
  on purpose.
- **Column state** (`ColumnStateSchema`, `resolveColumns`, `moveColumn`,
  `resizeColumn`, `pinColumn`, `setColumnHidden`): order, width (clamped to
  each column's min/max), pin side and visibility, as plain JSON. New columns
  appear at the end and stale entries are ignored.
- **Sorting** (`sortRows`, `SortSchema`): stable, multi-key, empty values last
  in both directions. Text uses `Intl.Collator` with an explicit locale
  (default `en`, never the system locale) when a column has up to 5,000
  distinct values; above that it sorts by a folded key (case and accents
  folded, digit runs padded) at native speed, which matches the collator for
  Latin text and keeps code-point order for other scripts.
- **Filters** (`compileFilter`, `FilterNodeSchema`, `filterSchemaFor`,
  `OPERATORS_BY_TYPE`): an and/or tree of conditions (`eq`, `neq`,
  `contains`, `in`, `between`, `before`, `after`, `isEmpty`, `isNotEmpty`),
  validated with zod against the columns (unknown fields, operators that do
  not fit the type and bad values are `ZodError`s), bounded to 6 levels and
  200 nodes, and compiled to closures (never `eval` or `new Function`). Text
  comparisons ignore case.
- **Grouping** (`groupRows`, `flattenGroups`): one column, groups ordered by
  value with the empty group last, `count`/`sum`/`min`/`max` aggregates, and a
  flat header-plus-rows list (honoring collapsed groups) for the virtualizer.
- **Saved views** (`SavedViewSchema`, `applyView`, `sanitizeView`):
  `{ id, name, columns, sort, groupBy, filter, density }`, strict and bounded,
  safe to store in IndexedDB and import from snapshots. `sanitizeView` removes
  references to columns that no longer exist and lists what it removed.
- **Speed** (100,000 in-memory rows): `tests/grid.test.ts` asserts each of
  multi-key sort, unique-text sort, filter and group in under 150 ms, scaled
  by a same-process calibration (a native sort of 100,000 numbers) on a busy
  machine. Measured on 2026-10-19 on the reference M1 Max while the machine
  was heavily loaded (load average 70–130), best of three: multi-key sort
  101–273 ms, unique-text sort 174–676 ms, filter 9–32 ms, group 16–56 ms.
  Quiet-machine numbers are not measured yet; the browser benchmark is
  T-grid-perf-bench.
- **Size** (esbuild, minified, gzip -9, zod excluded): the whole subpath is
  4.6 KB; what a grid view imports is 4.0 KB; the virtualizer alone 0.6 KB.

## Map (`@protoyard/views/map`)

An offline, **simulated** map: no tiles, no network, no geocoding, no real
geography. The bundled basemap is **Port Meridian**, a fictional coastal city
drawn as data. Its box is the `harbor-bay` region of `@protoyard/scenarios`
geo (open South Atlantic, far from any coast) and its districts sit on that
region's anchors, so `geoPoints({ region: 'harbor-bay' })` lands on it.

```ts
import { basemapPaths, cluster, fenceTransitions, fitBounds, PORT_MERIDIAN, zoomAround } from '@protoyard/views/map';

let view = fitBounds(PORT_MERIDIAN.bbox, size); // { center, zoom }
const paths = basemapPaths(PORT_MERIDIAN, view, size); // [{ id, kind, d, label }] for <path d={…}>
const items = cluster(jobs, view.zoom, 64); // points and clusters (with bbox for "zoom in")
view = zoomAround(view, 1, size, pointer); // wheel / pinch / + key
const events = fenceTransitions(track, fences); // enter / exit per fence
```

- **Basemap data** (`BasemapSchema`, `PORT_MERIDIAN`): features (`land`,
  `water`, `park`, `district`, `road`, `rail`) with flat `[lng, lat, …]`
  arrays. Prototypes may pass their own basemap for another fictional place;
  it is validated (pairs, ranges, kinds, strict keys, at most 2,000
  features). `basemapPaths` returns SVG path data built only from numbers and
  `M`/`L`/`Z`, culled to the view, so data can never inject markup (render
  with `<path d={path.d}>`, never `{@html}`). Its attribution says the place is
  fictional; the UI must show it.
- **Views** (`fitBounds`, `project`, `unproject`, `zoomAround`, `panBy`,
  `viewBounds`): Web Mercator with a center and a fractional zoom (a 256 px
  world at zoom 0). Zooming keeps the point under the pointer fixed.
- **Clustering** (`cluster(points, zoom, cellPx)`): buckets in the zoom's
  world grid (stable while panning), deterministic (sorted by id), single
  points stay points, and each cluster has a stable id, its member ids and a
  box for "zoom to cluster".
- **Geofences** (`GeofenceSchema`, `pointInRing`, `ringContains`,
  `ringSelfIntersects`, `fencesAt`, `fenceTransitions`): polygons (planar
  even-odd, edges count as inside) and circles (haversine radius), and enter
  and exit events for a moving point (a track that starts inside does not
  "enter" unless `initiallyInside` says it was outside).
- **Distances** (`haversine`, `routeLength`, `etaSeconds`, `pointAlong`,
  `nearest`): great-circle meters, route length, a simulated ETA (constant
  speed, no traffic model), the position a given distance along a route (to
  move markers by simulated time), and nearest points (ties by id).
- **Size** (esbuild, minified, gzip -9, zod excluded; 2026-10-19): the whole
  subpath is 3.9 KB, the Port Meridian data alone 0.9 KB (under 20 KB raw),
  the engine without the basemap 2.6 KB. Clustering 5,000 points took 3.4 ms
  (best of three on a loaded machine; the test budget is 10 ms with a
  same-process calibration).
- **Limits:** planar polygon math (fine for city-sized areas away from the
  antimeridian and poles); no polygon holes; no routing on roads (routes are
  the stops you give).

## Editor commands (`@protoyard/views/editor`)

Pure Markdown text transforms over `{ text, start, end }` (selection in, new
text and selection out), used by `@protoyard/views-ui/editor`:
`toggleInline` (bold, italic, strike, code; unwraps when already wrapped),
`insertLink` (the URL selected), `toggleLines` (bullet, numbered, task,
quote, for every selected line), `setHeading`, `insertCodeBlock`,
`continueList` (Enter in a list), `triggerAt` (the `@`/`#` being typed,
never inside an email or a word) and `applyCompletion`.

## Scenario generators (`@protoyard/views/scenarios`)

Deterministic rows for the views kit, in the kit's own shapes. Each generator
draws from its own rng keyed by the scenario id, seed and generator name (the
way `dayRng` keys days in `@protoyard/scenarios`), takes ids from `ctx.ids` and
time from `ctx.time`, and never reads an ambient random source or the system
clock. Import it from your lazy generator module.

```ts
import { composeScenario, PRESETS } from '@protoyard/scenarios';
import { defaultPeople, generateCalendarEvents, generateTaskPlan, viewsFragments } from '@protoyard/views/scenarios';

// A scenario with a dense calendar (fragments set generators.views.<kit>):
export const crunch = composeScenario(PRESETS['busy-week'], viewsFragments.calendar('dense'), { id: 'crunch' });

// In generate(ctx):
const people = defaultPeople(ctx); // or your personas as { id, name, handle, email }
const events = generateCalendarEvents(ctx, { people, timeZone: 'America/Bogota' });
const { tasks, dependencies } = generateTaskPlan(ctx, { people });
```

| Generator | Rows | Integrity |
| --- | --- | --- |
| `generateCalendarEvents` | `CalendarSeries` (calendar engine): weekly stand-ups with one cancelled and one moved day, a biweekly retro, a monthly first-Tuesday review, one-off meetings, an all-day off-site | rules pass `RecurrenceRuleSchema`; EXDATE and override keys are real occurrences; one-offs on working days; wall time kept in `timeZone` |
| `generateTaskPlan` | tasks (working-day dates, milestones, progress, integer `costCents`) and FS/SS dependencies with lag | acyclic by construction; every FS successor starts after its predecessor ends, every SS successor on or after it starts |
| `generateGeoWorld` | sites, depot routes and geofences on Port Meridian | sites inside their district on land; routes visit the nearest remaining stop; regular-polygon fences that never cross themselves |
| `generateOutline` | outline or page tree with board ranks | parents listed first; depth-bounded; unique ordered ranks per parent |
| `generateFileTree` | folders and files with MIME types, integer sizes and ranks | parents are folders; folders are 0 bytes |
| `generateComments` | threads with replies and `@handle` mentions | mentions resolve to `people`; replies stay in their subject and move forward in time |
| `generateActivity` | created / updated / commented / assigned / completed entries | each subject starts with `created`; newest first |
| `generateNotifications` | mention / assigned / comment notifications, some read | recipients are `people`; `readAt` is after `at`; newest first |

- **Levels:** `empty`, `typical`, `dense` and `edge` (awkward cases:
  overlapping and midnight-crossing events, very long titles, a fan-in task,
  a six-deep outline, zero-byte and unicode file names, two sites at the same
  spot, a 50 m geofence, all-unread notifications). The level comes from the
  `level` option, else the scenario's `generators.views.<kit>` knob (set by
  `viewsFragments.<kit>(level)`), else its density.
- **Speed** (all eight kits, best of five, on a heavily loaded machine,
  2026-10-19): typical 2.0 ms, dense 21.8 ms, edge 1.8 ms, inside the 50 ms
  `generateMs` budget. Bump `VIEWS_GENERATOR_VERSION` when output changes.

## Tree (`@protoyard/views/tree`)

Trees and outlines over flat `{ id, parentId, rank }` rows, siblings ordered
by board rank keys. `buildTree` indexes them (a row whose parent is missing,
or that sits in a parent cycle in older data, becomes a root, so nothing
disappears); `flatten` returns the visible rows with `level`, `position` and
`siblings` for ARIA; `moveNode` moves a node under a parent at an index and
rejects moves into its own subtree; `indent`, `outdent`, `moveSibling` and
`newSibling` implement outline editing; `validParents` lists where a node may
go; `isWithin` and `pathTo` answer ancestry. Flattening 10,000 nodes took
1.2 ms (best of three, loaded machine, 2026-10-19).

## Timeline scheduling (`@protoyard/views/timeline`)

Scheduling rules that services and the gantt UI share. Dates are civil and
inclusive (a task runs from its first to its last working day; a milestone
has `start === end`).

```ts
import { cascade, criticalPath, DependencyListSchema } from '@protoyard/views/timeline';

// In the service: links must stay acyclic (a zod error names the cycle).
const links = DependencyListSchema.parse(input.dependencies);
// Moving a task: write exactly these rows in one transaction.
const { changes, violations } = cascade(tasks, links, { id, start }, { holidays });
// For the gantt: early/late dates, slack and the critical chain.
const { critical, tasks: info, finish } = criticalPath(tasks, links, { holidays });
```

- **Working days** (`workDays(calendar)`): a work week (default Monday to
  Friday, any set of weekdays) and holidays; durations count working days.
- **Dependencies:** FS (start after the predecessor finishes), SS (start once
  it starts), FF (finish once it finishes), SF (finish once it starts), each
  with `lagDays` (negative for lead).
- **Order and cycles:** `topoOrder` returns predecessors first, or the cycle
  as a path; `cycleMessage` says "Dependencies form a cycle: a → b → a";
  `DependencyListSchema` rejects self-links and cycles as zod errors.
- **Critical path:** a forward pass (a task starts at its own start or as soon
  as its predecessors allow) and a backward pass to the project finish give
  each task its early and late dates and slack; zero-slack tasks are critical.
- **Cascade:** applies a move (keeping the duration unless `end` is given) and
  pushes successors later only as far as their links require, never earlier.
  It returns only the rows whose dates changed, plus `violations`: links into
  the moved task that it now breaks (it moved earlier than they allow), for
  the UI to warn about.
- **Speed and size** (2026-10-19, loaded machine): cascading a 2,000-task plan
  took 8.4 ms (budget 20 ms); the subpath is 2.5 KB gzip (esbuild, zod
  external).

