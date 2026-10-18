# @protoyard/crud

Blueprint-driven list and form screens for Protoyard. `EntityList` wraps
`DataTable` + selection + bulk actions + CSV + trash; `EntityForm` renders a
`FormField` per blueprint field with inline zod errors via `runService`.
`NotificationsBell` and `MembersScreen` surface blueprint notifications and
`runtime.members` team management.

Every control respects `can()` (simulated policy, not security). Mutations still
go through blueprint entity services / members (`session.assert` → zod →
`environment.run` → `db.transaction`).

```svelte
<script lang="ts">
  import { EntityForm, EntityList, MembersScreen, NotificationsBell } from '@protoyard/crud';
  import { createEntityServices } from '@protoyard/blueprint';
  // blueprint + runtime from your prototype…
</script>

<header class="flex justify-end"><NotificationsBell {runtime} /></header>
<EntityList {blueprint} entityName="ticket" {services} onCreate={() => …} onEdit={(row) => …} />
<EntityForm entity={ticketEntity} mode="create" onSubmit={async (input) => services.ticket.create(input)} />
<MembersScreen {runtime} />
```

Soft-delete entities show Trash and an Undo toast after remove. CSV import/export
is available when `entity.features.csv` is true (codec loaded dynamically).

- **NotificationsBell** — liveQuery unread badge + list; mark one / mark all read
  via `createNotificationService` (enable `features.notifications` on entities).
- **MembersScreen** — invite / change role / remove; invite form and actions
  hidden or disabled when `members:*` is denied (viewer). Last-owner remove is
  refused by the service.
