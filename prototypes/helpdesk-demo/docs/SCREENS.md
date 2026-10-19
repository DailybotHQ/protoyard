# Beacon Help Desk: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

## Screens

The routes are declared in `src/App.svelte`: one hand-written route
(`/tickets/:id/workspace`, matched first) plus the generated table in
`src/generated/routes.ts`. Every route is a lazy chunk.

| Route | Screen | File | Capability |
| --- | --- | --- | --- |
| `#/` | Dashboard (route title "Home") | `src/screens/Home.svelte` | — |
| `#/tickets/:id/workspace` | Ticket workspace | `src/screens/TicketWorkspace.svelte` | — |
| `#/tickets` | Tickets list | `src/generated/screens/TicketPage.svelte` → `src/screens/EntityPage.svelte` | — |
| `#/tickets/:id` | Ticket edit form | same | — |
| `#/customers` | Customers list | `src/generated/screens/CustomerPage.svelte` → `EntityPage.svelte` | — |
| `#/customers/:id` | Customer edit form | same | — |
| `#/replies` | Replies list | `src/generated/screens/ReplyPage.svelte` → `EntityPage.svelte` | — |
| `#/replies/:id` | Reply edit form | same | — |
| `#/members` | Members | `src/screens/Members.svelte` | — |

States that apply to every screen:

- **No route guards.** No route declares a capability, so every persona can
  open every screen. What changes per persona is which actions appear:
  screens check `can(capability)` and hide buttons, and the services enforce
  the same checks (see [FLOWS.md](FLOWS.md) and
  [PERMISSIONS.md](PERMISSIONS.md)).
- **Loading.** The router shows "Loading screen" while a chunk loads, and
  "This screen could not be loaded" with "Try again" if it fails. An unknown
  path shows "Page not found".
- **Errors.** Data comes from local reads (`liveQuery` over the entity
  services), which have no error state on these screens. Write failures
  (permission, simulated network) appear as toasts; validation errors appear
  inline in forms.
- **Header.** On every screen: "Search" (⌘K) opens a command palette that
  navigates to any section or finds records by title (tickets open the
  workspace, customers and replies open their edit form; entities the role
  cannot read return no results), and the notifications bell (see below).

### Dashboard (`#/`)

- **Purpose:** the SLA overview and status board for the desk. Sidebar
  label "Dashboard".
- **Data:** four counters from the non-deleted tickets and the simulated
  clock: Unsolved (with the total), SLA breached (unsolved, past
  `slaDueAt`), Due in 24 h (unsolved, still on time) and Urgent (unsolved,
  urgent priority). A four-column ticket board (Open, Pending, On hold,
  Solved) with a count per column and up to 8 cards per column, ordered
  urgent first, then soonest SLA, then subject; each card shows subject
  (links to the workspace), priority badge, SLA label ("Breached 3 h ago",
  "Due in 5 h", "Due in 2 d", "Due within the hour", "Solved", "No SLA") and
  assignee. "+N more in the list" links to Tickets. Agent load: open and
  breached tickets per assignee (or "Unassigned"), busiest first.
- **Actions:** "←" / "→" on a card moves the ticket to the neighboring status
  (`ticket.update`).
- **Loading:** a skeleton block. **Empty:** "No tickets yet" with "Create the
  first ticket from the Tickets list, or import a CSV." and "Open tickets".
  An empty column shows "No tickets."
- **Denied:** the move buttons are hidden without `ticket:update`.

### Ticket workspace (`#/tickets/:id/workspace`)

- **Purpose:** the agent's view of one ticket. Opened from a Tickets row, a
  board card or the search palette.
- **Data:** subject, status badge, priority, SLA label (red when breached),
  the customer's name and plan; the conversation (replies oldest first, with
  author, date and time; internal notes highlighted with an "Internal"
  badge); the generated detail of the ticket (every field except
  attachments, related replies as links, the Attachments list with name and
  size, and the Change history from `auditEntries` with each changed field
  as "before → after").
- **Actions:** "Edit" (to `#/tickets/:id`), "Mark solved" (unsolved
  tickets), the reply form with the "Internal note" checkbox, and the
  attachments dropzone (images, PDF or text, up to 2 MB each). "Dashboard"
  goes back.
- **Loading:** "Loading ticket…" (and "Loading record…" in the detail).
  **Not found:** "Ticket not found" ("It may have been deleted, or another
  scenario is loaded.") with "Open tickets". **Empty:** "No replies yet.",
  "No related replies.", "No attachments.", "No history yet."
- **Denied:** without `ticket:update`, Edit and Mark solved are hidden and the
  dropzone is replaced by "Your role can view attachments but not add them.";
  without `reply:create` the reply form is hidden.

### Tickets, Customers and Replies lists (`#/tickets`, `#/customers`, `#/replies`)

- **Purpose:** the generated list for each blueprint entity (`EntityList`
  from `@protoyard/crud`), headed "Tickets", "Customers" or "Replies".
- **Data:** a table, 10 rows per page, with the title field first and then
  the list-friendly fields (tickets: subject, status, priority, channel,
  customer, assignee, SLA due, tags; customers: name, email, plan, account
  manager, tags; replies: message, ticket, author, internal note). Relation
  and persona cells show names when the role can read them. Rows come in the
  entity's default order (tickets by SLA due, customers by name, replies by
  creation time); columns are sortable and the search box matches the title
  and searchable fields (ticket subject and description, customer name and
  email, reply message).
- **Actions:** "New" (create form), row click (tickets open the workspace;
  customers and replies open the edit form), row checkboxes with "Delete N"
  and a confirmation, and for tickets and customers "Export CSV",
  "Import CSV" and an Active / Trash toggle. A single delete shows "Moved to
  trash" with Undo (tickets, customers) or "Deleted" (replies); a multi-row
  delete shows "Deleted N records".
- **Loading:** the table's skeleton rows. **Empty:** "No tickets yet" (or
  customers, replies) with "Create the first record to get started." when the
  role can create; "Trash is empty" with "Soft-deleted records appear here."
  in the Trash view.
- **Denied:** "New" needs `<entity>:create`; checkboxes need `<entity>:delete`
  or `<entity>:delete:own` without a record, so only owner and admin get
  them; Export needs `<entity>:export`; Import needs `<entity>:import`
  (customers: owner and admin only). Without `<entity>:read` the list shows
  "You do not have access to this list." (no role in this blueprint lacks
  read).
- **Gaps:** the Trash view has no restore or permanent-delete action; the
  multi-row delete is a hard delete although the dialog says the records go
  to the trash.

### Edit and create forms (`#/tickets/:id`, `#/customers/:id`, `#/replies/:id`, and "New")

- **Purpose:** the generated form (`EntityForm`) for one record, with "Back
  to list".
- **Data:** one control per blueprint field: text, textarea (description),
  selects for enums, a checkbox for `internal`, a date-time input for SLA
  due, and comma-separated text for tags. Relation, persona and file fields
  (customer, ticket, account manager, assignee, author, attachments) are plain
  text inputs that take record or persona ids (placeholder "id").
- **Actions:** "Create Tickets" / "Create Customers" / "Create Replies" or
  "Save"; on success the app returns to the list.
- **Errors:** field errors under each control; other errors as a toast
  ("Could not create", "Could not save") and a message under the form.
- **Not found:** an unknown or deleted id falls back to the list.
- **Denied:** the form is not gated: every role can open it, and a role
  without the capability gets "Not allowed" on submit (for example a viewer,
  or a member editing another person's reply).

### Members (`#/members`)

- **Purpose:** the seeded team and their simulated roles.
- **Data:** every persona with avatar, name, title (or email or id) and role
  badge, sorted by name; "Roles are simulated policy, not security."
- **Actions:** none (read-only). Persona switching lives in DevTools.
- **Empty:** "No members loaded."

### Notifications (header bell)

- **Purpose:** the active persona's in-app inbox.
- **Data:** an unread count badge; in the open panel, the persona's
  notifications newest first, with title and kind (read ones muted).
- **Actions:** click a row to mark it read; "Mark all read".
- **Empty:** "No notifications yet."
- **Errors:** a simulated failure on mark-read shows no message (the calls
  are not wrapped in `runService`).

## Shell

`protoyard.json` sets `"preview": { "viewport": "desktop" }` and
`"platform": "responsive"`: the prototype is designed for a desktop browser
and previewed at a desktop viewport, and the layout also works on smaller
screens (the status board scrolls horizontally). It uses the `AppShell` from
`@protoyard/ui`: a sidebar with the desk name and headset logo, five links
(Dashboard, Customers, Tickets, Replies, Members) and the active persona with
title and role badge; a header with Search (⌘K) and the notifications bell.
Content is centered with a maximum width of `max-w-7xl`. The default theme is
`ocean` with the system light or dark mode.
