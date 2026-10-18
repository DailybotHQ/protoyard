# Pipeline CRM: screens

## Routes

<!-- protoyard:generated:routes -->
| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Dashboard | — | Review CRM activity and pipeline performance. |
| `#/pipeline` | Pipeline | — | Review deals across pipeline stages. |
| `#/deals` | Deals | `deals:read` | Browse and manage CRM deals. |
| `#/deals/:id` | Deal | `deals:read` | Inspect an individual deal. |
| `#/companies` | Companies | `companies:read` | Browse CRM companies. |
| `#/companies/:id` | Company | `companies:read` | Inspect an individual company. |
| `#/contacts` | Contacts | `contacts:read` | Browse CRM contacts. |
| `#/activity` | Activity | — | Review recent CRM activity. |
| `#/team` | Team & settings | — | Review team members and workspace settings. |
<!-- /protoyard:generated:routes -->

## Screens

States that apply to every screen:

- **Capability column.** The route `capability` is descriptive metadata for
  the spec. No route guard uses it, so every persona can open every screen.
  `deals:read` and `contacts:read` are not named by any role (owner and admin
  hold them through `*`). What changes per persona is which actions appear:
  screens check `can(capability, record)` and hide or disable buttons, and
  the services enforce the same checks (see [FLOWS.md](FLOWS.md)).
- **Loading.** Screens are lazy chunks; the router shows "Loading screen"
  while one loads, and "This screen could not be loaded" with "Try again" if
  the chunk fails. An unknown path shows "Page not found".
- **Errors.** Data comes from local `liveQuery` reads, which have no error
  state on these screens. Write failures (permission, paywall, simulated
  network) appear as toasts; validation errors appear inline in dialogs.
- **Paywall.** With an expired plan, create buttons are disabled
  ("New deal", "New company", "New contact", the Pipeline "+" buttons) and
  the Dashboard shows a "Your subscription has expired" banner.

### Dashboard (`#/`)

- **Purpose:** the pipeline at a glance, greeting the persona by first name.
- **Data:** four metrics from all stored deals: open pipeline (sum and count
  of open deals), weighted forecast (amount × probability), won in the last
  30 simulated days, and win rate over all closed deals; open value per stage
  as bars; "Your next closes" (up to five of the persona's open deals by close
  date); the eight newest activities.
- **Actions:** "Company" (`companies:write`) and "New deal" (`deals:create`,
  disabled with no companies or an expired plan); links to the board and the
  activity feed.
- **Empty:** with no deals and no companies, an "Your pipeline is empty" card
  with "Add your first company" (or "Ask an admin to add companies — your
  role is read-only." without `companies:write`) and a four-step
  "Getting started" checklist. "No open deals assigned to you." when the
  persona owns no open deal. Win rate shows "—" with no closed deals.
- **Denied:** buttons are hidden without the capability.

### Pipeline (`#/pipeline`)

- **Purpose:** a Kanban board of deals by stage.
- **Data:** one column per stage (Lead to Won; Lost when "Show lost" is
  checked) with count and compact total; cards with title, company, amount,
  probability and owner avatar, sorted by amount.
- **Actions:** filter by deal title or company name, "Mine" (owned by the
  persona), "Show lost"; drag a card or use its "Move to…" menu
  (`deals.moveStage`; Lost opens the lost-reason dialog); "+" on an open
  column creates a deal in that stage (`deals:create`).
- **Empty:** "No deals here" in an empty column.
- **Denied:** cards the persona cannot update (`deals:update` with the
  owner rule) have no drag handle, are not draggable and have no menu.

### Deals (`#/deals`)

- **Purpose:** a searchable list of deals.
- **Data:** a paginated table (15 per page) with deal and company, stage,
  amount, owner and relative close date; header "N of M deals". Default sort
  is amount, descending; columns are sortable.
- **Actions:** search by deal, company or owner; filter by stage ("Open
  deals" by default, "All stages" or one stage) and owner; click a row to
  open the deal; "New deal" (`deals:create`).
- **Loading / empty:** the table's loading state while the query resolves;
  "No deals match" with "Try another stage or owner filter."
- **Denied:** "New deal" hidden without `deals:create`.

### Deal (`#/deals/:id`)

- **Purpose:** everything about one deal.
- **Data:** title and stage, company link, owner, amount, win probability,
  expected close, primary contact, lost reason (when lost), created date; an
  Activity tab (newest first, with count) and a Contact tab.
- **Actions:** "Change stage" select, "Edit" (deal dialog), "Delete" with
  confirmation, "Log activity" (note, call, email or meeting), Back.
- **Loading:** "Loading deal…". **Not found:** "Deal not found" with "Back to
  deals". **Empty:** "No activity yet."; "No primary contact on this deal."
- **Denied:** without `deals:update` for this deal, the stage select and Edit
  are hidden and a "Read-only for your role" badge appears; Delete needs
  `deals:delete`; the log form needs `activities:create`.

### Companies (`#/companies`)

- **Purpose:** the account list with pipeline rollups.
- **Data:** a paginated table (15 per page) with name, domain and tags,
  industry, employees, contact count and open pipeline (value and open deal
  count); header "N accounts". Default sort is open pipeline, descending.
- **Actions:** search by name, domain, city or industry; filter by industry;
  click a row to open the company; "New company" (`companies:write`).
- **Loading / empty:** the table's loading state; "No companies yet".
- **Denied:** "New company" hidden without `companies:write`.

### Company (`#/companies/:id`)

- **Purpose:** one account with its deals and contacts.
- **Data:** name, domain, city, employees, industry; its deals (amount and
  stage) and contacts (title and email).
- **Actions:** "Edit" (`companies:write`), "Delete" (`companies:delete`,
  confirmation lists how many contacts and deals go with it), "Deal"
  (`deals:create`) and "Contact" (`contacts:write`) with the company
  preselected; Back.
- **Loading:** "Loading company…". **Not found:** "Company not found" with
  "Back to companies". **Empty:** "No deals with this company yet.",
  "No contacts yet."
- **Denied:** each button is hidden without its capability (reps see no
  Delete).

### Contacts (`#/contacts`)

- **Purpose:** every person across accounts.
- **Data:** a paginated table (20 per page) with name and title, company
  link, email and phone; header "N people across your accounts". Default sort
  is name, ascending.
- **Actions:** search by name, email, company or title; "New contact",
  per-row Edit (`contacts:write`) and Delete with confirmation
  (`contacts:delete`).
- **Loading / empty:** the table's loading state; "No contacts yet".
- **Denied:** buttons hidden without the capability (reps can edit but not
  delete).

### Activity (`#/activity`)

- **Purpose:** the full workspace history, newest first.
- **Data:** actor, body, type badge and relative time, with a link to the
  deal or company; 40 items per page.
- **Actions:** filter by type (all, stage changes, created, notes, calls,
  emails, meetings); "Load more". Read-only.
- **Empty:** "No activity yet".

### Team & settings (`#/team`)

- **Purpose:** members, the persona's own access and billing.
- **Data:** members from the platform membership and persona tables with
  title, join date, role, open deal count and won amount; "Your access" lists
  every capability in `CAPABILITIES` as allowed or blocked; the storage
  namespace and workspace creation date.
- **Actions:** none (read-only). Persona switching lives in DevTools.
- **Denied:** "Only owners and admins can manage the team." without
  `team:manage`; billing (plan and status) is visible only with
  `billing:manage`, otherwise "Only the owner can see billing."

## Shell

`protoyard.json` sets `"preview": { "viewport": "desktop" }` and
`"platform": "responsive"`: the prototype is designed for a desktop browser
and previewed at a desktop viewport, and the layout also works on smaller
screens. It uses the `AppShell` from `@protoyard/ui`: a sidebar with the
workspace name, the seven navigation links, and the active persona with role
and plan badge; on phones and tablets a header with a menu button opens the
sidebar as a drawer. Content is centered with a maximum width of `max-w-7xl`.
