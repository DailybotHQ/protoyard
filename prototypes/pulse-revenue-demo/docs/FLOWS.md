# Pulse Revenue: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

## Explore revenue trends

1. The user opens Revenue overview, changes the generated dashboard period, and follows the Analytics link.
2. On `/insights`, the user chooses a date range, one of the generated measures, and a lifecycle, plan, channel, or region dimension. Analytics queries aggregate the local `transactions` table.
3. Read access is `transaction:read`; the `analyst`, `admin`, and `owner` personas can also use `transaction:export`.
4. Exploring trends is read-only. The generated analytics kit queries the simulated database; it does not send data over the network.
5. If no transactions match, the generated explorer shows its empty state. A viewer can inspect the same data but cannot export it.

## Export an analytics view

1. An owner, admin, or analyst selects a date range and breakdown on `/insights`, then chooses CSV export.
2. The generated analytics screen calls the blueprint CSV export service, which checks `session.assert('transaction:export')` before reading and serializing the matching transaction rows.
3. The browser downloads the result. No database rows are changed.
4. A viewer is denied by the service permission check; the UI does not offer the export action for that role.

## Review the lifecycle board

1. The user opens `/transactions/board` or the dashboard's Revenue lifecycle summary.
2. The generated board groups the transaction records by `lifecycleStatus`, with reference, amount, plan, and channel on cards.
3. These generated board widgets are read-only in this blueprint; edits and drag moves are not part of the product brief.
