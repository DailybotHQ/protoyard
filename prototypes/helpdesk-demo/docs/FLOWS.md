# Beacon Help Desk: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. This prototype has no
`src/domain/services.ts`: its services are generated from
[blueprint.json](../blueprint.json).

- **Entity services:** `createServices(runtime)` in
  `src/generated/services.ts` returns one service per entity (`customer`,
  `ticket`, `reply`) from `createEntityServices` in
  `packages/blueprint/src/services.ts`. Below, `ticket.update(id, patch)`
  means `services.ticket.update(...)`. They follow the full pipeline: the
  capability check (an `:own` capability falls back to the record rule), zod
  input schemas derived from the field rules, `environment.run('<entity>.<operation>')`
  and one `db.transaction` that also writes the audit entry and any
  notification.
- **File service:** `createFileServices(runtime, blueprint).ticket` in
  `packages/blueprint/src/files.ts`.
- **Notification service:** `createNotificationService(runtime)` in
  `packages/blueprint/src/notifications.ts`.

Every mutation those services expose appears below. Some are not reachable
from any screen today; they are listed at the end and marked as such.

Common failure behavior: screens call services through `runService`. A
permission denial shows a "Not allowed" toast naming the capability, a
simulated network failure (offline, timeout, server error, rate limit) shows
a toast with the simulated message, and a zod `ValidationError` is shown
inline next to the form field. A missing record fails with
`EntityNotFoundError` ("No ticket with id …"). In every failure case nothing
is written: the checks run before `environment.run`, and the writes share
one transaction.

Writes common to every entity mutation below: `auditEntries` gets one row
(id, entity, recordId, actorId, action, at, seq, changes with only the
changed fields) per affected root record, in the same transaction.

## Create a customer

1. Customers → "New" → fill name, email, plan, account manager (a persona id
   typed into a text field; blank means "me") and comma-separated tags →
   "Create Customers". On success the app returns to the list.
2. Service: `customer.create(input)` in src/generated/services.ts (`createEntityServices`, packages/blueprint/src/services.ts)
3. Capability: `customer:create` (owner, admin, member)
4. Writes (one transaction): `customers` (new row: id, name, email, plan, accountManagerId (the acting persona when blank), tags, createdAt, updatedAt), `auditEntries` (`create`)
5. Failure states: permission denied, validation errors ("Name must have at least 2 characters", "Enter a valid email address", "Account manager not found" for an unknown persona id), simulated offline or failure (nothing written)

## Edit a customer

1. Customers → click a row (opens `#/customers/:id`, the edit form) →
   change fields → "Save". The form opens for every role; a role without the
   capability gets the denial on save.
2. Service: `customer.update(id, patch)` in src/generated/services.ts
3. Capability: `customer:update` (owner, admin, member), or `customer:update:own` when the persona is the customer's account manager (only owner and admin hold it, and they already hold `customer:update`)
4. Writes (one transaction): `customers` (the submitted fields, updatedAt), `auditEntries` (`update` with the changed fields)
5. Failure states: record not found, permission denied, validation errors, simulated offline or failure (nothing written)

## Delete a customer or a ticket to the trash, with Undo

1. Customers or Tickets → select row(s) → "Delete N" → confirm
   ("It will move to trash. You can undo for a short time."). A "Moved to
   trash" toast offers **Undo**. Selection is available when a visible row
   passes its per-record delete capability check (see [PERMISSIONS.md](PERMISSIONS.md)).
2. Service: `customer.remove(id)` or `ticket.remove(id)` once per selected id in src/generated/services.ts; each returns an undo token
3. Capability: `customer:delete` / `ticket:delete` (owner and admin through `*`), or `ticket:delete:own` when the ticket's `assigneeId` is the acting persona. Members hold no customer delete capability.
4. Writes (one transaction): soft delete of the record and its cascade — `customers` (deletedAt, deletedBy, updatedAt), its `tickets` (same fields) and those tickets' `replies` (same fields, although replies have no soft-delete feature); server-side restore metadata is stored with the root. Attachments remain available in Trash and are removed if the row is purged; audit rows stay.
5. Failure states: record not found, permission denied, simulated offline or failure (nothing written; "Could not delete" toast)

### Undo the delete

1. The "Undo" action on the "Moved to trash" toast.
2. Service: `customer.restore(undoToken)` or `ticket.restore(undoToken)` in src/generated/services.ts. The token identifies the root only; row ids and original references are read from stored group metadata.
3. Capability: the same delete check as the removal, against the trashed record
4. Writes (one transaction): every row in the undo set (deletedAt and deletedBy back to `null`, updatedAt), `auditEntries` (`restore`)
5. Failure states: "The undo window has expired." (30 seconds of simulated time; the clock is stopped unless changed in DevTools), "The rows in this undo set are no longer available.", permission denied, simulated offline or failure ("Could not undo" toast; nothing written)

## Delete several selected records

1. Customers, Tickets or Replies → select two or more rows → "Delete N" →
   confirm. Customers and Tickets move to Trash and the toast offers **Undo**;
   Replies are hard-deleted because soft delete is disabled for them.
2. Service: `customer.remove(id)` / `ticket.remove(id)` once per selected soft-delete row, or `reply.bulkRemove(ids)` for hard-delete rows
3. Capability: each selected row must pass `<entity>:delete`, or `<entity>:delete:own` with the stored record (tickets: assignee; replies: author).
4. Writes: one transaction per selected soft-delete row, including its cascade and root audit entry; hard-delete rows use one `bulkRemove` transaction.
5. Failure states: a denial or simulated failure stops processing; prior successful soft deletes remain in Trash and are reflected by the live list, while the failed and remaining records are unchanged.

## Create a ticket

1. Tickets → "New" → fill subject, description, status, priority, channel,
   customer (a customer id typed into a text field), assignee (a persona id;
   blank means "me"), SLA due (a date and time), attachments (file ids) and
   tags → "Create Tickets". On success the app returns to the list.
2. Service: `ticket.create(input)` in src/generated/services.ts
3. Capability: `ticket:create` (owner, admin, member)
4. Writes (one transaction): `tickets` (new row: id, subject, description, status (default `open`), priority (default `normal`), channel (default `email`), customerId, assigneeId (the acting persona when blank), slaDueAt (as typed, or `null`), attachmentsIds, tags, createdAt, updatedAt), `auditEntries` (`create`), `notifications` (`ticket.create`, "New ticket: {subject}", one per `admin` membership other than the acting persona)
5. Failure states: permission denied, validation errors ("Subject must have at least 4 characters", "Customer is required", "Customer not found", "Assignee not found"), simulated offline or failure (nothing written)

The service does not compute `slaDueAt`; only the scenario generator does.

## Edit or reassign a ticket

1. Tickets list → a row opens the ticket workspace → "Edit" (opens
   `#/tickets/:id`, the edit form), or the ⌘K search → a ticket → "Edit".
   Change any field, including the assignee → "Save".
2. Service: `ticket.update(id, patch)` in src/generated/services.ts
3. Capability: `ticket:update` (owner, admin, member; any ticket), or `ticket:update:own` with the ticket (assignee; owner and admin only)
4. Writes (one transaction): `tickets` (the submitted fields, updatedAt), `auditEntries` (`update` with the changed fields), `notifications` (`ticket.assign`, "You were assigned: {subject}", to the new assignee when `assigneeId` changed to a persona other than the acting one)
5. Failure states: record not found, permission denied, validation errors, simulated offline or failure (nothing written)

## Move a ticket on the status board

1. Dashboard → Ticket board → the "←" / "→" buttons on a card move it to the
   neighboring status (Open ↔ Pending ↔ On hold ↔ Solved). The buttons are
   hidden without `ticket:update`. A toast confirms "Moved “…” to Pending".
2. Service: `ticket.update(id, { status })` in src/generated/services.ts
3. Capability: `ticket:update` (owner, admin, member)
4. Writes (one transaction): `tickets` (status, updatedAt), `auditEntries` (`update` with the status change)
5. Failure states: permission denied, simulated offline or failure (nothing written)

## Mark a ticket solved

1. Ticket workspace (`#/tickets/:id/workspace`) → "Mark solved" (shown for
   unsolved tickets with `ticket:update`). Toast "Ticket solved". The ticket's
   SLA then counts as met on the dashboard.
2. Service: `ticket.update(id, { status: 'solved' })` in src/generated/services.ts
3. Capability: `ticket:update` (owner, admin, member)
4. Writes (one transaction): `tickets` (status `solved`, updatedAt), `auditEntries` (`update`)
5. Failure states: permission denied, simulated offline or failure (nothing written)

## Reply or add an internal note

1. Ticket workspace → Conversation → type the message, optionally tick
   "Internal note (not sent to the customer)" → "Send reply" / "Add note".
   The form is hidden without `reply:create`. Toast "Reply sent (simulated)"
   or "Internal note added". Replies can also be created from Replies →
   "New" (message, ticket id, author id, internal).
2. Service: `reply.create({ message, ticketId, internal })` in src/generated/services.ts
3. Capability: `reply:create` (owner, admin, member)
4. Writes (one transaction): `replies` (new row: id, message, ticketId, authorId = acting persona, internal, createdAt, updatedAt), `auditEntries` (`create`)
5. Failure states: permission denied, validation errors shown under the textarea ("Message must have at least 2 characters", "… at most 200 characters"), "Ticket not found", simulated offline or failure (nothing written)

## Edit a reply

1. Replies → click a row (opens `#/replies/:id`, the edit form) → "Save".
   The form opens for every role.
2. Service: `reply.update(id, patch)` in src/generated/services.ts
3. Capability: `reply:update` (owner and admin through `*`), or `reply:update:own` with the reply (members: only replies whose `authorId` is their persona)
4. Writes (one transaction): `replies` (the submitted fields, updatedAt), `auditEntries` (`update`)
5. Failure states: record not found, permission denied ("Not allowed" for a member editing someone else's reply), validation errors, simulated offline or failure (nothing written)

## Delete a reply

1. Replies → tick one row → "Delete 1" → confirm ("This cannot be undone.").
   Selection appears for a role when the reply is owned by its author, or the
   role has unrestricted delete access.
2. Service: `reply.remove(id)` in src/generated/services.ts (hard delete; returns no undo token)
3. Capability: `reply:delete`, or `reply:delete:own` with the reply (author).
4. Writes (one transaction): deletes the `replies` row, `auditEntries` (`delete`)
5. Failure states: record not found, permission denied, simulated offline or failure (nothing deleted)

## Attach files to a ticket

1. Ticket workspace → "Add attachments" → drop files or "Choose files"
   (images, PDF or text, up to 2 MB each). Each file uploads separately with
   a toast "Attached error.txt", and the Attachments list in the detail
   refreshes. Roles without `ticket:update` see "Your role can view
   attachments but not add them."
2. Service: `files.ticket.upload({ entity: 'ticket', recordId, field: 'attachments', file })` from `createFileServices` in packages/blueprint/src/files.ts
3. Capability: `ticket:update` with the ticket, or `ticket:update:own` with the ticket (assignee)
4. Writes (one transaction): `files` (new row: id, name, type, size, ownerId = acting persona, entity `ticket`, recordId, createdAt, blob), `tickets` (attachmentsIds with the new id appended, updatedAt). No audit entry is written for an upload.
5. Failure states: permission denied, ticket not found, "Attachments does not accept …" (type), "Attachments must be at most 2097152 bytes.", quota exceeded (50 MB per prototype or the browser quota), simulated offline or failure ("Upload failed" toast; nothing written)

## Import records from CSV

1. Tickets or Customers → "Import CSV" → choose a file. Header cells are
   field names, labels or row properties (case-insensitive, as in an
   export); relation and persona cells must be stored ids. The whole file is
   validated first; any invalid row aborts the import. A successful import
   shows "Imported N rows".
2. Service: `ticket.importCsv(text, { mode: 'commit' })` or
   `customer.importCsv(text, { mode: 'commit' })` in src/generated/services.ts.
3. Capability: `<entity>:import` (tickets: owner, admin, member; customers: owner and admin); the service validates every row against the blueprint schema and relation rules.
4. Writes (one transaction): all rows with parsed fields, defaults, owner
   field, timestamps, import audit entries and enabled notifications
5. Failure states: invalid CSV, permission denial or simulated service failure
   writes nothing and shows a service error toast.

## Export a list as CSV

1. Tickets or Customers → "Export CSV" (needs `<entity>:export`: owner,
   admin, member). The browser downloads `tickets.csv` or `customers.csv` with
   the rows of the current view (the Trash view exports the trashed rows).
2. Service: none. The list serializes its loaded rows with `serializeEntityCsv` from `@protoyard/blueprint/csv`; the `exportCsv` service method (which asserts `<entity>:export`) is not used.
3. Capability: `customer:export` / `ticket:export`, checked only to show the button
4. Writes: nothing
5. Failure states: none (no simulated network on this path)

## Read notifications

1. Header → the bell (red count = unread) → the inbox lists the active
   persona's notifications, newest first. Click one to mark it read, or
   "Mark all read".
2. Service: `notifications.markRead(id)` and `notifications.markAllRead()` from `createNotificationService` in packages/blueprint/src/notifications.ts
3. Capability: none. The service has no `session.assert` and no zod step; it scopes every read and write to the acting persona's own rows (`personaId`), and a row of another persona is ignored. It does use `environment.run` and a transaction.
4. Writes (one transaction): `notifications` (readAt = simulated now, on the row or on every unread row of the persona)
5. Failure states: simulated offline or failure (nothing written). The bell calls the service with `void`, not through `runService`, so the failure shows no toast.

## Trash and service-only mutations

These are part of the generated service surface and covered by its package
tests. Trash restoration is available from the list; the other operations
below remain service-only. Each follows the full mutation pipeline.

### Restore a trashed record from the Trash view

1. Select a row in the Trash view and choose **Restore**; its soft-delete cascade is restored with it.
2. Service: `customer.restoreTrashed(id)` / `ticket.restoreTrashed(id)` in src/generated/services.ts
3. Capability: `<entity>:delete`, or `<entity>:delete:own` with the record
4. Writes (one transaction): the root and recorded cascade rows (deletedAt, deletedBy and deleteGroupId reset; updatedAt), `auditEntries` (`restore`)
5. Failure states: row no longer in Trash, permission denied, simulated offline or failure; nothing is written

### Purge a trashed record

1. Not available in the UI.
2. Service: `customer.purge(id)` / `ticket.purge(id)` / `reply.purge(id)` (only records that are already soft-deleted)
3. Capability: `<entity>:delete` with the record (no `:own` fallback, so only owner and admin)
4. Writes (one transaction): hard deletes the record and its cascade, removes attached `files` rows, and writes `auditEntries` (`purge`)
5. Failure states: record not in the trash ("No ticket with id …"), permission denied, simulated offline or failure

### Update several records at once

1. Not available in the UI.
2. Service: `<entity>.bulkUpdate(ids, patch)`
3. Capability: `<entity>:update`, or `<entity>:update:own` with each record
4. Writes (one transaction): the entity rows (patch, updatedAt), `auditEntries` (`update` per record), `notifications` (`ticket.assign` when the patch reassigns tickets)
5. Failure states: any record not found or denied fails the batch, validation errors, simulated offline or failure

### Import a CSV in one transaction

1. Tickets or Customers → "Import CSV" → choose a file.
2. Service: `<entity>.importCsv(text, { mode: 'commit', skipInvalid? })` (`mode: 'preview'` validates only and writes nothing). Relation and persona cells may be an id or a unique title or name.
3. Capability: `<entity>:import`
4. Writes (one transaction, in chunks of 1,000): the entity rows (owner field defaults to the acting persona), `auditEntries` (`import` per row), `notifications` (`ticket.create` per ticket)
5. Failure states: `ImportCsvError` when invalid rows remain without `skipInvalid` (nothing written), permission denied, simulated offline or failure

### Remove an attachment, mark a notification unread

1. Not available in the UI.
2. Service: `files.ticket.remove(id)`; `notifications.markUnread(id)`
3. Capability: file removal checks `ticket:update` (or `ticket:update:own`) with the ticket; `markUnread` has no capability check and touches only the acting persona's rows
4. Writes (one transaction): `files` (row deleted) and `tickets` (attachmentsIds without the id, updatedAt); `notifications` (readAt back to `null`)
5. Failure states: permission denied, simulated offline or failure (nothing written)
