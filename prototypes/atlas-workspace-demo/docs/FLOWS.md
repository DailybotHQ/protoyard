# Atlas Workspace Demo: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

## Update an order

1. From the overview or Orders route, an owner, admin or member chooses an order action.
2. The UI calls `services.orders.setStatus(id, status)` in `src/domain/services.ts`.
3. The service asserts `orders:update`, validates the transition, and runs through the simulated environment.
4. One Dexie transaction updates the order and appends its audit event.
5. Invalid transitions, denied roles, missing rows and simulated offline failures leave the transaction unchanged and surface a message.

## Edit workspace settings

1. An owner or admin opens Settings and changes the workspace name, support address, currency or report preference.
2. The UI submits `services.settings.update(input)`.
3. The service checks the simulated settings capability, validates fields and updates the settings row in an environment transaction.
4. Viewers and members see a read-only explanation; bypassing the UI still fails the service assertion.
