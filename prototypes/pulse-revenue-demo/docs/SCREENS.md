# Pulse Revenue: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

## Screens

The blueprint in [../blueprint.json](../blueprint.json) emits the route definitions in `src/generated/routes.ts` and the screen components in `src/generated/screens/`.

- `/` — **Revenue overview** shows gross revenue, transaction count, average transaction, lifecycle totals, a weekly revenue chart, and revenue mix by plan. The chart widgets load from the charts kit on the dashboard route.
- `/insights` — **Revenue analytics** lets a user choose a date range, measure, and breakdown across lifecycle status, plan, channel, and region. CSV export is available to owner, admin, and analyst personas; a viewer sees data without export permission.
- `/transactions/board` — **Revenue lifecycle** groups transactions by lifecycle status. It is a generated view over the same transaction records as the dashboard and explorer.
- `/transactions` and `/transactions/:id` — **Transactions** provides the generated entity list, search, filtering, and generated transaction detail/edit route.
- `/settings` — **Settings** exposes the generated profile, workspace, and appearance sections.
- `/members` — **Members** uses the CRUD template's existing workspace membership screen and simulated roles.

The `empty` scenario exercises the no-transaction state. `quarter-of-history` is the default; `launch-spike` makes a recent revenue increase visible; `viewer` presents the quarter as a read-only persona. The generated views own their loading, empty, error, and denied states.

## Shell

The responsive sidebar shell switches to mobile tabs on narrow screens. The manifest preview uses a desktop viewport and supports both layouts.
