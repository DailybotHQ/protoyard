# Canvas Board Demo: spec

## Problem

A small team plans a launch on a whiteboard, but a whiteboard forgets: it
cannot be saved, exported or opened again tomorrow. This prototype shows
planning boards on an infinite canvas (frames, sticky notes, shapes and
connectors) that save after every change and survive a reload.

## Users

- **Owner** (`owner`): creates, edits and deletes boards.
- **Viewer** (`viewer`): opens boards and downloads them, but cannot change
  them. Roles are in [PERMISSIONS.md](PERMISSIONS.md).

## Capabilities

- Create a board ([Create a board](FLOWS.md#create-a-board)).
- Draw and edit on the canvas; every change saves ([Edit a board](FLOWS.md#edit-a-board)).
- Replace a board with an imported canvas JSON file ([Import a canvas](FLOWS.md#import-a-canvas)).
- Download a board as SVG (no service: nothing is written).
- Delete a board ([Delete a board](FLOWS.md#delete-a-board)).

## Non-goals

- No real-time collaboration or presence: one person edits a board at a time.
- No image uploads: the generator never emits image shapes.
- No export besides SVG (and the canvas JSON that is stored).

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Active owner | Lifecycle | normal | 202 | `{"boardLevel":"typical","boards":3}` | Three weeks in: three planning boards of frames, sticky notes and connectors. |
| `awkward` | Awkward shapes | Edge cases | normal | 404 | `{"boardLevel":"edge","boards":1}` | Nested frames, a rotated and a locked note, a long note, and connectors to a free point and between frames. |
| `crowded` | Crowded board | Scale | dense | 303 | `{"boardLevel":"dense","boards":2}` | The first board holds 1,500 sticky notes: pan, zoom, the minimap and the shape list. |
| `empty` | Brand-new workspace | Lifecycle | empty | 101 | `{"boards":0}` | The owner just signed up: no boards yet. Shows the empty state. |
| `viewer` | Read-only viewer | Roles | normal | 202 | `{"boardLevel":"typical","boards":3}` | Same world as “Active owner”, seen by a viewer who can look but not edit. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

Every board lives in the visitor's browser (IndexedDB). Personas replace
sign-in, and roles are simulated permissions (UX, not security). Offline,
latency and failures come from the simulated environment, and time is the
scenario's reference time. See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

- **Schema:** a `boards` table with the canvas as a JSON document, or one row
  per shape for large boards and partial saves.
- **Services:** an API that validates the canvas server-side with the same
  rules (`validateCanvas`) and saves deltas rather than the whole canvas.
- **Collaboration:** Texuli's `@texuli/canvas/sync` operations over a real
  transport, which this prototype does not use.
- **Policy and personas:** real accounts, with board sharing per person.
- **Environment failures:** real network errors, with the same "put the stored
  board back" behavior.
- **Scenarios:** fixtures for tests and demos, from the same generator.
- **Screens:** unchanged; `CanvasView` already handles save failures.
See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.canvas-board-demo` |
| slug | `canvas-board-demo` |
| name | Canvas Board |
| version | 0.1.0 |
| platform | responsive |
| category | productivity |
| default scenario | `active` |
| default theme | `violet` |
| storage namespace | `canvas-board-demo` |
| schema version | 1 |
| generator version | 2 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
