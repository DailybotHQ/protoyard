# AGENTS.md — Product Analytics (`analytics`)

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

- **Tracked events are read-only.** `users` and `events` come only from scenarios (the generator) and the timeline. No service writes them; screens only read and aggregate.
- **Aggregation lives in `src/domain/metrics.ts`,** pure and tested. Screens call it inside `liveQuery(…, { deps })`, with the range, event type and filter in `deps`. Charts never reach into the database.
- **Range scans use the indexes:** `[type+at]` for one event type, `at` for every type. ISO instants sort by time.
- **Segment ownership:** members rename and delete only their own segments (`segments:manage-own`, checked against the stored row inside the transaction); owners and admins hold `segments:manage-all`.
- **Every chart and view is lazy.** Routes are lazy, and each Overview widget is its own chunk (`WIDGET_LOADERS`). Keep new charts out of `App.svelte`.
- **Determinism:** the generator uses only `ctx.rng` forks, `ctx.ids`, `ctx.time` and the scenario reference time. Bump `ANALYTICS_TEMPLATE_GENERATOR_VERSION` when the same seed could produce a different world.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev analytics                  # run it (DevTools included)
pnpm vitest run prototypes/analytics          # unit + integration tests
pnpm protoyard validate analytics --build     # contract, schema, build
pnpm protoyard spec analytics --check         # generated spec regions are current
pnpm protoyard export analytics               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
