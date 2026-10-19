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
| `RelationPicker` | Searches indexed relation options and can create a related record inline when the persona may create it. |
| `NotificationsBell` | Unread badge and list from `createNotificationService`; mark one or all read (`features.notifications`). |
| `MembersScreen` | Invite, change role and remove members; hidden or disabled without `members:*`. The service refuses to remove the last owner. |

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
| Profile | Renames the signed-in persona and sets its avatar color (`py_personas`) | Every signed-in persona, own profile only |
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
pnpm --filter @protoyard/crud typecheck
```
