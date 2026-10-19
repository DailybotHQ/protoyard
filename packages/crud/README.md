# @protoyard/crud

Blueprint-driven list, detail and form screens for Protoyard prototypes. Generated
prototypes (`protoyard generate`, see [docs/GENERATOR.md](../../docs/GENERATOR.md)) use it
through the `crud-app` template; hand-built prototypes can use it with any
[blueprint](../blueprint/README.md).

Every control respects `can()` (simulated policy, not security). Mutations go through the
blueprint's entity services and `runtime.members` (`session.assert` → zod →
`environment.run` → `db.transaction`); components never write tables.

| Component | What it does |
| --- | --- |
| `EntityList` | `DataTable` with search, sort, pagination, row selection and bulk delete; Trash and an **Undo** toast for `softDelete` entities; CSV export and import when `features.csv` is on (the codec loads lazily). Related records and personas are shown by name; money is formatted from integer cents with the blueprint currency. |
| `EntityForm` | A `FormField` per blueprint field with inline zod errors through `runService`. Pass `runtime`, `blueprint` and `services` to edit relation and persona fields with pickers. |
| `EntityDetail` | A record with its fields, indexed related records, attachments and audit history. Uses an `h2` heading by default; set `headingLevel` when embedding it under another page heading. |
| `BoardScreen` | Enum columns with filtered counts and optional sums; drag, keyboard and **Move to…** call the entity service, show pending state, roll back on failure and offer Undo. Viewers get a read-only board. |
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
- `FilterBar` filters the board and its counts and sums together. Add `@source` for
  `@protoyard/views-ui` to prototype CSS so Tailwind sees the view classes.

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
  Prototypes that use it add `@source` for `@protoyard/views-ui` in their CSS so Tailwind
  sees the view's classes (see the views-ui README).

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
  This entry loads the view only when the map route is used. Add `@source` for
  `@protoyard/views-ui` to prototype CSS so Tailwind sees the view classes.
- Blueprint `geo` fields keep editable latitude and longitude inputs and provide a
  **Pick on map** control. It loads the offline map on demand; clicking a point or
  focusing the map and pressing Enter updates the same inputs.

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
