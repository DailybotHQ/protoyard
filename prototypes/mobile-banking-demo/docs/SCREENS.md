# Lumen Bank (fictional): screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

Hash routes declared with `createRouter` in `src/App.svelte` (page titles end
with the manifest name):

| Path | Screen | Title | Bottom tab | Required capability |
| --- | --- | --- | --- | --- |
| `#/` | `src/screens/Home.svelte` | Home | Home | none to view |
| `#/accounts/:id` | `src/screens/AccountDetail.svelte` | Account | Home (active) | none to view; `accounts:manage` for status actions |
| `#/activity` | `src/screens/Activity.svelte` | Activity | Activity | none |
| `#/transfer` | `src/screens/Transfer.svelte` | Send money | Transfer | `transfers:create` |
| `#/payees` | `src/screens/Payees.svelte` | Payees | Payees | none to view; `beneficiaries:manage` to add or remove |
| `#/profile` | `src/screens/Profile.svelte` | Profile | Profile | none |

`accounts:read` is held by every role but no screen or service checks it.

## Screens

Every screen uses `src/components/Page.svelte`: a sticky mobile header and
condition banners (`ConditionBanners.svelte`) for simulated offline ("You're
offline (simulated)"), a slow network, a simulated failure mode, and a
view-only notice for the `viewer` role. Data comes from `liveQuery`, so every
write appears without a reload.

### Home (`#/`)

- Purpose: the household's money at a glance.
- Data: a greeting by simulated time of day and first name; total balance
  (sum of every `balanceCents`, so card balances are subtracted); swipeable
  account cards with status badges and a "Low balance" tag for an active
  non-credit account under 5,000 cents; recent activity (6 newest rows,
  pending rows included); spending by category for the last 30 simulated
  days (excludes transfers).
- Actions: quick links to Transfer, Payees and Activity; "Payroll" (simulated
  payroll deposit to the first active checking account). Each account card
  opens its account page.
- States: skeletons while loading; a red notice when any account is locked
  (with a link to it) and an amber one when any is dormant; a welcome empty
  state when there are no transactions, with "Simulate payroll deposit" or,
  without `transfers:create`, "Ask the primary holder to make the first
  deposit"; "No spending in the last 30 days." The Payroll button is disabled
  for view-only access or without an active checking account. Errors appear
  as a toast.

### Account (`#/accounts/:id`)

- Purpose: one account's balance, limits and history.
- Data: balance ("Current balance" for credit, "Available balance"
  otherwise), status badge, pending total, per-transfer limit, opened date,
  status; transactions grouped by month, filtered by a search (merchant or
  memo) and a category.
- Actions: "Move money" (active accounts, links to `#/transfer?from=<id>`);
  "Freeze account", "Unfreeze account" or "Reactivate account" behind an
  alert dialog (only with `accounts:manage`).
- States: skeleton while loading; "Account not found" error state with a link
  home; locked and dormant notices; "No transactions yet" or "No matches"
  empty states. Denied: the status button is hidden, and a non-active account
  shows "Only the primary holder can unfreeze or reactivate this account."
  Service errors are shown inside the dialog, which stays open.

### Activity (`#/activity`)

- Purpose: every transaction across accounts, newest first.
- Data: transactions grouped by month with account names; a "Showing N of M"
  count.
- Actions: filter by account (also from `?account=<id>`), category and
  direction (All, Money in, Money out); 30 more rows load when the end of the
  list scrolls into view, or with "Load more".
- States: skeletons while loading; "No activity yet" or "Nothing matches";
  "You've reached the beginning of your history." at the end. Read only, so
  there is no denied state.

### Send money (`#/transfer`)

- Purpose: a four-step transfer: From → To → Amount → Review, then a receipt.
- Data: own accounts with balances; recipients (other own accounts and
  payees); available balance; a review summary ("Arrives: Instantly" between
  own accounts, "Today (simulated)" for payees).
- Actions: pick source and recipient (locked and dormant accounts are
  disabled with a reason), quick amounts, memo, "Review transfer", "Send $X",
  "Edit amount", and on the receipt "Done" or "Make another transfer". Deep
  links `?from=<accountId>` and `?to=<id>` skip answered steps (a source that
  is not active is ignored). On a phone shell the primary button sits in the
  shell's sticky footer.
- States: skeleton while loading; "No accounts yet" and "No recipients yet"
  (with "Add a payee"); warnings before review for amounts above the
  balance, the account limit or the joint-holder cap; a service failure is
  shown inline on the review step with "No money moved" plus a toast; the
  receipt shows the reference (the transfer id), time and new balance.
  Denied: without `transfers:create`, "Transfers aren't available for your
  access" with a link home.

### Payees (`#/payees`)

- Purpose: saved recipients outside the household.
- Data: payees sorted by name, with nickname, name, fictional institution and
  masked last 4 digits.
- Actions: add (bottom sheet with a demo warning, per-field validation),
  remove (alert dialog), and send (links to `#/transfer?to=<id>`, only with
  `transfers:create`).
- States: skeletons while loading; "No payees yet" (with "Add a payee" for
  the owner); form errors per field and inline; removal errors inside the
  dialog. Denied: without `beneficiaries:manage`, a "Read-only list" notice
  and no add or remove buttons.

### Profile (`#/profile`)

- Purpose: who you are in the demo and how the app looks.
- Data: the "Demo only" notice, the active persona's name, email and role
  label (Primary holder, Joint holder, View only), household members with
  their roles and join dates, and the active scenario's name and description.
- Actions: color mode Light, Dark or System, saved for the active persona on
  this device (notes when a DevTools override is active).
- States: no loading state (session data is in memory); a failed preference
  save shows a toast.

## Shell

`protoyard.json` sets `"platform": "mobile"` and `"preview": { "viewport":
"iphone" }`. With the default `auto` shell, a mobile prototype resolves to the
`phone` shell, so on a desktop window the app renders inside a phone device
frame; DevTools can switch the device frame, device and orientation. Inside,
`MobileAppShell` (from `@protoyard/ui`) fills the app viewport, centered at up
to `max-w-md`: only `<main>` scrolls, while the bottom tab bar (Home,
Activity, Transfer, Payees, Profile) and the Transfer screen's sticky footer
stay visible.
