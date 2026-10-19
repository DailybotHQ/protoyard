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

```bash
pnpm vitest run packages/crud
pnpm --filter @protoyard/crud typecheck
```
