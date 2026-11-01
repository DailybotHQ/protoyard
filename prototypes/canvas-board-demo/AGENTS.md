# AGENTS.md — Canvas Board Demo (`canvas-board-demo`)

The entry point for agents working on this prototype. Repository-wide rules
live in the root [AGENTS.md](../../AGENTS.md); the spec standard is
[docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations, schema versions
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, screens and their states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, rules, personas

## Rules for this prototype

- A board's `canvas` is untrusted on import and on read: services validate it
  with `validateCanvas`, and `CanvasView` checks it again before painting.
- Use `put` of the whole row for board writes: Dexie's `update()` key paths
  recurse on the canvas type and fail the typecheck.
- Board content comes from `generateCanvasBoard` in `@protoyard/views/scenarios`;
  bump `generatorVersion` when its output changes.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev canvas-board-demo                  # run it (DevTools included)
pnpm vitest run prototypes/canvas-board-demo          # unit + integration tests
pnpm protoyard validate canvas-board-demo --build     # contract, schema, build
pnpm protoyard spec canvas-board-demo --check         # generated spec regions are current
pnpm protoyard export canvas-board-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
