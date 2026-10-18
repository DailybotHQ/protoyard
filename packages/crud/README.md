# @protoyard/crud

Blueprint-driven list and form screens for Protoyard. `EntityList` wraps
`DataTable` + selection + bulk actions + CSV + trash; `EntityForm` renders a
`FormField` per blueprint field with inline zod errors via `runService`.

Every control respects `can()` (simulated policy, not security). Mutations still
go through blueprint entity services (`session.assert` → zod → `environment.run`
→ `db.transaction`).

```svelte
<script lang="ts">
  import { EntityForm, EntityList } from '@protoyard/crud';
  import { createEntityServices } from '@protoyard/blueprint';
  // blueprint + runtime from your prototype…
</script>

<EntityList {blueprint} entityName="ticket" {services} onCreate={() => …} onEdit={(row) => …} />
<EntityForm entity={ticketEntity} mode="create" onSubmit={async (input) => services.ticket.create(input)} />
```

Soft-delete entities show Trash and an Undo toast after remove. CSV import/export
is available when `entity.features.csv` is true (codec loaded dynamically).
