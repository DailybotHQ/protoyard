# AGENTS.md — Keel Projects (`keel-projects-demo`)

The entry point for agents working on this prototype (created from `templates/project-management`). Repository-wide rules live in the root [AGENTS.md](../../AGENTS.md); the spec standard is [docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): product, users, capabilities and honest boundaries
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations and schema versions
- [docs/FLOWS.md](docs/FLOWS.md): service-backed user flows
- [docs/SCREENS.md](docs/SCREENS.md): routes and screen states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): simulated roles and capabilities

## Invariants

- Screens read with `liveQuery`; every write goes through `src/domain/services.ts` (`session.assert` → zod → `environment.run` → one Dexie transaction).
- Scenarios are deterministic for a seed and reference time; bump `TASKS_GENERATOR_VERSION` when generator output changes.
- Finish-to-start links (`dependencies`) always hold: `tasks.reschedule` refuses a change set that would break one, and the timeline sends a moved task with its shifted successors.
- Rituals are stored in the calendar engine's series shape; `rituals.apply` writes what the calendar sends ("this", "following", "all").
- Mentions are stored as `@{persona-id}`; `comments.add` notifies each mentioned teammate.
- Every route is a lazy chunk; keep the initial JS under 210 KB gzip (measured 173 KB).
- Personas and permission roles are simulated UX; they are not authentication or security.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev keel-projects-demo                  # run it (DevTools included)
pnpm vitest run prototypes/keel-projects-demo          # unit + integration tests
pnpm protoyard validate keel-projects-demo --build     # contract, schema, build
pnpm protoyard spec keel-projects-demo --check         # generated spec regions are current
pnpm protoyard export keel-projects-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
