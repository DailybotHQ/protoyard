# Canvas Board Demo: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/boards.ts` should appear in at least one flow.

## Create a board

1. On Boards, the owner types a title and presses "New board".
2. Service: `boards.create({ title })` in src/domain/boards.ts
3. Capability: `boards:create`
4. Writes: `boards` (a blank canvas titled like the board)
5. Failure states: empty or long title, permission denied, simulated offline (nothing written)

## Edit a board

1. On a board, the owner moves, adds, edits or deletes shapes and connectors.
2. Service: `boards.saveCanvas(id, canvas)` after every change
3. Capability: `boards:update`
4. Writes: `boards.canvas`, `boards.updatedAt`
5. Failure states: invalid canvas, permission denied, simulated offline; the
   view puts the stored board back

## Import a canvas

1. On a board, the owner picks a JSON file with "Import JSON".
2. Service: `boards.saveCanvas(id, canvas)`, after the view checks the file with `loadUntrustedCanvas`
3. Capability: `boards:update`
4. Writes: `boards.canvas`, `boards.updatedAt`
5. Failure states: a file that is not a valid canvas (nothing written, the reason shown), permission denied, simulated offline

## Delete a board

1. On a board, the owner presses "Delete board" and confirms.
2. Service: `boards.remove(id)`
3. Capability: `boards:delete`
4. Writes: removes the `boards` row
5. Failure states: permission denied, simulated offline (nothing written)
