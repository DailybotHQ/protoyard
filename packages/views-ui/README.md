# @protoyard/views-ui

Svelte 5 components for Protoyard's rich views kit (ADR-022): board, calendar,
timeline, data grid, tree, simulated map, editor, activity, notifications,
files, settings, states and an app command palette. The engines live in
[`@protoyard/views`](../views/README.md).

**Where each view comes from (ADR-044):**

- **Texuli view adapters:** board, calendar, timeline, grid (`DataGrid`), tree
  (`TreeView`), map, files and activity (`ActivityFeed`) render the matching
  `@texuli/data` component. `virtual-list` re-exports
  `@texuli/data/virtual-list`. The grid toolkit and settings rows keep their
  stable Protoyard props while composing Texuli controls; Lucide glyphs render
  through `Icon` or `LucideIcon` from `texuli/icons`.
- **Protoyard host behavior:** comments, notification service callbacks,
  Markdown source commands and outline editing retain Protoyard's callbacks,
  state and keyboard contracts. The grid filter editor wraps Texuli's
  `@texuli/data/filter-builder` while retaining Protoyard's nullable value
  contract. Texuli's `@texuli/editor/markdown` codec handles ordinary
  Markdown, but does not expose extension-node hooks for mentions and
  references; those source-editor extensions remain Protoyard-owned (G48).
  `NotificationCenter` keeps recipient-scoped rows and service callbacks; the
  Texuli inbox API still needs a way to hide mark-unread or accept a separate
  callback (G50).

Some adapters still accept props from the earlier Protoyard API that they do
not forward; each section below lists them. The mapping table is in
[TEXULI](../../docs/TEXULI.md#views-from-texulidata). The
[views kit guide](../../docs/VIEWS.md) has the selection guide, service
contract, measured chunks and limits.

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
`./states`, `./commands`, `./scenarios`, `./virtual-list`, `./player.css`,
`./blocks.css` and `./styles.css`. Views are never re-exported from
`@protoyard/ui`.

Three stylesheets scan different sets of view families:

- `player.css`: the board, calendar, map, states and timeline families the
  prebuilt player renders.
- `blocks.css`: only the map and states families that content blocks render
  (the deck template and generated decks).
- `styles.css`: every view family; other hosts should import this one.

## Bundle hygiene

`tests/bundle-hygiene.test.ts` fails when:

- a view statically imports another view's subpath or folder. Only `lib/`
  and `states/` are shared, plus the edges declared in `DEPENDS` (`files` may
  use `tree`; the files adapter does not use it today). Dynamic imports are
  allowed, which is how the activity thread loads the editor;
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

`CalendarView` is a host adapter over Texuli's `CalendarView`
(`@texuli/data/calendar/view`, also exported here as `TexuliCalendarView`). It
shows calendar series (with recurrence, from
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

**What the adapter adds:**

- **Data:** `query` (a `liveQuery` of `CalendarSeries` rows) becomes Texuli's
  `events`, inside `QueryState` for loading, offline, denied and failed states.
- **Clock:** "now" comes from the runtime clock (`useClock`), so DevTools time
  travel moves the now-line and today; pass `now` for a fixed time. The
  visible range is seeded once from `anchor` or the clock; later clock jumps
  leave it in place until the person picks Today.
- **Series writes:** Texuli emits a move (`id`, `occurrenceId`, `start`,
  `end`, `allDay`, `recurring`, `occurrence`). The adapter adds `scope` and
  `writes` (from `splitSeries`) and calls `onChange` through `runService`.
  A repeating occurrence always uses scope `this`; one-off events use `all`.
  `newId` names any series the split creates.
- **Forwarded props:** `view` and `anchor` (bindable), `timeZone`, `locale`,
  `weekStartsOn`, `getTitle`, `getTone`, `onOpen`, `readOnly`, `canMove`,
  `min`, `max`, `slotMinutes` and `showYear` (default `always` here).

**What Texuli's view does** (see its docs for the full keyboard model):

- **Views:** month, week, day (a time grid with an all-day row and a
  now-line) and agenda. M / W / D / A switch views.
- **Moving:** drag an event, press Alt or Control with an arrow key, or press
  Space to grab it, move with the arrows and drop with Space or Enter. Shift+F10
  or a right-click opens a lazy Move menu. The agenda view does not move
  events.
- **Creating:** with `onCreate`, Enter on a focused empty slot or a click on an
  empty part of a day creates a one-hour event; date buttons create all-day
  ones.
- **Limits:** events cannot be resized, and there is no "this / following /
  all" prompt for repeating events.

```bash
pnpm vitest run packages/views-ui/tests/calendar.test.ts
```

## Map (`@protoyard/views-ui/map`)

`SimulatedMap` is a host adapter over Texuli's `MapView` (`@texuli/data/map`).
It draws a fictional basemap (Port Meridian by default) as SVG, with markers,
clusters, routes and geofences, from the offline engine in
[`@protoyard/views/map`](../views/README.md#map-protoyardviewsmap). No tiles,
no network, no real geography.

```svelte
<script lang="ts">
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
  listLabel="Vans on the map"
  bind:selected
/>
```

**What the adapter maps:**

- **Markers and routes:** Protoyard tones pass through as Texuli's strong
  tones; the `triangle` shape becomes Texuli's `pin`.
- **Selection:** `selected` (`string | null`) and `selectedId` are both
  bindable and kept in step; `onSelect` receives the Protoyard marker.
- **List:** the place list sits below the map by default
  (`listPlacement="below"`; Texuli's default is `side`), and its region is
  named by `listLabel`.
- **Forwarded props:** `fences`, `basemap`, `label`, `direction`, `cellPx`
  (cluster cell size; `1` keeps nearby markers separate) and `onPick`.

**What Texuli's view does:**

- **Moving:** zoom in, zoom out, reset and pan buttons. On the focused map,
  the arrow keys pan, + and − zoom and 0 resets. With `onPick`, a click
  without dragging, or Enter or Space on the focused map, reports a point.
- **Markers** are named by `label` and `detail`, and drawn with a shape, a
  glyph and a tone (never color alone). Nearby markers cluster; activating a
  cluster zooms in.
- **Place list:** a virtualized list of every marker, route and fence, with
  `aria-setsize`/`aria-posinset` and `aria-current` on the selected place.
- **Positions** come from props only. The prototype advances them through its
  services and the runtime clock; the map runs no timers that write data.
- **Geofence editing is not implemented.** `editableFenceId` and
  `onFenceChange` are accepted and forwarded, but no handles are drawn.

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

- **Loading:** import `./settings` from a lazy route; it adds nothing to the
  initial JavaScript of routes that do not use it.

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
- Every adapter in this package uses it for its own data-less states, so it
  ships with any view you import.

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
- **Shortcut sheet:** `ShortcutSheet` renders explicitly supplied hotkey data
  in accessible groups, formats chords for Mac or other platforms, and filters
  scoped bindings against `activeScopes`. It supports label/chord search and
  never registers keyboard listeners; the host remains responsible for
  dispatch.

```svelte
<script lang="ts">
  import { ShortcutSheet } from '@protoyard/views-ui/commands';
  import type { HotkeyBinding } from '@protoyard/views/commands';

  const bindings: HotkeyBinding[] = [
    { id: 'save', label: 'Save', group: 'Editing', keys: ['mod+s'], scopes: ['editor'] },
  ];
</script>

<ShortcutSheet {bindings} activeScopes={['editor']} />
```

- **Loading:** the palette dialog is a separate chunk fetched on first open.

## Editor (`@protoyard/views-ui/editor`)

A dependency-free Markdown source editor on Texuli's `Textarea` (no
contenteditable library). Text commands and the document model are the pure
functions of `@protoyard/views/editor`. Values leave through typed callbacks
(`bind:value`, `onChange`, `onDraft`); the editor never writes database tables.

```svelte
<script lang="ts">
  import { MarkdownEditor, RichTextView } from '@protoyard/views-ui/editor';
  let body = $state(draft?.body ?? '');
</script>

<MarkdownEditor
  bind:value={body}
  label="Comment"
  mentions={people.map((p) => ({ id: p.id, value: p.handle, label: p.name }))}
  references={deals.map((d) => ({ id: d.id, value: d.code, label: d.name }))}
  maxLength={2000}
  onDraft={(text) => services.saveDraft(text)}
  onChange={(text) => { /* optional live hook */ }}
/>

<!-- Read-only: safe document model (no {@html}) -->
<RichTextView value={body} label="Comment body" />
```

- **Toolbar and shortcuts** (`mod` is ⌘ on Mac, Ctrl elsewhere; matched on
  `event.code`): bold `mod+B`, italic `mod+I`, strikethrough `mod+Shift+X`,
  inline code `mod+E`, link `mod+K` (it does not reach the app command
  palette), heading `mod+Alt+2`, bulleted `mod+Shift+8`, numbered
  `mod+Shift+7`, task `mod+Shift+9` and quote `mod+Shift+.` lists, code
  block `mod+Alt+C`. The toolbar is one tab stop with arrow-key focus. Enter
  continues lists, and Enter on an empty item ends them.
- **Slash commands:** typing `/` at the start of a line (or after whitespace)
  opens a command listbox (heading, lists, quote, code block). Filter by
  name; arrows move, Enter or Tab applies, Escape closes. Override with
  `slashCommands` (`DEFAULT_SLASH_COMMANDS` is the built-in set).
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
  saved Markdown. Scrollable fenced-code `<pre>` blocks use `tabindex="0"` and
  an accessible name (axe `scrollable-region-focusable`), matching ui-kit
  `CodeBlock`; covered with the ai-ui surfaces in
  `packages/ai-ui/tests/scroll-regions.test.ts`.
- **RichTextView:** read-only renderer over `parseEditorDocument` /
  `EditorDocument` from `@protoyard/views/editor`. Mentions (`@{id|label}`),
  marks, lists, quotes and code fences become elements; unsafe `href` values
  are stripped to plain text. Optional `onLinkClick` / `onMentionClick`
  callbacks — still no database writes.
- **LinkMenu:** small dialog to apply or remove a URL; refuses non-web
  schemes via `safeHref`. Use beside a custom toolbar if you want an explicit
  URL field instead of the default `mod+K` placeholder link.
- **Limits and drafts:** `maxLength` (default 5,000) sets the textarea limit
  and a counter, and a command that would pass it is refused with a polite
  announcement. `onDraft` runs after typing pauses (`draftDelayMs`, default
  800 ms), on blur and on unmount.
- **Size:** the real-build guard measured the editor at 9,508 B gzip over the
  shell on Texuli 0.5.0 (ceiling 9,958 B; see
  [docs/VIEWS.md](../../docs/VIEWS.md#bundle-measurements)). Slash and
  `RichTextView` stay in the same lazy `./editor` subpath.
- **Limits:** toolbar commands set the textarea value directly, so the
  browser's undo history does not include them.

## Board (`@protoyard/views-ui/board`)

`BoardView` is the rich kanban: a host adapter over Texuli's `Board`
(`@texuli/data/board`, also exported here with its helpers), on the
`@protoyard/views/board` engine. The simple `Kanban` in `@protoyard/ui` is
unchanged; use it for small boards without ranks, lanes or WIP limits.

```svelte
<script lang="ts">
  import { liveQuery } from '@protoyard/renderer-svelte';
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
  {#snippet card(task)}<span class="font-medium">{task.title}</span>{/snippet}
</BoardView>
```

**What the adapter adds:**

- **Data:** `query` becomes Texuli's `items`, inside `QueryState` (loading,
  errors with `onRetry`, offline).
- **Moves:** `onMove(move, item)` runs through `runService`. The service
  writes the column, lane and rank (and `move.rerank`, when older data needed
  fresh ranks) in one transaction and must enforce hard WIP limits too.
- **Opening:** with `onOpen`, the card content becomes a button that opens
  the card without starting a drag.
- **Labels:** `label` names the board and `emptyColumnText` (default "No
  cards") fills empty cells; `labels` overrides any other Texuli label.
- **Forwarded props:** `columns`, `lanes`, the accessors, `canMove`,
  `isLocked`, `density`, `dir` and `class`.

**What Texuli's board does:**

- **Keyboard:** focus a card, press Space or Enter to pick it up, choose a
  position with the arrows (Shift + Up/Down changes lane), and press Space or
  Enter to drop. Escape cancels. Every step is announced.
- **Move menu:** each card has a lazy "Move" menu listing columns and
  positions.
- **Pointer drag** starts after a small threshold (`DRAG_THRESHOLD_PX`), so a
  click still works.
- **WIP:** each column shows its count against the hard limit, with warn and
  full styling.
- **Motion** only without `prefers-reduced-motion`.

```bash
pnpm vitest run packages/views-ui/tests/board.test.ts
```

## Timeline (`@protoyard/views-ui/timeline`)

`TimelineView` is a host adapter over Texuli's `TimelineView`
(`@texuli/data/timeline`, also exported here as `TexuliTimelineView`). Texuli
renders a Gantt plan with dependency links, critical path, progress, zoom and
a today line. It takes schedule task rows and dependencies from
`@protoyard/views/timeline`:

```svelte
<TimelineView
  query={tasks}
  {dependencies}
  bind:zoom
  now={runtime.clock.now()}
  getTitle={(task) => task.title}
  getProgress={(task) => task.progress}
  onReschedule={(changes) => services.rescheduleTasks(changes)}
/>
```

`onReschedule` receives every date change produced by the dependency cascade,
through `runService`; persist the full list in one service transaction and
validate permissions and dependency rules there. Without the callback the
timeline is read-only.

- **Data:** `query` becomes Texuli's `tasks`, inside `QueryState` (pass
  `onRetry` for an actionable retry).
- **Clock:** pass `now`, or `runtime` to follow the runtime clock.
- **Zoom:** bindable `zoom` accepts `day`, `week`, `month` or `quarter`.
- **Keyboard:** Tab reaches each task bar. Space picks up a task; ←/→ changes
  its dates one day at a time; Shift+Space picks up its end for resizing;
  Enter saves and Escape cancels. A live region announces previews.
- **Pointer:** drag a bar to move it or drag its ends to resize it.
- **Texuli extras:** a "Milestones only" toggle and an unscheduled tray for
  tasks without dates.
- **Not forwarded yet:** the adapter accepts `getGroup`, `maxRows` and
  `onOpen` but does not pass them on. Rows are not grouped, Texuli's default
  limit of 500 rows applies, and items in the unscheduled tray do not open.

```bash
pnpm vitest run packages/views-ui/tests/timeline.test.ts
```

## Tree (`@protoyard/views-ui/tree`)

Two components over `{ id, parentId, rank }` rows and the
`@protoyard/views/tree` engine:

- `TreeView` (page trees, folders, org charts) is a host adapter over Texuli's
  `TreeDataView` (`@texuli/data/tree-view`, also exported here).
- `OutlineEditor` (an outline of inline titles) is a Protoyard component.

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

- **TreeView adapter:**
  - `query` becomes Texuli's `items`, inside `QueryState`.
  - `selected` stays a single id (`string | null`); Texuli's row checkboxes
    are multi-select, and the adapter keeps the first selected id and calls
    `onSelect` with its row.
  - `onMove` runs through `runService`. `expanded` (bindable), `hasChildren`,
    `loadChildren` and the `item` snippet are forwarded.
  - **Not forwarded yet:** `onOpen`, `emptyTitle`, `height`,
    `virtualizeAbove` and `rowHeight` are accepted and ignored.
- **TreeView keyboard (Texuli):** arrows move focus; Left and Right collapse
  or expand; Space toggles the row checkbox; Alt+Up/Down reorders among
  siblings; Tab indents and Shift+Tab outdents. Rows also move by dragging the
  grip. Moves and load errors are announced.
- **OutlineEditor:** Enter adds a sibling (focus follows the new item when
  `onCreate` resolves with its id), Tab and Shift+Tab indent and outdent,
  Alt+↑/↓ move among siblings, ↑/↓ change item, Escape reverts an edit,
  Backspace on an empty item deletes it (with `onDelete`). Titles save on
  blur or Enter and go back to the saved title if saving fails. Rows drag
  from a grip, and a "Move to…" menu lists only valid parents. Moves show at
  once with `aria-busy` and roll back when they fail.
  Texuli 0.5.0's `TreeDataView` has no inline-editing/service-move contract;
  this component remains the Protoyard host adapter and composes Texuli
  controls.

```bash
pnpm vitest run packages/views-ui/tests/tree.test.ts
```

## Grid (`@protoyard/views-ui/grid`)

`DataGrid` (tables of records) is a host adapter over Texuli's grid modules,
on the `@protoyard/views/grid` engine. It picks one of three Texuli
components:

| When | Texuli component |
| --- | --- |
| `onCommit` is set | `EditableDataGrid` (`@texuli/data/grid-editing`) |
| no `onCommit` and more rows than `virtualizeAbove` (default 200) | `VirtualDataGrid` (`@texuli/data/grid-virtual`) |
| otherwise | `DataGrid` (`@texuli/data/grid-core`) |

The three are also exported directly (`TexuliDataGrid`, `EditableDataGrid`,
`VirtualDataGrid`), with `CellEditor` and `createUndoStack`.

```svelte
<DataGrid
  query={deals} label="Deals" getRowId={(d) => d.id}
  columns={[
    { key: 'name', header: 'Name', type: 'text', editable: true, width: 220 },
    { key: 'stage', header: 'Stage', type: 'enum', options: ['lead', 'won', 'lost'], editable: true },
    { key: 'amountCents', header: 'Amount', type: 'number', format: (v) => money(v) },
  ]}
  onCommit={(deal, key, value) => services.updateDeal(deal.id, { [key]: value })}
  onRowOpen={(deal) => navigate(`/deals/${deal.id}`)}
/>
```

- **Data:** `query` becomes `rows`, inside `QueryState`. `label` (or
  `caption`) names the grid.
- **Core grid** (read-only, few rows): `sort` and `search` (bindable),
  `searchable`, `filter` (a `FilterNode`), `selectable` with bindable
  `selected`, `onRowActivate` (or `onRowOpen`), a `cell` snippet, `empty`,
  `density`, `locale` and `maxBlockSize` (or `height`). One tab stop with the
  APG grid keys: arrows, Home/End, Ctrl/Cmd+Home/End, PageUp/PageDown;
  Enter or Space on a header sorts and Shift adds a key; Space toggles a row.
- **Editing:** Enter or F2 (or a double-click) on an `editable` cell opens a
  native editor; Enter saves and Escape cancels. The adapter awaits
  `onCommit`; a failed commit keeps the old value and shows an alert under the
  cell. Undo and redo need `onApply` too. In this mode `searchable`,
  `selectable` and `density` are forwarded, but `sort`, `filter`, `cell` and
  row activation are not.
- **Virtual:** the rows are windowed (`rowHeight`, default 36 px; `height`
  in `px` sets the viewport, else 360 px). Cells show formatted text only, with
  no sorting, filter, selection or editing.
- **Phones:** below `md`, the same rows show as cards: the first column is the
  title and the next four are details, 50 cards at a time with **Show more**.
- **Not forwarded:** `savedViews`, `aggregates`, `activeViewId`,
  `onCreateView`, `onRenameView`, `onDeleteView` and `onViewChange` are
  accepted and ignored. There is no grouping, column resizing, reordering or
  pinning UI.

### Grid toolkit

These Protoyard components are exported on their own and are not drawn by
`DataGrid`. Each is controlled, edits plain engine state and calls typed
callbacks:

- **`FilterBuilder`** edits the engine's filter AST as nested and/or
  fieldsets (`value` bindable, `onchange`). Every control is labelled and the
  operators match each column type. `completeFilter` drops conditions that
  have no value yet. The adapter maps Protoyard's `columns`, nullable `value`
  and `onchange` props to Texuli's recursive filter editor. Analytics uses a
  separate property-filter grammar in `@protoyard/analytics-ui`.
- **`FacetPicker`**: a keyboard-first multi-select for one column (arrows,
  Home/End, Enter or Space toggle; typing searches; Escape closes).
  Picks are OR within the column and AND with everything else.
- **`FilterChips`** shows every top-level condition as a removable chip, with
  "Clear all".
- **`SavedViews`** picks, saves, renames and deletes views through your
  callbacks, with pending feedback and a confirm step before deleting. With
  `current` and `onUpdate`, a changed view shows "Modified", **Save
  changes** and **Revert**.
- **`ColumnChooser`**: a checkbox per column, move up and down, Show all and
  Reset; the last visible column cannot be hidden.
- **`BulkActionBar`** runs each `BulkAction` through `runService` (pending, a
  `confirm` step for destructive actions, and the selection clears on success
  unless `keepSelection`).

Pass the filter they build to `DataGrid`'s `filter` prop, which only the core
grid applies.

```bash
pnpm vitest run packages/views-ui/tests/grid.test.ts
```

## Activity (`@protoyard/views-ui/activity`)

Two components on the `@protoyard/views/activity` engine:

- `ActivityFeed` is a host adapter over Texuli's `ActivityFeed`
  (`@texuli/data/activity`, also exported here as `TexuliActivityFeed`).
- `CommentThread` is a Protoyard component.

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

<ActivityFeed query={activity} people={personas} now={runtime.clock.now()} />
```

Build `activity` from blueprint audit rows with `auditToActivity` (and
comments as `kind: 'comment'` items with their `body`).

- **ActivityFeed adapter:**
  - `query` becomes Texuli's `items`, inside `QueryState`.
  - Actor names and images come from `people` (`name`, `avatar`) unless you
    pass `getActorName` / `getActorSrc`.
  - Forwarded: `now`, `timeZone`, `locale`, `personaId`, `filter`,
    `onFilterChange` and `onReactionToggle`.
  - Texuli groups items under day headings relative to `now` and pages them
    locally. Keys: arrows, Home/End and Enter.
  - **Not forwarded yet:** `records`, and any other prop (such as
    `onOpenRecord`, `pageSize`, `hasMore` or `onLoadMore`), is accepted and
    ignored. Kind filter chips are off.
- **CommentThread:**
  - **Threads:** root comments are shown oldest first, each with one level
    of replies. A comment that was deleted but still has replies shows as a
    note.
  - **Names and avatars:** names, avatars and `#` references are resolved
    from ids when shown. A person's `avatar` (a library id such as `av-001`,
    an `https://` URL or a root-relative path) shows through the renderer's
    `avatarImage`; `avatarSrc` overrides it. Missing or unsafe images show
    initials. Stored bodies use the editor view's lazy `MarkdownPreview`;
    rendering creates elements and text, never HTML.
  - **Composer:** `@` and `#` typed in the composer are stored as id tokens.
    Saving a comment, a reply or an edit goes through the callback in
    `runService`. A new comment shows at once as "Sending…" (with
    `aria-busy`) until the promise settles. If saving fails, the draft comes
    back and the reason is announced.
  - **Edit and delete:** both appear only where `canEdit(comment)` says so
    (default: your own); the service still enforces policy. Delete asks
    first, and the dialog stays open with the error if deleting fails.
  - **Reactions:** chips with counts and `aria-pressed` for your own, plus a
    React picker. Each toggle goes through `onReact`.
  - **Rich editor:** the `MarkdownEditor` is loaded from the editor view when
    a composer opens. Override its loader with `loadEditor` when needed. It is
    a separate chunk; activity has no static dependency on another view.
    While it loads, Texuli's `Textarea` is used: ⌘/Ctrl+Enter
    sends, and Escape cancels a reply or an edit.

```bash
pnpm vitest run packages/views-ui/tests/activity.test.ts
```

## Notifications (`@protoyard/views-ui/notifications`)

`NotificationCenter` accepts rows such as `NotificationRow` from
`@protoyard/views/scenarios` or blueprint notification-service rows (`id`, `kind`, `title`, `subjectId`,
`createdAt`/`at`, and `readAt`). Pass live query results and service callbacks;
the component owns only temporary optimistic state. At narrow widths it opens
in a bottom sheet, otherwise in a popover. A custom `trigger` snippet can use
an app's bell button. Opening a row calls the hash router with `hrefFor(row)`;
the default route is `/<subjectId>`.

```svelte
<script lang="ts">
import { Bell } from '@lucide/svelte';
import { Button } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
</script>

{#snippet bellTrigger({ props })}
  <Button {...props} variant="ghost" size="icon" aria-label="Notifications">
    <LucideIcon icon={Bell} />
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
The panel preserves the Protoyard service contract, loading and error states,
grouping, mute preferences, and responsive host surface. Texuli 0.5.0's inbox
model supports controlled read and unread changes; this adapter has only a
mark-read service contract today, so the write behavior remains Protoyard-owned.

- **Loading:** import this subpath from a lazy route so the panel stays out of
  initial JavaScript.

Replace the `<NotificationsBell>` instance with `NotificationCenter`, move its
existing bell button markup into the `trigger` snippet, and pass the prototype's
live query and service callbacks. For comment mentions, call
`mentionedIds(body)` in the comment service and write one notification row per
mentioned recipient in the same transaction as the comment. The task-manager
template demonstrates this with actor filtering and recipient-scoped reads.

## Files (`@protoyard/views-ui/files`)

`FileManager` is a host adapter over Texuli's `FileBrowser`
(`@texuli/data/files`, also exported here; `FilePreview` is a deprecated alias
of `FileBrowser`). It reads flat
`{ id, parentId, name, kind: 'folder' | 'file', type?, size?, updatedAt? }`
rows on the `@protoyard/views/files` engine.

```svelte
<FileManager
  query={entries} bind:folder bind:view bind:selected
  onOpenFile={(entry) => navigate(`/files/${entry.id}`)}
/>
```

- **Adapter:** `query` becomes Texuli's `entries`, inside `QueryState`. The
  open folder is bindable as `folder` or `folderId` (`null` is the root) and
  the layout as `view` or `layout` (`grid` or `list`); each pair stays in
  step. `selected`, `onFolderChange`, `onSelectedChange`, `onLayoutChange`
  and `onOpenFile` are forwarded, and `label` names the browser.
- **Texuli's browser:** breadcrumbs, grid and list layouts with
  multi-select, and a side preview with a deterministic SVG thumbnail made
  from the entry (no network). Keys: arrows (grid-aware), Enter opens, Space
  selects, Backspace goes up a folder.
- **Read-only today:** `onCreateFolder`, `onRename`, `onMove`, `onDelete`,
  `onUpload`, `getBlob`, `accept`, `maxSize` and `rootLabel` are accepted so
  existing screens typecheck, but the adapter does not forward them. There
  is no rename, move, delete, new folder, upload or blob preview in the UI.
- The engine still exports `nameProblem`, `moveProblem` and `thumbnailSvg`
  for services. Storage caveats for uploaded files are in docs/DATABASE.md
  (Uploaded files).

```bash
pnpm vitest run packages/views-ui/tests/files.test.ts
```

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.
