# Views kit

The views kit adds focused screens beyond CRUD: boards, calendars, plans,
large tables, trees, maps, writing, collaboration, files, settings and common
app states. The implemented engine helpers are framework-free; Svelte components live in
separate lazy subpaths. Some engine subpaths reserve planned names but have no
runtime exports yet. Import a view from a lazy route so unused views add
nothing to initial JavaScript. See the detailed component and engine references
in [`@protoyard/views-ui`](../packages/views-ui/README.md) and
[`@protoyard/views`](../packages/views/README.md).

## Choose a view

| Need | Component (`@protoyard/views-ui/<subpath>`) | Engine (`@protoyard/views/<subpath>`) |
| --- | --- | --- |
| Move work across columns, optionally split by swimlane | `BoardView` from `board` | ranks, WIP limits, validated moves, keyboard drag state |
| Browse dated events or bookings | `CalendarView` from `calendar` | calendar math, recurrence expansion and series splitting |
| Plan task durations, links and critical path | `TimelineView` from `timeline` | working-day schedule, dependency validation, cascade and critical path |
| Explore and edit many records | `DataGrid`, `FilterBuilder`, `SavedViews` from `grid` | virtualization, sorting, grouping, filters and saved view state |
| Browse a hierarchy or edit an outline | `TreeView`, `OutlineEditor` from `tree` | tree indexing, cycle-safe moves, ranks and outline operations |
| Show locations in a fictional offline city | `SimulatedMap` from `map` | projection, markers, clustering, routes and geofences |
| Write and preview safe Markdown | `MarkdownEditor`, `MarkdownPreview` from `editor` | text commands and mention token helpers |
| Show comments, reactions and record history | `CommentThread`, `ActivityFeed` from `activity` | mentions, threads, day grouping and audit summaries |
| Show recipient-scoped inbox items | `NotificationCenter` from `notifications` | — (rows belong to the prototype service) |
| Browse folders, upload and preview files | `FileManager`, `FilePreview` from `files` | tree checks, names, paths and deterministic thumbnails |
| Build preference screens and guarded forms | settings components from `settings` | — (patterns compose app-owned services) |
| Render loading, empty, error, offline or denied state | `QueryState` from `states` | — (classifier is in views-ui) |
| Add an app command dialog | `AppCommandPalette` from `commands` | — (registry is in views-ui) |

To run a whole blueprint-described app rather than one view, use `BlueprintApp` from
`@protoyard/crud/app`. It wires the blueprint screen kinds (board, calendar, timeline, map,
analytics, dashboard, settings and tabbed detail) to the routes of the shared app model,
and loads each kit lazily through the screen-kind registry. See the
[crud README](../packages/crud/README.md#blueprint-app-shell-protoyardcrudapp).

Each package exposes one entry per subpath; neither package is re-exported by
`@protoyard/ui`. `@protoyard/views` root is types-only. `views-ui` views may
share `lib/` and `states/`; static imports between view folders are guarded.
The `files` view reuses the tree view through its declared dependency. Dynamic
imports can load another view subpath only when needed. More detail is in the
[component reference](../packages/views-ui/README.md#one-subpath-per-view).

## Data and mutations

Pass a reactive `query` (often from `liveQuery`) and accessors or display
callbacks appropriate to the view. Components own transient interaction state;
they do not write database tables. Read-only views remain read-only when a
mutation callback is absent. Mutation callbacks should invoke the prototype's
service, which enforces the full boundary:

```text
UI callback → service → session.assert → zod validation → environment.run → db.transaction
```

For example, `BoardView` calls `onMove(move, item)`, `CalendarView` calls
`onChange(change)` / `onCreate(slot)`, `TimelineView` calls its schedule change
callback, and `DataGrid` calls `onCommit(row, key, value)`. Services must
revalidate invariants such as hard WIP limits, dependency acyclicity, and
permission to edit. Async callbacks show pending feedback; failed optimistic
moves roll back and announce the error. Read and write contracts for each
component are in the package reference linked above.

For comment mentions, services use `mentionedIds(body)` from the activity
engine to create recipient-scoped notification rows in the same transaction
as the comment; the UI does not infer or send notifications itself.

The deterministic `@protoyard/views/scenarios` engine provides fragments via
`viewsFragments.<kit>(level)` for `calendar`, `plan`, `geo`, `tree`, `files`,
`social`, and related views. Levels are `empty`, `typical`, `dense` and `edge`.
Generators use the scenario context (`ctx.rng`, `ctx.faker`, `ctx.ids`,
`ctx.time`); pass runtime clock and persona locale/time zone into the UI rather
than reading the system clock. The engine README documents each generator and
its integrity checks.

## Keyboard and phone behavior

| View | Keyboard model | Narrow-screen behavior |
| --- | --- | --- |
| Board | Space picks up and drops; arrows move; Shift + Up/Down changes lane; Escape cancels; Enter opens | One column per screen with snap scrolling; touch drag starts at the grip |
| Calendar | Arrows move focus; Enter opens or creates; Space grabs; arrows reschedule; Enter saves; Escape cancels | Agenda is the default below `sm` |
| Timeline | Tab reaches task bars; Space picks up or Shift+Space resizes the end; ←/→ adjusts dates; Enter saves; Escape cancels | Date canvas is hidden; rows show compact schedule bars and dates |
| Grid | Roving ARIA grid; arrows, Home/End, Ctrl+Home/End, PageUp/Down; header controls sort, pin, resize and reorder | Rows become cards; saved views, filters and density stay in the toolbar |
| Tree / outline | Tree arrows, Home/End, typeahead; Enter/Space select; outline Enter creates, Tab indents, Shift+Tab outdents | Tree scrolls within its view; touch row moves start at the grip |
| Map | Arrow keys pan; + / − zoom; 0 fits all; Escape clears selection; marker list has roving focus | Map controls and the synchronized marker list remain available |
| Editor | Textarea shortcuts; preview is keyboard reachable; Escape exits reply/edit context | Write and preview tabs can be used instead of split view |
| Activity | Composer and reaction controls use labelled buttons; Escape cancels the active reply or edit | Thread and feed stack in the narrow view |
| Notifications | Trigger, list and row actions are keyboard reachable; activating a row opens its route | Opens as a bottom sheet on narrow screens and a popover at wider widths |
| Files | Roving multi-select; arrows, Home/End, Space, Ctrl/⌘+A, F2, Delete, Enter | Select-multiple mode makes touch taps toggle selection |
| Settings | Standard labelled form controls; dialogs retain focus | Section list → detail, with a back button returning focus |
| States / commands | Query state exposes retry where provided; command dialog filters and activates registered commands | State content and command dialog fit the available viewport |

The component reference has each view's full shortcut list and callback
behavior. These views respect reduced-motion preferences where they animate.

## Bundle measurements

All views are lazy-route candidates, so the initial JavaScript cost is 0 KB
when the first route does not import them. Task 117 measured isolated Vite
builds over a realistic Protoyard shell (Svelte, renderer, UI, services and
runtime dependencies), gzip -9, on an M1 Max. These are the enforced view
chunk figures; the table gives before/after for the overlay-lazy-loading
change and its current ceiling:

| View | Before | Current | Ceiling |
| --- | ---: | ---: | ---: |
| Board | 39,934 B | 11,966 B | 12,800 B |
| Calendar | 43,942 B | 16,106 B | 17,200 B |
| Grid | 60,243 B | 19,142 B | 20,500 B |
| Map | — | 11,573 B | 12,400 B |
| Editor | — | 6,452 B | 6,900 B |
| Timeline | — | 8,458 B | 9,100 B |

The other components have per-component gzip measurements in the
[views-ui README](../packages/views-ui/README.md); those figures use a
component-focused esbuild probe with framework and shared packages external,
so compare them only within that method. The real-build guard is
`pnpm vitest run packages/cli/tests/views-bundle.test.ts`; it verifies the
isolated ceilings, lazy overlay chunks, and that unused sibling views are
shaken out. Current known gaps: grid and calendar exceed the plan's tighter
16 KB and 12 KB aims respectively while remaining below enforced ceilings;
keel task detail downloads 74.7 KB with comments/editor; and first overlay use
may fetch a small chunk. Details and methods are in
[`PERFORMANCE.md`](PERFORMANCE.md#views-kit).

## Honest limits

- The map draws a fictional Port Meridian SVG city. It has no real geography,
  map tiles, geocoding or runtime network access.
- Calendar recurrence implements a documented RFC 5545 subset, not every
  RRULE field. See the calendar engine reference for supported fields.
- The 100,000-row grid measurement uses generated in-memory rows to measure
  rendering and virtualization. Typical IndexedDB prototype worlds are much
  smaller; the benchmark is not an IndexedDB throughput claim.
- The editor is a textarea-based Markdown editor, not a WYSIWYG editor. Its
  preview renders a safe syntax tree as elements and never injects HTML.
- These packages provide simulated prototype behavior. They are not a
  production calendar, geographic information system, file backend or
  collaborative service.

## Verify the views kit

Run from the repository root:

```bash
pnpm vitest run packages/views packages/views-ui
pnpm --filter @protoyard/views typecheck
pnpm --filter @protoyard/views-ui typecheck
pnpm vitest run packages/cli/tests/views-bundle.test.ts
pnpm exec tsx scripts/bench-grid.ts --rows 100000 --runs 3 --check
```

The browser E2E row for this surface is in the
[testing guide](TESTING_GUIDE.md#where-tests-live-source--test-mapping) and is
run by the lead during integration.

## For agents

The distributable Protoyard skill routes kit choices through its `kits`
sub-skill ([`skills/protoyard/kits/SKILL.md`](../skills/protoyard/kits/SKILL.md))
and its catalog ([`skills/protoyard/references/kits.md`](../skills/protoyard/references/kits.md)),
which link back to this guide. Keep the catalog's entry for this kit in step
when its entry points or limits change.
