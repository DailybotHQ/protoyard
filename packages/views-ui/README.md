# @protoyard/views-ui

Svelte 5 components for Protoyard's rich views kit (ADR-022): board, calendar,
timeline, data grid, tree, simulated map, editor, activity, notifications,
files, settings, states and an app command palette. They are built on
`@protoyard/ui` tokens, and the engines live in
[`@protoyard/views`](../views/README.md).

> **Status:** all listed UI subpaths are implemented. Several smaller engine
> subpaths currently reserve names without runtime helpers; see the [views kit guide](../../docs/VIEWS.md)
> for the component selection guide, service contract, responsive behavior,
> measured UI chunks and current limitations.

## Install

```json
{
  "dependencies": {
    "@protoyard/views-ui": "workspace:*",
    "@protoyard/views": "workspace:*",
    "@protoyard/ui": "workspace:*"
  }
}
```

Import the kit styles after Tailwind, themes and `@protoyard/ui`, so Tailwind
scans the kit's markup:

```css
@import '@protoyard/renderer-svelte/app.css';
@import '@protoyard/views-ui/styles.css';
@source './';
```

## One subpath per view

There is no root entry. Import a view only from a lazy route screen, so each
view stays its own chunk and adds 0 KB to a prototype's initial JS:

```ts
// src/routes.ts
{ path: '/board', name: 'Board', load: () => import('./screens/Board.svelte') }
// src/screens/Board.svelte imports from '@protoyard/views-ui/board'
```

Subpaths: `./board`, `./calendar`, `./timeline`, `./grid`, `./tree`, `./map`,
`./editor`, `./activity`, `./notifications`, `./files`, `./settings`,
`./states`, `./commands`, `./scenarios` and `./styles.css`. Views are never
re-exported from `@protoyard/ui`.

## Bundle hygiene

`tests/bundle-hygiene.test.ts` fails when:

- a view imports another view's subpath or folder. Only `lib/` and
  `states/` are shared, plus the edges declared in `DEPENDS`: `files` uses
  `tree`, so the folder tree reuses the TreeView chunk;
- any file imports `@protoyard/ui` dynamically, which would put the ui barrel
  in every initial chunk (see docs/PERFORMANCE.md, Shells);
- a runtime value is imported from the `@protoyard/views` root instead of an
  engine subpath;
- the exports drift from one subpath per view.

```bash
pnpm vitest run packages/views-ui
pnpm --filter @protoyard/views-ui typecheck
```

## Calendar (`@protoyard/views-ui/calendar`)

`CalendarView` shows calendar series (with recurrence, from
[`@protoyard/views/calendar`](../views/README.md#calendar-protoyardviewscalendar))
as a month, week, day or agenda view. It never writes data itself: moves and
new slots go out through `onChange` / `onCreate`, which call the prototype's
services.

```svelte
<script lang="ts">
  import { getRuntime, liveQuery } from '@protoyard/renderer-svelte';
  import { CalendarView, type CalendarChange } from '@protoyard/views-ui/calendar';

  const runtime = getRuntime();
  const persona = runtime.session.principal()?.persona;
  const bookings = liveQuery(() => services.listSeries(), { initial: undefined });

  // writes.put / writes.delete in one transaction (session.assert → zod → environment.run → db.transaction)
  const save = (change: CalendarChange<Booking>) => services.applySeriesWrites(change.writes);
</script>

<CalendarView
  query={bookings}
  timeZone={persona?.timezone ?? 'UTC'}
  locale={persona?.locale ?? 'en-US'}
  getTitle={(o) => o.data?.title ?? 'Booking'}
  getTone={(o) => (o.data?.status === 'cancelled' ? 'neutral' : 'primary')}
  onChange={save}
  onCreate={(slot) => services.createBooking({ start: slot.start, end: slot.end })}
  onOpen={(o) => navigate(`/bookings/${o.seriesId}`)}
/>
```

- **Views:** month (6 × 7 with up to three events a day and a "+N more"
  popover), week and day (a time grid that only draws the hours in view, with
  an all-day row and a now-line), agenda (a grouped list; the default below
  `sm`, and the most screen-reader-friendly). `view` and `anchor` are
  bindable; M / W / D / A switch views.
- **Time:** "now" comes from the runtime clock (`useClock`), so DevTools time
  travel moves the now-line and today; pass `now` for a fixed time. Dates,
  hours and the now-line follow `timeZone`; the week starts from `locale`.
- **Keyboard:** arrows move a focus slot (a day in month and agenda, a
  15-minute slot in week and day); Enter on a slot creates, Enter on an event
  opens it. Space grabs an event: arrows move it (15 minutes up/down, a day
  left/right; a week up/down in month), Shift + up/down changes its length,
  Enter saves, Escape cancels. A live region describes each step.
- **Pointer:** drag an event to move it (days across, 15-minute steps down) or
  its bottom edge to resize; click an empty slot or a month day to create.
- **Saving:** the event moves at once and shows as busy until the `onChange`
  promise settles (run through `runService`, so the global bar and error
  toasts apply); a failed save puts it back. A repeating event first asks
  "This event / This and following events / All events" (ui `AlertDialog`);
  `change.writes` is `splitSeries` output for that scope (`newId` names the
  series a "following" edit creates).
- **Read-only** without `onChange` (nothing to drag or grab); no create
  without `onCreate`. An `onCreate` that only opens a form returns `false`, so
  the view does not announce a creation the form has not made. Data states (loading, offline, denied, failed) come from
  `QueryState`.
- **Size** (Svelte 5 client output, esbuild minified, gzip -9, with svelte,
  core, `@protoyard/ui`, the renderer, lucide, Bits UI and zod external;
  2026-10-19): the view is 10.9 KB; with the calendar engine it imports, the
  chunk is 14.6 KB. Lazy, 0 KB initial.

```bash
pnpm vitest run packages/views-ui/tests/calendar.test.ts
```

## Map (`@protoyard/views-ui/map`)

`SimulatedMap` draws the offline engine from
[`@protoyard/views/map`](../views/README.md#map-protoyardviewsmap): a fictional
basemap (Port Meridian by default) as SVG, with markers, clusters, routes and
geofences. No tiles, no network, no real geography; the chip "Simulated map.
Fictional city, not real geography." is always visible.

```svelte
<script lang="ts">
  import { runService } from '@protoyard/renderer-svelte';
  import { type MapMarker, SimulatedMap } from '@protoyard/views-ui/map';

  let selected = $state<string | null>(null);
  const markers: MapMarker[] = vans.map((van) => ({
    id: van.id, label: van.name, detail: van.status, lng: van.position.lng, lat: van.position.lat,
    tone: van.late ? 'warning' : 'primary', shape: 'square', glyph: 'V',
  }));
</script>

<SimulatedMap
  {markers}
  routes={[{ id: 'loop', label: 'Morning loop', stops, progress: done / total }]}
  fences={zones}
  editableFenceId="yard"
  onFenceChange={(fence) => services.updateZone(fence)}
  bind:selected
/>
```

- **Moving:** drag to pan, wheel or pinch to zoom at the pointer, or the
  zoom-in, zoom-out and "show everything" buttons. On the focused map, the
  arrow keys pan, + and − zoom, 0 shows everything and Escape clears the
  selection. `view` (center and zoom) is bindable.
- **Markers** are buttons named by `label` and `detail`, drawn with a shape,
  a glyph and a tone (never color alone). Nearby markers cluster
  (`cellPx`); activating a cluster zooms to its members. `selected` is
  bindable and `onSelect` reports changes.
- **List alternative:** every marker is also in a list under the map. Picking
  a list row selects the marker and centers the map on it, and selecting on
  the map marks the row (`aria-current`). The list is virtualized with the
  grid's axis (`createAxis`/`windowAxis`, 32 px rows, at most 224 px tall), so
  5,000 markers render about 13 rows instead of 5,000 buttons. Each row keeps
  `aria-setsize`/`aria-posinset`. The list is one tab stop: ArrowUp/Down,
  Home, End and PageUp/PageDown move focus through every marker and scroll as
  needed, and a marker picked on the map becomes the list's tab stop. In
  Chromium (M1 Max, ui-kit build) the map with 5,000 markers paints 22–30 ms
  after loading them; the list alone took 174–198 ms before virtualization
  (`tests/e2e/views.spec.ts` asserts under 100 ms).
- **Moving markers and routes:** positions come from props only. The
  prototype advances them through its services and the runtime clock (for
  example `pointAlong` on a route by simulated time), and the map animates the
  change with CSS (off under `prefers-reduced-motion`); it never runs timers
  that write data. Routes draw the remaining part dashed, the travelled part
  solid, and the current position from `progress` (0–1).
- **Geofences:** polygons and circles. With `editableFenceId` and
  `onFenceChange`, a polygon gets draggable corner handles and a corner list
  (latitude, longitude, add, remove) for the keyboard. Save is enabled only
  for a valid ring (three corners, in range, no crossing edges) and runs
  `onFenceChange` through `runService` (pending button, error toast; a
  failure keeps the draft). Reset drops the draft.
- **Size** (Svelte 5 client output, esbuild minified, gzip -9, with svelte,
  core, `@protoyard/ui`, the renderer, lucide, Bits UI and zod external;
  2026-10-19): the view is 6.4 KB; with the map engine and the Port Meridian
  basemap the chunk is 9.0 KB. Lazy, 0 KB initial. 5,000 markers draw as 25
  map buttons (clusters); in happy-dom the whole render took 647 ms, most of
  it the 5,000-row list.

```bash
pnpm vitest run packages/views-ui/tests/map.test.ts
```

## Settings (`@protoyard/views-ui/settings`)

Settings page patterns. Writes go through the prototype's services with
`runService`; nothing here touches data.

| Component | What it does |
| --- | --- |
| `SettingsLayout` | Title, a section nav (`aria-current` on the open one) and the open section, rendered fresh per section (`{#key}`). Below `md` it is a list → detail flow: picking a section focuses its heading, and the back button returns focus to the list. |
| `SettingsSection` | A titled card for a group of rows, with an optional footer. |
| `SwitchRow`, `SelectRow`, `RadioRow` | Labelled preference rows with descriptions (`aria-describedby`); a disabled switch says why (`disabledReason`). |
| `SaveBar` | Appears while `dirty`. Save runs `onSave` and shows the Button spinner until its promise settles; a failed `runService` result with validation issues fills `errors` (bindable) and lists them. While dirty it **guards navigation**: hash changes are stopped before the router sees them and an in-app "Leave without saving?" dialog asks ("Keep editing" / "Discard and leave"); a reload or tab close asks through the browser (`beforeunload`). |
| `DangerZone` | A destructive action behind a dialog where the person types the exact `confirmText`; a failed result keeps the dialog open. |
| `guardHashNavigation` | The guard on its own, for custom forms. |

### Composing with the SaaS kit

`@protoyard/saas-ui` ships a complete `Settings` screen (profile, security,
members, notifications) and does not need changing. When a prototype wants
its own settings page, build it from these patterns on top of the same
`@protoyard/saas` engine services:

```svelte
<script lang="ts">
  import { getRuntime, runService } from '@protoyard/renderer-svelte';
  import { createSettingsServices, DEFAULT_SAAS_NOTIFICATION_PREFERENCES } from '@protoyard/saas';
  import { SaveBar, SettingsLayout, SettingsSection, SwitchRow } from '@protoyard/views-ui/settings';

  const settings = createSettingsServices(getRuntime());
  let saved = $state({ ...DEFAULT_SAAS_NOTIFICATION_PREFERENCES });
  let draft = $state({ ...DEFAULT_SAAS_NOTIFICATION_PREFERENCES });
  let errors = $state({});
  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(saved));

  $effect(() => {
    void runService(() => settings.notificationPreferences()).then((result) => {
      if (!result.ok) return;
      saved = { ...result.value };
      draft = { ...result.value };
    });
  });

  async function save() {
    const result = await runService(() => settings.updateNotificationPreferences(draft), { success: 'Preferences saved' });
    if (result.ok) saved = { ...draft };
    return result; // validation issues show in the SaveBar
  }
</script>

<SettingsLayout sections={[{ id: 'notifications', label: 'Notifications' }]}>
  {#snippet children(section)}
    <SettingsSection title="Email">
      <SwitchRow label="Product updates" bind:checked={draft.productUpdates} />
      <SwitchRow label="Security alerts" bind:checked={draft.securityAlerts} />
      <SwitchRow label="Workspace activity" bind:checked={draft.workspaceActivity} />
    </SettingsSection>
  {/snippet}
</SettingsLayout>
<SaveBar {dirty} bind:errors onSave={save} onDiscard={() => (draft = { ...saved })} />
```

- **Size** (Svelte 5 client output, esbuild minified, gzip -9, with `svelte`,
  `@protoyard/ui`, the renderer, lucide and Bits UI external because
  prototypes already load them; 2026-10-19): all of `./settings` is 5.2 KB;
  per component SettingsLayout 1.7, SaveBar 1.7, DangerZone 1.3, each row or
  SettingsSection about 0.6, the guard 0.4. A typical screen (layout, a
  section, the save bar, a few rows) is about 4.5 KB. Lazy, 0 KB initial.

## States (`@protoyard/views-ui/states`)

`QueryState` is the one boundary for a `liveQuery` result, so no screen shows
a blank or a fake success. Every view in this kit uses it for its own
data-less states.

```svelte
<script lang="ts">
  import { liveQuery } from '@protoyard/renderer-svelte';
  import { QueryState } from '@protoyard/views-ui/states';

  let attempt = $state(0);
  const deals = liveQuery(() => services.listDeals(), { initial: [], deps: () => [attempt] });
</script>

<QueryState query={deals} label="Loading deals" emptyTitle="No deals yet" onRetry={() => attempt++}>
  {#snippet children(list)}<DealTable rows={list} />{/snippet}
  {#snippet emptyAction()}<Button onclick={() => runService(() => services.createDeal(draft))}>New deal</Button>{/snippet}
</QueryState>
```

| State | When | Shows |
| --- | --- | --- |
| loading | before the first result | nothing for 150 ms (like the renderer's pending bar), then a skeleton (`role="status"` named by `label`), or your `loading` snippet |
| reloading | `loading` again with data on screen | the data, with `aria-busy` |
| empty | `isEmpty(current)` (default: undefined, null or `[]`) | `EmptyState` named by `emptyTitle`, with `emptyAction` |
| offline | `SimulatedServiceError` with code `offline` | an alert that says the simulated network is off, with retry |
| denied | `PermissionDeniedError` | an alert naming the missing capability and saying roles are simulated (switch persona in DevTools); no retry, since retrying cannot help |
| failed | any other error | an alert with the error message and retry |

- Errors are sorted by class (`classifyQueryError`, exported), never by
  message text; a class with the same `name` also counts, because a
  duplicated core copy breaks `instanceof` (the renderer's `runService` does
  the same).
- `onRetry` should re-run the query, e.g. by bumping a value in its `deps`.
- **Size** (Svelte 5 client output, esbuild minified, gzip -9, with svelte,
  core, `@protoyard/ui`, the renderer and lucide external): 1.4 KB, small
  enough for route screens to import statically.

## Commands (`@protoyard/views-ui/commands`)

An app command palette on ⌘K (Mac) / Ctrl+K (elsewhere). DevTools keep
Ctrl/⌘ + `.`, keys typed inside the DevTools panel are ignored, and `mod+k`
and `mod+.` cannot be registered as action shortcuts. The pure registry and
contracts are also available from `@protoyard/views/commands`.

```svelte
<script lang="ts">
  import { getRuntime, runService } from '@protoyard/renderer-svelte';
  import { AppCommandPalette, createCommands } from '@protoyard/views-ui/commands';
  import { routes } from './routes.ts';

  const runtime = getRuntime();
  const commands = createCommands(runtime, routes); // pages from defineRoutes metadata
  commands.register({
    id: 'new-deal',
    label: 'New deal',
    shortcut: 'mod+shift+n',
    capability: 'deals:create',
    run: () => services.createDeal(draft), // the palette wraps it in runService
  });
  // when a record opens: commands.addRecent({ id: deal.id, label: deal.name, path: `/deals/${deal.id}` })
</script>

<AppCommandPalette registry={commands}>
  {#snippet trigger({ open, keys })}
    <Button variant="outline" onclick={open}>Search <Kbd>{keys.join('')}</Kbd></Button>
  {/snippet}
</AppCommandPalette>
```

- **What it lists:** recent records first, then pages (routes with a `name`;
  routes with `:params` or `*` are reached through recent records), then
  actions. Everything with a `capability` is filtered through
  `session.can`, and the list is re-filtered when the persona switches
  (`session.subscribe`). `createCommands` reads only `path`, `name`,
  `description` and `capability` from route metadata and never calls `load`,
  so no screen chunk is fetched.
- **Running:** pages navigate and close. Actions run through `runService`
  (pending bar, toasts for denied or simulated failures) with the capability
  asserted first; the item shows a spinner and `aria-busy` until the promise
  settles, and the palette closes only on success. Registered shortcuts run
  their action from anywhere; shortcuts without `mod` never fire while typing
  in a field.
- **Hints:** shortcuts show as `Kbd` keys, `⌘ ⇧ N` on Mac and
  `Ctrl Shift N` elsewhere (platform read from `navigator` in UI code only),
  with `aria-keyshortcuts` on the item.
- **Async search:** register an abortable source with
  `commands.registerSearchSource((query, signal) => search(query, signal))`.
  The palette displays pending and failure feedback and ignores stale results.
- **Nested steps:** an action may expose static or lazy `children`; selecting it
  opens those results in the same dialog with a Back control.
- **Create fallback:** pass `createFallback(query)` to `createCommands` to offer
  a create action for typed text when ordinary search has no match. Selection
  still runs through `runService` and displays pending feedback.
- **Scopes:** actions may list `scopes`. They appear only when one matches the
  registry's active scopes, updated through `commands.setScopes(...)`.
- **Size** (last measured 2026-10-19, before async search and nested steps):
  the static listener component was 0.8 KB plus a 0.3 KB shared platform
  helper; `createCommands` was 1.2 KB; the dialog was a separate 2.4 KB chunk
  fetched on first open. The extended command engine has not been remeasured.

## Editor (`@protoyard/views-ui/editor`)

A lightweight Markdown editor on a plain `<textarea>` (no contenteditable
library). Text commands are the pure functions of `@protoyard/views/editor`.

```svelte
<script lang="ts">
  import { MarkdownEditor } from '@protoyard/views-ui/editor';
  let body = $state(draft?.body ?? '');
</script>

<MarkdownEditor
  bind:value={body}
  label="Comment"
  mentions={people.map((p) => ({ id: p.id, value: p.handle, label: p.name }))}
  references={deals.map((d) => ({ id: d.id, value: d.code, label: d.name }))}
  maxLength={2000}
  onDraft={(text) => services.saveDraft(text)}
/>
```

- **Toolbar and shortcuts** (`mod` is ⌘ on Mac, Ctrl elsewhere; matched on
  `event.code`): bold `mod+B`, italic `mod+I`, strikethrough `mod+Shift+X`,
  inline code `mod+E`, link `mod+K` (it does not reach the app command
  palette), heading `mod+Alt+2`, bulleted `mod+Shift+8`, numbered
  `mod+Shift+7`, task `mod+Shift+9` and quote `mod+Shift+.` lists, code
  block `mod+Alt+C`. The toolbar is one tab stop with arrow-key focus. Enter
  continues lists, and Enter on an empty item ends them.
- **Completion:** typing `@` or `#` (after a space or at the start) offers
  `mentions` or `references` in a listbox anchored at the caret (mirror-div
  measurement). The textarea keeps its textbox role and points at the list
  with `aria-autocomplete`, `aria-controls` and `aria-activedescendant` (the
  textbox-with-popup form of the ARIA combobox pattern; a textarea may not
  take the `combobox` role). Arrow keys move, Enter or Tab inserts
  `@value `, Escape closes only the list.
- **Preview:** Write / Preview tabs (default) or `layout="split"`. The
  preview renders the safe parser's AST (`@protoyard/ai/markdown`) as
  elements and text only, never `{@html}`; links pass `safeHref` and images
  `safeImageSrc` again, so `javascript:` links render as text and remote or
  `data:` images as their alt text. Headings start at `h2` because the
  preview sits inside a page. `MarkdownPreview` is also exported for showing
  saved Markdown.
- **Limits and drafts:** `maxLength` (default 5,000) sets the textarea limit
  and a counter, and a command that would pass it is refused with a polite
  announcement. `onDraft` runs after typing pauses (`draftDelayMs`, default
  800 ms), on blur and on unmount.
- **Size** (Svelte 5 client output, esbuild minified with code splitting,
  gzip -9; svelte, core, ui, renderer, lucide and Bits UI external;
  2026-10-19): the editor chunk is 6.0 KB; the preview and the shared parser
  load as a separate 4.5 KB chunk on the first preview (at once in `split`).
- **Limits:** toolbar commands set the textarea value directly, so the
  browser's undo history does not include them.

## Board (`@protoyard/views-ui/board`)

`BoardView` is the rich kanban, on the `@protoyard/views/board` engine. The
simple `Kanban` in `@protoyard/ui` is unchanged; use it for small boards
without ranks, lanes or WIP limits.

```svelte
<script lang="ts">
  import { liveQuery, runService } from '@protoyard/renderer-svelte';
  import { BoardView } from '@protoyard/views-ui/board';

  const tasks = liveQuery(() => services.listTasks(), { initial: [], deps: () => [] });
</script>

<BoardView
  query={tasks}
  label="Sprint board"
  columns={[
    { id: 'todo', title: 'To do' },
    { id: 'doing', title: 'Doing', wip: { soft: 3, hard: 5 } },
    { id: 'done', title: 'Done' },
  ]}
  lanes={[{ id: 'web', title: 'Web' }, { id: 'mobile', title: 'Mobile' }]}
  getId={(t) => t.id} getColumn={(t) => t.status} getLane={(t) => t.team}
  getRank={(t) => t.rank} getLabel={(t) => t.title}
  onMove={(move) => services.moveTask(move)}
  onOpen={(t) => navigate(`/tasks/${t.id}`)}
>
  {#snippet card(task, { pending })}<span class="font-medium">{task.title}</span>{/snippet}
</BoardView>
```

- **Moves** go through `onMove(move, item)`: the service writes the column,
  lane and rank (and `move.rerank`, when older data needed fresh ranks) in one
  transaction and must enforce hard WIP limits too. The card moves at once,
  shows a spinner and `aria-busy` until the promise settles, and goes back
  (with an announcement and `runService`'s toast) when it fails.
- **Pointer drag:** mouse and pen drag from anywhere on the card after 4 px
  (a click still opens it), with a placeholder at the drop position and
  auto-scroll near the board's edges. On touch, drag from the grip, so a swipe
  still scrolls the board. A drop the rules reject shows a toast and the
  reason.
- **Keyboard:** each card is a focusable control whose description explains
  the keys: Space picks it up, the arrows move it (Shift + Up/Down changes
  lane), Space drops, Escape cancels, Enter opens. The held card previews
  where it would land, and every step is announced.
- **"Move to…" menu** on each card: columns and lanes, with full or
  disallowed targets disabled.
- **WIP:** each column shows `count / limit` with warn and full styling; a
  full column refuses drops.
- **Lanes** collapse and expand like an accordion. **Phones:** one column per
  screen with snap scrolling. Motion only with `motion-safe`.
- **States:** loading, errors (with `onRetry`) and offline come from
  `QueryState`; an empty column says "No cards".
- **Size** (Svelte 5 client output, esbuild minified, gzip -9; svelte, core,
  ui, renderer, lucide, Bits UI and zod external; 2026-10-19): 9.3 KB with
  the board engine (6.6 KB component, 3.1 KB engine).

## Timeline (`@protoyard/views-ui/timeline`)

`TimelineView` renders a virtualized Gantt plan, dependency links, critical
path, progress and a runtime-clock today line. It accepts schedule task rows
and dependencies from `@protoyard/views/timeline`:

```svelte
<TimelineView
  query={tasks}
  dependencies={dependencies}
  bind:zoom
  now={runtime.clock.now()}
  getTitle={(task) => task.title}
  getProgress={(task) => task.progress}
  onReschedule={(changes) => services.rescheduleTasks(changes)}
  onOpen={(task) => navigate(`/tasks/${task.id}`)}
/>
```

`onReschedule` receives every date change produced by the dependency cascade;
persist the full list in one service transaction and validate permissions and
dependency rules there. Without the callback the timeline is read-only. A
failed save restores the original dates and announces the failure.

- **Zoom:** bindable `zoom` accepts `day`, `week`, `month` or `quarter`. The
  timeline's date canvas scrolls horizontally; rows are windowed vertically.
- **Keyboard:** Tab reaches each task bar. Space picks up a task; ←/→ changes
  its dates one day at a time; Shift+Space picks up its end for resizing; Enter
  saves the preview and Escape cancels it. A live region announces previews
  and results.
- **Pointer:** drag a bar to move it or drag either end to resize it. The
  preview includes successor dates from the cascade and dependency links.
- **Phones:** the date canvas is hidden and each row shows a compact schedule
  bar with task dates; zoom controls stay visible.
- **States:** loading, empty, denied, offline and error are rendered through
  `QueryState`; pass `onRetry` for an actionable retry.
- **Size:** the isolated Vite shell build is 8,458 B gzip, under the 9,100 B
  guard ceiling (see [docs/VIEWS.md](../../docs/VIEWS.md#bundle-measurements)).

```bash
pnpm vitest run packages/views-ui/tests/timeline.test.ts
```

## Tree (`@protoyard/views-ui/tree`)

`TreeView` (page trees, folders, org charts) and `OutlineEditor` (an outline
of inline titles), on the `@protoyard/views/tree` engine over
`{ id, parentId, rank }` rows.

```svelte
<TreeView
  query={pages} label="Pages" bind:expanded bind:selected
  getId={(p) => p.id} getParentId={(p) => p.parentId} getRank={(p) => p.rank} getLabel={(p) => p.title}
  onSelect={(p) => navigate(`/pages/${p.id}`)}
  onMove={(move) => services.movePage(move)}
/>

<OutlineEditor
  query={items} label="Plan"
  getId={(i) => i.id} getParentId={(i) => i.parentId} getRank={(i) => i.rank} getTitle={(i) => i.title}
  onCreate={(input) => services.createItem(input)}
  onRename={(item, title) => services.renameItem(item.id, title)}
  onMove={(move) => services.moveItem(move)}
  onDelete={(item) => services.deleteItem(item.id)}
/>
```

- **TreeView** is an ARIA tree with roving focus:
  - ↑/↓, Home and End move; → opens a node or goes to its first child; ←
    closes it or goes to its parent; `*` opens all siblings; typing jumps by
    label; Enter or Space selects. Rows carry `aria-level`, `aria-posinset`,
    `aria-setsize` and `aria-expanded`.
  - **Lazy children:** pass `hasChildren` and `loadChildren`; opening such a
    node loads once, with `aria-busy` while loading.
  - Above 500 rows (`virtualizeAbove`) it renders only the visible window, in
    a fixed `height`, and scrolls a focused row into view.
- **OutlineEditor:** Enter adds a sibling (focus follows the new item when
  `onCreate` resolves with its id), Tab and Shift+Tab indent and outdent,
  Alt+↑/↓ move among siblings, ↑/↓ change item, Escape reverts an edit,
  Backspace on an empty item deletes it (with `onDelete`). Titles save on
  blur or Enter and go back to the saved title if saving fails.
- **Moving** (both): drag a row (on touch, from the grip) and drop it before,
  inside or after another, or open **"Move to…"** with Shift+F10 (or the
  context-menu key), which lists only valid parents. A node can never move
  into its own subtree. Moves go through `onMove`, show at once with
  `aria-busy`, open the new parent so the node stays visible, and roll back
  when they fail. `move.rerank` carries fresh sibling ranks when older data
  needed them.
- **Size** (Svelte 5 client output, esbuild minified, gzip -9; svelte, core,
  ui, renderer, lucide, Bits UI and zod external; 2026-10-19): `TreeView`
  8.2 KB and `OutlineEditor` 7.3 KB, each including the tree engine, ranks
  and (for TreeView) the virtualizer; 10.7 KB for the whole subpath.

## Grid (`@protoyard/views-ui/grid`)

`DataGrid` (tables of records), `FilterBuilder`, `SavedViews`,
`FilterChips`, `FacetPicker`, `ColumnChooser` and `BulkActionBar`, on the
`@protoyard/views/grid` engine.

```svelte
<DataGrid
  query={deals} label="Deals" getRowId={(d) => d.id}
  columns={[
    { key: 'name', header: 'Name', type: 'text', editable: true, width: 220 },
    { key: 'stage', header: 'Stage', type: 'enum', options: ['lead', 'won', 'lost'], editable: true },
    { key: 'amountCents', header: 'Amount', type: 'number', format: (v) => money(v) },
  ]}
  bind:view onViewChange={(v) => services.saveGridState(v)}
  aggregates={[{ fn: 'sum', key: 'amountCents' }]}
  onCommit={(deal, key, value) => services.updateDeal(deal.id, { [key]: value })}
  savedViews={views.current ?? []} bind:activeViewId
  onCreateView={(name, v) => services.createView({ name, ...v })}
  onRenameView={(v, name) => services.renameView(v.id, name)}
  onDeleteView={(v) => services.deleteView(v.id)}
  onUpdateView={(v, state) => services.updateView(v.id, state)}
  facets={['stage']}
  bulkActions={[
    { id: 'won', label: 'Mark won', run: (rows) => services.markWon(rows.map((d) => d.id)) },
    { id: 'delete', label: 'Delete', destructive: true, confirm: {}, run: (rows) => services.deleteDeals(rows.map((d) => d.id)) },
  ]}
  bind:selection
  onRowOpen={(deal) => navigate(`/deals/${deal.id}`)}
/>
```

- **ARIA grid with roving focus:** one tab stop. The arrows move, Home/End
  go to the row's first or last cell, Ctrl+Home/End to the first or last
  cell, and PageUp/PageDown move by a page. The target is scrolled into view
  and the grid carries `aria-rowcount` and `aria-colcount`.
- **Virtualized both ways:** only the visible rows and center columns are in
  the DOM, under a sticky header, with pinned columns sticky on either side.
  A 1,000-row test renders at most 60 rows. A full-height grid on a 1080p
  screen needs about 30 at the default density: about 25 visible rows plus
  overscan. Density (compact, comfortable, spacious) sets
  the row height.
- **Columns:**
  - Click a header to sort (asc → desc → off). Shift+click adds a sort key.
  - Each header has a menu: sort, pin left or right, move, group by, hide.
    The **Columns** menu shows hidden ones again.
  - Resize by dragging the edge, or with ←/→ on the focused handle (±16 px).
  - Reorder by dragging a header, or with Alt+Shift+←/→ on its button.
- **Groups:** `view.groupBy` makes group rows with counts and your
  `aggregates` (count, sum, min, max). Enter, Space or a click opens or
  closes a group.
- **Inline edit:** Enter or F2 on an `editable` cell opens an editor by
  type:
  - text and number: an input
  - date: `input type=date`
  - enum: a native `<select>`
  - boolean: a native checkbox switch

  The editor (`CellEditor`) loads with the first edit, so read-only grids
  never download it. Enter or blur commits, and Escape cancels. The commit goes through
  `onCommit` in `runService`. The cell shows the new value with a spinner
  and `aria-busy` until the promise settles. If it rejects, the cell goes
  back to the saved value and shows the reason: the field's zod issue or the
  error message, set with `aria-invalid` and announced.
- **Filters:** `FilterBuilder` edits the engine's filter AST as nested
  and/or fieldsets. Every control is labelled, add and remove buttons are
  named, and the operators match each column type. While a condition has no
  value yet, the grid applies the rest and says so (`completeFilter`). A
  filter the engine rejects is not applied, and its message is shown.
- **Quick filters and chips:** `facets` lists column keys that get a
  `FacetPicker` in the row under the toolbar. It is a keyboard-first
  multi-select (↓ opens; arrows, Home/End, Enter or Space toggle; typing
  searches; Escape closes and returns focus). Picks are OR within the column
  and AND with everything else. `FilterChips` shows every top-level condition
  as a removable chip ("Stage is any of lead or won"), with "Clear all". All
  three editors change the same `view.filter`.
- **Saved views:** `SavedViews` picks, saves, renames and deletes through
  your callbacks, with pending feedback and a confirm step before deleting.
  Applying a view runs `sanitizeView`, which drops columns that no longer
  exist and announces the drop. With `current` (DataGrid passes its view)
  and `onUpdate` (`onUpdateView` on DataGrid), a changed view shows
  "Modified", **Save changes** and **Revert**. Equivalent filters built in
  another order do not count as a change (`isViewModified`).
- **Selection and bulk actions:** `bulkActions` adds a sticky checkbox column
  (the header box selects the shown rows, and Shift+click selects a range).
  Space on any cell selects the row, and Shift+Space extends from the last
  one. Rows carry `aria-selected`, and phone cards get a checkbox.
  `selection` is the bindable list of ids in row order; rows that disappear
  leave it. `BulkActionBar` runs each `BulkAction` through `runService`
  (pending, a `confirm` step for destructive actions, and the selection
  clears on success unless `keepSelection`). The checkboxes, chips, pickers
  and bar are lazy chunks loaded only when a grid uses them.
- **Standalone pieces:** `FilterChips`, `FacetPicker`, `ColumnChooser` (a
  checkbox per column, move up/down, Show all, Reset; the last visible
  column cannot be hidden) and `BulkActionBar` are controlled components with
  typed `onchange`/`run` callbacks, for lists that are not a `DataGrid`.
- **View state:** `view` is plain data (columns, sort, groupBy, filter,
  density). Bind it, or persist it from `onViewChange`.
- **Phones:** below `md` the same rows show as cards, under the same
  toolbar (saved views, filters, density). The first visible column is the
  title and the next four are details, 50 cards at a time with **Show
  more**.
- **Size** (Svelte 5 client output, esbuild minified, gzip -9; svelte, core,
  ui, renderer, lucide, Bits UI and zod external; 2026-10-19, before the
  filter, saved-view and bulk-action toolkit; not re-measured with this
  method): 13.9 KB for the subpath's components, or 17.8 KB with the grid
  engine bundled in (about 4 KB of that is the engine). The real-build guard
  measured the grid's first screen at 21,859 B on 2026-10-21 (19,300 B
  before the toolkit); see [PERFORMANCE](../../docs/PERFORMANCE.md#grid-toolkit-2026-10-21).

## Activity (`@protoyard/views-ui/activity`)

`CommentThread` and `ActivityFeed`, on the `@protoyard/views/activity`
engine.

```svelte
<CommentThread
  query={comments} people={personas} records={deals} currentUserId={me.id}
  now={runtime.clock.now()}
  canEdit={(c) => c.authorId === me.id}
  onSend={(input) => services.addComment(deal.id, input)}
  onEdit={(c, body) => services.editComment(c.id, body)}
  onDelete={(c) => services.deleteComment(c.id)}
  onReact={(c, emoji) => services.toggleReaction(c.id, emoji)}
/>

<ActivityFeed
  query={activity} people={personas} now={runtime.clock.now()}
  onOpenRecord={(item) => navigate(`/deals/${item.recordId}`)}
/>
```

Build `activity` from blueprint audit rows with `auditToActivity` (and
comments as `kind: 'comment'` items with their `body`).

- **CommentThread:**
  - **Threads:** root comments are shown oldest first, each with one level
    of replies. A comment that was deleted but still has replies shows as a
    note.
  - **Names and avatars:** names, avatars and `#` references are resolved
    from ids when shown. Stored bodies use the editor view's lazy
    `MarkdownPreview`; rendering creates elements and text, never HTML.
  - **Composer:** `@` and `#` typed in the composer are stored as id tokens.
    Saving a comment, a reply or an edit goes through the callback in
    `runService`. A new comment shows at once as "Sending…" (with
    `aria-busy`) until the promise settles. If saving fails, the draft comes
    back and the reason (the zod issue for `body`, or the error message) is
    announced.
  - **Edit and delete:** both appear only where `canEdit(comment)` says so
    (default: your own); the service still enforces policy. Delete asks
    first, and the dialog stays open with the error if deleting fails.
  - **Reactions:** chips with counts and `aria-pressed` for your own, plus a
    React picker. Each toggle goes through `onReact`.
  - **Rich editor:** the `MarkdownEditor` is loaded from the editor view when
    a composer opens. Override its loader with `loadEditor` when needed. It is
    a separate chunk; activity has no static dependency on another view.
    While it loads, a plain textarea is used: ⌘/Ctrl+Enter
    sends, and Escape cancels a reply or an edit.
- **ActivityFeed:**
  - **Items:** newest first, under day headings ("Today", "Yesterday",
    weekday, date) relative to `now` in `timeZone`. Every item is plain text:
    the actor, the change lines or a comment excerpt with names, and an
    optional record link.
  - **Filters:** by kind (all activity, comments, changes) and by person.
  - **Paging:** `pageSize` items at a time with **Show more**. On the last
    page, `hasMore` with `onLoadMore` adds a **Load older activity** button.
- **Avatars:** a person's `avatar` (a library id such as `av-001`, an
  `https://` URL or a root-relative path) shows as a photo through the
  renderer's `avatarImage` (64 px, 128 px at 2x, lazy). `avatarSrc` overrides
  the resolution when given. Missing, unsafe or broken images show initials.
- **Size** (Svelte 5 client output, esbuild minified, gzip -9; svelte, core,
  ui, renderer, lucide, Bits UI and zod external; 2026-10-19):
  - `CommentThread`: 7.9 KB with the engine, 6.4 KB without.
  - `ActivityFeed`: 5.5 KB with the engine, 4.5 KB without.
  - The whole subpath: 9.7 KB.
  - The editor, when loaded, is its own chunk.

## Notifications (`@protoyard/views-ui/notifications`)

`NotificationCenter` accepts rows such as `NotificationRow` from
`@protoyard/views/scenarios` or blueprint notification-service rows (`id`, `kind`, `title`, `subjectId`,
`createdAt`/`at`, and `readAt`). Pass live query results and service callbacks;
the component owns only temporary optimistic state. At narrow widths it opens
in a bottom sheet, otherwise in a popover. A custom `trigger` snippet can use
an app's bell button. Opening a row calls the hash router with `hrefFor(row)`;
the default route is `/<subjectId>`.

```svelte
{#snippet bellTrigger({ props })}
  <Button {...props} variant="ghost" size="icon" aria-label="Notifications">
    <Bell aria-hidden="true" />
  </Button>
{/snippet}

<NotificationCenter
  trigger={bellTrigger}
  query={notifications}
  onMarkRead={(id) => services.notifications.markRead(id)}
  onMarkAllRead={() => services.notifications.markAllRead()}
  hrefFor={(row) => `/tasks/${row.subjectId}`}
/>
```

Pass `onMuteChange` when the prototype has a per-type preference service; its
callback receives the notification kind and the requested muted state.

- **Size:** 3.24 KB gzip-9 for the minified Svelte client component, with
  Svelte, Protoyard packages, Lucide and Bits UI external. Import this subpath
  from a lazy route so the panel stays out of initial JavaScript.

Replace the `<NotificationsBell>` instance with `NotificationCenter`, move its
existing bell button markup into the `trigger` snippet, and pass the prototype's
live query and service callbacks. For comment mentions, call
`mentionedIds(body)` in the comment service and write one notification row per
mentioned recipient in the same transaction as the comment. The task-manager
template demonstrates this with actor filtering and recipient-scoped reads.

## Files (`@protoyard/views-ui/files`)

`FileManager` (drive, CMS, DAM and attachment screens) and `FilePreview`, on
the `@protoyard/views/files` engine over flat
`{ id, parentId, name, kind: 'folder' | 'file', type?, size?, updatedAt?, hasBlob? }`
rows.

```svelte
<FileManager
  query={entries} bind:folder bind:view
  getBlob={(entry) => services.readBlob(entry.id)}
  onCreateFolder={(parentId, name) => services.createFolder({ parentId, name })}
  onRename={(entry, name) => services.rename(entry.id, name)}
  onMove={(list, targetId) => services.move(list.map((e) => e.id), targetId)}
  onDelete={(list) => services.remove(list.map((e) => e.id))}
  onUpload={(files, folderId) => services.upload(files, folderId)}
  accept="image/*,.pdf" maxSize={10 * 1024 * 1024}
/>
```

- **Navigation:**
  - From `md`, a folder tree (the `TreeView`, opened down to the current
    folder) sits beside breadcrumbs.
  - Folders open with a double-click, Enter or the toolbar's **Open**.
  - The open folder is the bindable `folder` (`null` is the root).
  - Grid or list layout comes from the bindable `view`.
- **Keyboard:** the folder is a multi-select listbox with one tab stop.
  - Arrows move, Up and Down by a row of tiles. Home and End jump to the
    ends.
  - Shift+arrow or Shift+click selects a range, and Ctrl/⌘+click toggles.
  - Space toggles, Ctrl/⌘+A selects all, and Escape clears the selection.
  - Enter opens, F2 renames, and Delete deletes after a confirm.
  - On touch, **Select multiple** makes taps toggle.
- **Writes** go through the callbacks in `runService`:
  - Names are checked first (`nameProblem`: empty, `/`, duplicates in the
    folder).
  - Moves are checked first too (`moveProblem`: a folder into itself or its
    subfolders is disabled in the destination list).
  - A rename shows the new name, and a move takes the items out of the
    folder at once, with a spinner and `aria-busy`. Both roll back and
    announce why if the promise rejects.
  - New folder suggests a unique name ("Untitled folder 2").
  - Delete confirms in an `AlertDialog`, and keeps it open with the error if
    the delete fails.
  - Upload uses the ui `FileDropzone` into the open folder, with an
    "Uploading…" status.
- **Preview:** Enter on a file opens a lightbox over the folder's files.
  - ←/→ or the Previous and Next buttons step through them (wrapping), and
    Escape closes.
  - Images show their blob, and files with no blob show the generated
    thumbnail.
- **Blobs and thumbnails:**
  - `getBlob` is called once per image file with `hasBlob`. The blob is
    shown through an object URL, and every URL is revoked when the
    component is destroyed.
  - Everything else uses `thumbnailSvg` / `thumbnailUrl`: a deterministic
    SVG made only from the id (and an optional hue), with no network. Its
    only text is the sanitized extension.
  - Storage caveats are in docs/DATABASE.md (Uploaded files).
- **Size** (Svelte 5 client output, esbuild minified, gzip -9; svelte, core,
  ui, renderer, lucide, Bits UI and zod external; 2026-10-19):
  - The subpath is 16.6 KB, including the TreeView it shares (8.0 KB alone).
  - That leaves about 8.6 KB for the files chunk itself.

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.
