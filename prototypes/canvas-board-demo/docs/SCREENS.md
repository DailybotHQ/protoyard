# Canvas Board Demo: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

## Screens

- **Boards** (`/`, `src/screens/BoardsList.svelte`): the boards, most
  recently updated first, with their shape counts, and a create form for
  roles that can create. Empty state when there are no boards.
- **Board** (`/boards/:id`, `src/screens/BoardScreen.svelte`, lazy): one
  board in `CanvasView`, with "Download SVG", "Import JSON" and
  "Delete board". Loading while the route and the canvas load; "Board not found"
  for a deleted board; an alert when the stored canvas is invalid; read-only
  for a viewer.

## Shell

Responsive, no device shell: designed for a desktop viewport, where the
canvas has room; on a phone the canvas still pans, zooms and edits.
