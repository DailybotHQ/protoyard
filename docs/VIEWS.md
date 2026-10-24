# Views kit

The views kit adds focused screens beyond CRUD: boards, calendars, plans,
large tables, trees, maps, writing, collaboration, files, settings and common
app states. Engines are framework-free; Svelte components live in separate
lazy subpaths. Import a view from a lazy route so unused views add nothing to
initial JavaScript. See the detailed component and engine references in
[`@protoyard/views-ui`](../packages/views-ui/README.md) and
[`@protoyard/views`](../packages/views/README.md).

## Where the views come from

Most rich views are rendered by Texuli's `@texuli/data` package (ADR-044).
Protoyard keeps the parts that need its runtime:

- **Engines** (`@protoyard/views/<subpath>`): board, calendar, timeline, grid,
  tree, map, activity and files are thin re-exports of `@texuli/data` engine
  subpaths. Editor, notifications, settings, states, commands and scenarios
  stay Protoyard modules.
- **Components** (`@protoyard/views-ui/<subpath>`): board, calendar, timeline,
  grid, tree, map, files and activity are thin host adapters over the matching
  `@texuli/data` component. An adapter maps a `liveQuery` result (`query`) to
  the component's data prop, wraps it in `QueryState`, and runs mutation
  callbacks through `runService`. `virtual-list` is a plain re-export.
- **Protoyard-only components:** editor, notifications, settings, states,
  commands, `CommentThread`, `OutlineEditor` and the grid toolkit
  (`FilterBuilder`, `SavedViews`, `FilterChips`, `FacetPicker`,
  `ColumnChooser`, `BulkActionBar`).

Texuli view schemas use `DataSchema` (`parse` / `safeParse`), not zod. The
mapping table and limits are in
[TEXULI](TEXULI.md#views-from-texulidata).

## Choose a view

| Need | Component (`@protoyard/views-ui/<subpath>`) | Engine (`@protoyard/views/<subpath>`) |
| --- | --- | --- |
| Move work across columns, optionally split by swimlane | `BoardView` from `board` | ranks, WIP limits, validated moves, keyboard drag state |
| Browse dated events or bookings | `CalendarView` from `calendar` | calendar math, recurrence expansion and series splitting |
| Plan task durations, links and critical path | `TimelineView` from `timeline` | working-day schedule, dependency validation, cascade and critical path |
| Explore and edit many records | `DataGrid` from `grid`, plus the standalone `FilterBuilder`, `SavedViews`, `FilterChips`, `FacetPicker`, `ColumnChooser` and `BulkActionBar` | sorting, filters (facets and chips), saved view state with change tracking, column state, selection, virtual windows |
| Browse a hierarchy or edit an outline | `TreeView`, `OutlineEditor` from `tree` | tree indexing, cycle-safe moves, ranks and outline operations |
| Show locations in a fictional offline city | `SimulatedMap` from `map` | projection, markers, clustering, routes and geofences |
| Write and preview safe Markdown | `MarkdownEditor`, `MarkdownPreview` from `editor` | text commands and mention token helpers |
| Show comments, reactions and record history | `CommentThread`, `ActivityFeed` from `activity` | mentions, threads, day grouping and audit summaries |
| Show recipient-scoped inbox items | `NotificationCenter` from `notifications` | — (rows belong to the prototype service) |
| Browse folders and preview files | `FileManager` from `files` | tree checks, names, paths and deterministic thumbnails |
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
Dynamic imports can load another view subpath only when needed (the activity
thread loads the editor this way). More detail is in the
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
`onChange(change)` / `onCreate(slot)`, `TimelineView` calls
`onReschedule(changes)`, and `DataGrid` calls `onCommit(row, key, value)`. The
adapters run these through `runService`, so the global pending bar and error
toasts apply. Services must revalidate invariants such as hard WIP limits,
dependency acyclicity, and permission to edit. Read and write contracts for
each component, including the props an adapter accepts but does not forward
yet, are in the package reference linked above.

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

## Grid filters, saved views and bulk actions

`DataGrid` renders rows, sorting, search, a filter, selection and inline
editing. It does not draw the filter, saved-view or bulk-action chrome. Those
are standalone Protoyard components you place around the grid, all editing
plain engine state:

- **`FacetPicker`**: one keyboard picker per column, OR within a column and
  AND with everything else ("Stage is any of Lead or Won").
- **`FilterChips`**: one removable chip per top-level condition, plus "Clear all".
- **`FilterBuilder`**: nested and/or groups for anything else.
- **`SavedViews`**: pick, save, rename and delete views. With `current` and
  `onUpdate`, a changed view shows "Modified", "Save changes" and "Revert".
- **`ColumnChooser`** and **`BulkActionBar`**: column visibility and order, and
  service-backed actions on selected rows.

Pass the resulting `FilterNode` to `DataGrid`'s `filter` prop. The engine
(`@protoyard/views/grid`) keeps this deterministic:

- `serializeFilter` gives equal filters equal text, whatever order they were
  built in, and `parseSerializedFilter` reads it back as untrusted input.
- `facetsFromFilter`, `setFacet` and `toggleFacetValue` change one facet and
  keep every other condition.
- `describeFilter` and `removeFilterAt` back the chips.
- `isViewModified` ignores filters built in another order, and
  `nextViewId(name, existing)` derives stable ids for new views.

## Keyboard and phone behavior

| View | Keyboard model | Narrow-screen behavior |
| --- | --- | --- |
| Board | Focus a card, Space or Enter picks it up; arrows choose a position (Shift + Up/Down changes lane); Space or Enter drops; Escape cancels; a per-card Move menu lists targets | Columns scroll horizontally |
| Calendar | M / W / D / A switch views; Alt or Control + arrow moves a focused event; Space grabs, arrows move, Space or Enter drops, Escape cancels; Shift+F10 opens the Move menu; Enter opens or creates | Same views; pick Agenda for a list |
| Timeline | Tab reaches task bars; Space picks up or Shift+Space resizes the end; ←/→ adjusts dates; Enter saves; Escape cancels | The date canvas scrolls horizontally |
| Grid | One tab stop; arrows, Home/End, Ctrl+Home/End, PageUp/Down; Enter or Space on a header sorts (Shift adds a key); Space toggles a row when selectable; Enter or F2 edits an editable cell | Below `md`, rows become cards, 50 at a time with Show more |
| Tree | Arrows move; Left/Right collapse or expand; Space toggles the row checkbox; Alt+Up/Down reorders; Tab indents; Shift+Tab outdents | Tree scrolls within its view; drag starts at the grip |
| Outline | Enter creates; Tab indents; Shift+Tab outdents; Alt+↑/↓ moves; Escape reverts | Touch row moves start at the grip |
| Map | Arrow keys pan; + / − zoom; 0 resets; Enter or Space picks the center point when `onPick` is set; the place list has its own focus | Place list sits below the map by default |
| Editor | Textarea shortcuts; preview is keyboard reachable; Escape exits reply/edit context | Write and preview tabs can be used instead of split view |
| Activity | Feed: arrows, Home/End, Enter; thread composer and reactions use labelled buttons; Escape cancels the active reply or edit | Thread and feed stack in the narrow view |
| Notifications | Trigger, list and row actions are keyboard reachable; activating a row opens its route | Opens as a bottom sheet on narrow screens and a popover at wider widths |
| Files | Arrows (grid-aware), Enter opens, Space selects, Backspace goes up a folder | Grid or list layout |
| Settings | Standard labelled form controls; dialogs retain focus | Section list → detail, with a back button returning focus |
| States / commands | Query state exposes retry where provided; command dialog filters and activates registered commands | State content and command dialog fit the available viewport |

The component reference has each view's props and callback behavior.

## Bundle measurements

All views are lazy-route candidates, so the initial JavaScript cost is 0 KB
when the first route does not import them. The real-build guard builds a
fixture app with Vite, one entry per view over a realistic shell (renderer
services and live queries, the ui `Button` and toasts), and measures what each
view adds to the first screen (gzip -9). It also checks that menus and the
board and calendar Move menus stay lazy and that unused sibling views are
shaken out.

Measured on 2026-10-24 with
`pnpm vitest run packages/cli/tests/views-bundle.test.ts --silent=false`
(Texuli adapters in place):

| View | Measured | Ceiling |
| --- | ---: | ---: |
| Board | 10,932 B | 12,800 B |
| Calendar | 14,327 B | 17,200 B |
| Grid (`DataGrid` only) | 17,804 B | 23,400 B |
| Map | 7,984 B | 12,400 B |
| Editor | 8,187 B | 8,597 B |
| Timeline | 10,067 B | 10,571 B |

The other subpaths have no current per-component measurement. A full
prototype that uses several views, `keel-projects-demo`, measured with
`pnpm protoyard budget keel-projects-demo`: initial JS 175.77 KB gzip (budget
250 KB, pass) and CSS 40.27 KB gzip (budget 34 KB, **fails** by 6.27 KB).
Method notes are in [`PERFORMANCE.md`](PERFORMANCE.md#views-kit).

## Honest limits

- The map draws a fictional Port Meridian SVG city. It has no real geography,
  map tiles, geocoding or runtime network access. Geofence editing is not
  implemented: `editableFenceId` and `onFenceChange` are accepted but draw no
  handles.
- Calendar recurrence implements a documented RFC 5545 subset, not every
  RRULE field. Events cannot be resized, and a moved repeating occurrence is
  always saved as "this event" (no "following" or "all" prompt).
- Several adapters accept props from the earlier Protoyard API that they do
  not forward yet: `FileManager` writes (rename, move, delete, new folder,
  upload, `getBlob`), timeline `getGroup`, `maxRows` and `onOpen`, tree
  `onOpen` and virtualization props, activity `records`, `onOpenRecord` and
  paging, and grid saved-view and aggregate props. The
  [component reference](../packages/views-ui/README.md) lists them per view.
- `DataGrid` has no grouping, column resizing, reordering or pinning UI, and
  editing turns virtualization off.
- `scripts/bench-grid.ts` currently fails ("rows never rendered") against the
  ui-kit grid demo, so there is no current 100,000-row measurement.
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
