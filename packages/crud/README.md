# @protoyard/crud

Blueprint-driven list, detail and form screens for Protoyard prototypes. Generated
prototypes (`protoyard generate`, see [docs/GENERATOR.md](../../docs/GENERATOR.md)) use it
through the `crud-app` template; hand-built prototypes can use it with any
[blueprint](../blueprint/README.md).

Blueprint-declared screens are generated as lazy routes. Each generated wrapper reads its
screen from the runtime blueprint; the screen UI is imported from a CRUD subpath such as
`@protoyard/crud/screens/board`. `detail` tabs render through `EntityDetail`, and supporting
panels load on demand. The route map and regeneration ownership are documented in
[GENERATOR.md](../../docs/GENERATOR.md).

CRUD screen controls and icons compose the shared Texuli-backed components from
`@protoyard/ui`; Lucide symbols are glyph inputs rendered through Texuli's
`LucideIcon` wrapper. The hidden CSV file input remains native because it
opens the browser file picker.

`screenKinds` in `@protoyard/crud` is the typed runtime registry for blueprint screen
components. Each kit loader uses a dynamic import, so board, calendar, map, analytics, dashboard
and settings code stays outside the initial chunk until that screen is opened. The
Svelte-free `@protoyard/crud/registry-meta` entry shares the kind, subpath and export metadata
with the CLI code generator. Archetype packages can call `registerScreenKind` with a lazy
loader and props adapter; duplicate registrations fail clearly. The `entity-page` key is
reserved for the CRUD app shell to register, while the blueprint's declared `SCREEN_TYPES`
all have built-in loaders.

## Blueprint app shell (`@protoyard/crud/app`)

`BlueprintApp` renders a whole app from a parsed blueprint, with no generated code
([ADR-029](../../docs/DECISIONS.md)). It reads `deriveAppModel(blueprint)` from
`@protoyard/blueprint` (routes, navigation groups and layout). Generated prototypes
render it from their `src/App.svelte` and the player renders it too, so both levels
show the same app.

```svelte
<script lang="ts">
import { BlueprintApp } from '@protoyard/crud/app';
let { blueprint } = $props(); // a parsed Blueprint; the runtime comes from mountPrototype
</script>

<BlueprintApp
  {blueprint}
  themeLibrary={() =>
    import('@protoyard/themes/library').then((m) => m.THEME_LIBRARY_META.map(({ id, name }) => ({ id, name })))}
/>
```

It provides:
- `LayoutHost` navigation from the model's groups and icon ids (`NAV_ICONS` maps every
  `SCREEN_NAV_ICONS` id to its Lucide component), with the model's mobile layout below
  768 px unless a scenario or override pins one;
- a hash router whose routes all render one view that reads the matched model route:
  - home counts per entity;
  - `MembersScreen`;
  - the entity page (list, then create and edit through `EntityForm`, so every write goes
    through the entity service and the submit button shows pending feedback);
  - every other screen kind, loaded through `getScreenKind(type).load()` and its props
    adapter, each in its own chunk;
- `SearchPalette` behind a Search button (⌘K);
- `NotificationsBell`, only when an entity enables notifications;
- a crud context (`useBlueprintApp()`): runtime, services, blueprint, model and router.

Props:
- `blueprint` (required);
- `runtime`, which defaults to the mounted runtime;
- `services`, which defaults to `createEntityServices`;
- `model`, which defaults to `deriveAppModel`;
- `themeLibrary`, an optional loader for extra settings theme choices. This package doesn't
  depend on `@protoyard/themes`, so the host passes it.

Optional extension points let an owned app customize the shell without forking it. Omitted,
each keeps the default:
- `home`: a component that replaces the overview on the home route (it gets the route props);
- `extraRoutes`: hand-written `RouteDefinition`s matched before the blueprint's, for example
  a record workspace;
- `recordHref(entityName, id)`: where a record opens from its list row and from search.
  Return `undefined` for the default, the record's `/<plural>/:id` route (its edit form, or a
  tabbed detail screen);
- `actions`: a snippet that replaces the header's search and notifications bell.

`prototypes/helpdesk-demo/src/App.svelte` uses all four for its SLA dashboard, ticket
workspace and ⌘K search.

A missing record shows a message instead of a blank form. A screen that fails to load
shows a retry.

Import `@protoyard/crud/styles.css` in the app stylesheet. It registers this package's
markup (the shell, lists, forms and screens) with Tailwind through `@source "./"`, as the
other kit stylesheets do.

`@protoyard/crud/app` is its own subpath and is never re-exported from the `@protoyard/crud`
barrel, so prototypes that don't use it pay nothing. `tests/blueprint-app.test.ts` mounts
it on the real runtime, opens every route of a fixture blueprint, and creates and edits a
record through the UI.

When using view-based screens, the prototype stylesheet must import their CSS and register the
package sources with Tailwind. `templates/crud-app/src/app.css` is the working reference:

```css
@import "@protoyard/views-ui/styles.css";
@import "@protoyard/charts-ui/styles.css";
@import "@protoyard/analytics-ui/styles.css";

@source "./";
@source "../../../packages/views-ui/src";
@source "../../../packages/charts-ui/src";
@source "../../../packages/analytics-ui/src";
```

Every control respects `can()` (simulated policy, not security). Mutations go through the
blueprint's entity services and `runtime.members` (`session.assert` → zod →
`environment.run` → `db.transaction`); components never write tables.

| Component | What it does |
| --- | --- |
| `EntityList` | `DataTable` with search, sort, pagination, row selection and bulk delete; Trash and an **Undo** toast for `softDelete` entities; CSV export and import when `features.csv` is on (the codec loads lazily). Related records and personas are shown by name; money is formatted from integer cents with the blueprint currency. |
| `EntityForm` | A `FormField` per blueprint field with inline zod errors through `runService`. Pass `runtime`, `blueprint` and `services` to edit relation and persona fields with pickers. `avatar` fields use a lazy picker chunk: Choose face opens a searchable grid of thumbnails (arrow keys, Home and End move; Enter or Space picks) and Shuffle face picks the next face. In edit mode with `services`, Shuffle face calls `shuffleAvatar` and saves at once (the button shows pending feedback); otherwise it changes the draft only. |
| `EntityDetail` | A record with its fields, indexed related records, attachments and audit history. Uses an `h2` heading by default; set `headingLevel` when embedding it under another page heading. |
| `BoardScreen` | Enum columns with filtered counts and optional sums; drag, keyboard and **Move to…** call the entity service, show pending state, roll back on failure and offer Undo. Viewers get a read-only board. |
| `RecordAvatar` | A record's face from an `avatar` field: a lazy library image (64 px at 1x, 128 px at 2x) with initials as the fallback. `EntityList` and `BoardScreen` cards show it next to the title, and `EntityDetail` in the header and the field. |
| `RelationPicker` | Searches indexed relation options and can create a related record inline when the persona may create it. |
| `NotificationsBell` | Unread badge and list from `createNotificationService`; mark one or all read (`features.notifications`). |
| `MembersScreen` | Invite, change role and remove members; hidden or disabled without `members:*`. The service refuses to remove the last owner. Each row shows the persona's avatar photo (initials as the fallback). |

```svelte
<script lang="ts">
  import { createEntityServices } from '@protoyard/blueprint';
  import { EntityDetail, EntityForm, EntityList, MembersScreen, NotificationsBell } from '@protoyard/crud';
  // blueprint and runtime from your prototype
  const services = createEntityServices(runtime, blueprint);
  const ticket = blueprint.entities.find((e) => e.name === 'ticket');
</script>

<NotificationsBell {runtime} />
<EntityList {blueprint} entityName="ticket" {services} onCreate={openForm} onEdit={editRow} />
<EntityDetail {runtime} {blueprint} {services} entityName="ticket" recordId={ticketId} />
<EntityForm entity={ticket} mode="create" {runtime} {blueprint} {services}
  onSubmit={(input) => services.ticket.create(input)} />
<MembersScreen {runtime} />
```

Lists lay out as a single `minmax(0, 1fr)` grid column, so a wide table scrolls inside its
card instead of widening the page on phones.

When a matching blueprint `detail` screen declares `tabs`, `EntityDetail` renders those
sections as hash-shareable tabs. The overview keeps the same field display; `related:<entity>`
shows the child list filtered to the record and creates children with the back-relation fixed to
the parent. `activity`, `files`, and `audit` appear only when their entity feature is enabled,
and their panel components load on demand. Without declared tabs, the existing `EntityDetail`
layout and API remain unchanged.

## Board screen (`@protoyard/crud/screens/board`)

A blueprint `board` screen (`entity`, enum `groupBy`, optional `cardFields` and numeric or
money `sumField`) rendered by `BoardView` in a separate entry:

```svelte
<script lang="ts">
import { BoardScreen } from '@protoyard/crud/screens/board';
</script>

<BoardScreen {runtime} {blueprint} {services} screen={boardScreen} />
```

- Columns follow the enum's declared order and show the filtered card count and sum. Money
  sums use integer cents and the active persona's locale.
- Cards support pointer drag, keyboard movement and a **Move to…** menu. Moves persist through
  the entity service, show pending feedback, roll back on failure and include an **Undo** toast.
- Update permissions determine whether the interactive board is rendered. Viewers see the
  same filtered cards and totals without move controls. Records with missing or invalid group
  values are counted below the board.
- `FilterBar` filters the board and its counts and sums together. Import
  `@protoyard/views-ui/styles.css` and add its source path with `@source` so Tailwind sees the
  view classes.

## Calendar screen (`@protoyard/crud/screens/calendar`)

A blueprint `calendar` screen (`entity`, `dateField`, `endField`, `colorBy`, `view`) on top of
`CalendarView` from `@protoyard/views-ui/calendar`, in its own lazy entry:

```svelte
<script lang="ts">
import { CalendarScreen } from '@protoyard/crud/screens/calendar';
</script>

<CalendarScreen {runtime} {blueprint} {services} screen={calendarScreen} />
```

- A `date` field shows all-day events (`endField` is the last day, inclusive); a `datetime`
  field shows timed events (one hour without an end). Generated ISO instants in date fields
  land on their civil day in the persona's zone. Records without a date are counted under the
  calendar, not hidden silently.
- Moving or resizing an event calls the entity service's `update` (pending, then saved, or
  rolled back on error). An empty slot or day opens the create form prefilled with that date
  and time. Both follow the persona's `<entity>:update` / `:create` capabilities, so a viewer
  gets a read-only calendar.
- `colorBy` colors events by enum value in declared order, with a legend. Today, the
  now-line and the week follow the persona's zone and locale and the runtime clock.
- Below 640 px it starts in the agenda list; otherwise in the screen's `view`.
- It brings in `@protoyard/views-ui` and `@protoyard/views` (lazy, with this entry only).
  Prototypes import `@protoyard/views-ui/styles.css` and add its source path with `@source`
  so Tailwind sees the view's classes (see the views-ui README).

## Map screen (`@protoyard/crud/screens/map`)

A blueprint `map` screen (`entity`, `geoField`, optional `colorBy`) on the offline
`SimulatedMap`, in its own lazy entry:

```svelte
<script lang="ts">
import { MapScreen } from '@protoyard/crud/screens/map';
</script>

<MapScreen {runtime} {blueprint} {services} screen={mapScreen} />
```

- Records with valid `{ lat, lng }` values become map markers and accessible rows in
  the synced list. Selecting either highlights both; **Open record** uses the supplied
  `onOpenRecord` callback or the entity detail route. Records without a valid point are
  counted below the map.
- Markers cluster when there are more than 200 placed records. The list keeps every
  marker available to keyboard and screen-reader users. `colorBy` uses an enum legend
  with tone, shape and glyph cues.
- The map is a fictional SVG basemap with no tile server or runtime network requests.
  This entry loads the view only when the map route is used. Import
  `@protoyard/views-ui/styles.css` and add its source path with `@source` so Tailwind sees the
  view classes.
- Blueprint `geo` fields keep editable latitude and longitude inputs and provide a
  **Pick on map** control. It loads the offline map on demand; clicking a point or
  focusing the map and pressing Enter updates the same inputs.

## Dashboard screen (`@protoyard/crud/screens/dashboard`)

A blueprint `dashboard` screen rendered from its KPI, chart, list and board-summary widgets:

```svelte
<script lang="ts">
import { DashboardScreen } from '@protoyard/crud/screens/dashboard';
</script>

<DashboardScreen {runtime} {blueprint} {services} screen={dashboardScreen} />
```

- KPI tiles show the selected period and its previous-period change. The 7, 30 and 90 day
  selector follows simulated runtime time.
- Charts render line, area, bar and donut aggregate data with an accessible table control.
  Chart families and the dashboard entry load on demand.
- Lists show the configured top records and open their detail routes. Board summaries open
  the matching board route when the blueprint declares one, or the entity list otherwise.
- Widgets read through entity services and update from `liveQuery`; denied entity access is
  shown as a per-widget permission state. No data is fetched from a network service.

## Analytics screen (`@protoyard/crud/screens/analytics`)

A blueprint `analytics` screen selects an aggregate measure, optional dimension and date field:

```svelte
<script lang="ts">
import { AnalyticsScreen } from '@protoyard/crud/screens/analytics';
</script>

<AnalyticsScreen {runtime} {blueprint} {services} screen={analyticsScreen} />
```

- Date range, comparison period and bucket granularity are shareable in the hash query. Changing
  the measure or dimension recalculates the series through the blueprint aggregate API.
- The screen shows a lazy line chart and sortable aggregate table; money measures use the field
  currency and active persona locale.
- CSV export includes the selected series and is shown only when the active persona has the
  entity's export capability. The export is generated locally from the same aggregate result.
- Reads use entity services and `liveQuery`; denied reads get a permission state, and no external
  data service is contacted.

## Timeline screen (`@protoyard/crud/screens/timeline`)

A blueprint `timeline` screen (`entity`, `startField`, `endField`, optional `groupBy` and `zoom`)
renders dated records with `TimelineView` from `@protoyard/views-ui/timeline`, in its own lazy entry:

```svelte
<script lang="ts">
import { TimelineScreen } from '@protoyard/crud/screens/timeline';
</script>

<TimelineScreen {runtime} {blueprint} {services} screen={timelineScreen} />
```

- Enum groups use the blueprint's declared value order and labels; relation and persona groups are
  sorted by their stored value. Tasks within a group sort by start date, title and id. Records with
  no valid start date are reported below the timeline. A missing or invalid end date becomes a
  one-day milestone.
- Week, month and quarter zoom are available. The today line follows the runtime clock, and each
  timeline keeps horizontal scrolling inside its own canvas.
- Keyboard and pointer rescheduling moves dates one day at a time; the task menu shifts a record by
  one week. Both update through the entity service and show pending feedback. The view restores its
  optimistic dates if a save fails. Viewers get a read-only timeline.
- Prototypes using the screen import `@protoyard/views-ui/styles.css` and add its source path with
  `@source` so Tailwind sees the view classes.

## Settings screen (`@protoyard/crud/screens/settings`)

A separate entry, so the screen loads only with its route. Sections come from a blueprint
`settings` screen (`profile`, `workspace`, `appearance`, `notifications`, `danger`).

```svelte
<script lang="ts">
import { SettingsScreen } from '@protoyard/crud/screens/settings';
</script>

<SettingsScreen {runtime} {blueprint} sections={['profile', 'workspace', 'appearance', 'danger']} />
```

| Section | What it does | Who |
| --- | --- | --- |
| Profile | Shows the signed-in persona's avatar photo, renames the persona and sets its avatar color (`py_personas`) | Every signed-in persona, own profile only |
| Workspace | Renames the active organization (`py_organizations`) | Owners and admins (`members:update`); read-only otherwise |
| Appearance | Theme and color mode through `runtime.theme.setPreference` (per persona); `library` adds themes loaded on demand | Everyone |
| Notifications | The blueprint rules that reach your role, the unread count and Mark all as read | Everyone |
| Danger zone | Resets the active scenario from its seed after an `AlertDialog` confirmation | Owners and admins; read-only otherwise |

`createSettingsServices(runtime)` backs the screen: zod input schemas, `session.assert` for
the role-gated actions, and `environment.run` around the identity writes (the runtime's
identity writer, which refreshes the session). Runtimes without an identity writer render
profile and workspace read-only. Roles here are a simulation, not security.

```bash
pnpm vitest run packages/crud
pnpm vitest run packages/crud/tests/settings-screen.test.ts
pnpm vitest run packages/crud/tests/map-screen.test.ts
pnpm vitest run packages/crud/tests/board-screen.test.ts
pnpm --filter @protoyard/crud typecheck
```

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.
