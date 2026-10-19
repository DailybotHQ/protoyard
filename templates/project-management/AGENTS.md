# AGENTS.md — Project Management (`project-management`)

The entry point for agents working on this template. Repository-wide rules live in the root [AGENTS.md](../../AGENTS.md); the spec standard is [docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): product, users, capabilities and honest boundaries
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations and schema versions
- [docs/FLOWS.md](docs/FLOWS.md): service-backed user flows
- [docs/SCREENS.md](docs/SCREENS.md): routes and screen states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): simulated roles and capabilities

## Template invariants

- Screens read with `liveQuery`; every write goes through `src/domain/services.ts`.
- Seeded projects, sprints and task dates are deterministic for a scenario seed and reference time.
- Board order and status, timeline dates and workload assignments are committed through services.
- Personas and permission roles are simulated UX; they are not authentication or security.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev project-management                  # run it (DevTools included)
pnpm vitest run prototypes/project-management          # unit + integration tests
pnpm protoyard validate project-management --build     # contract, schema, build
pnpm protoyard spec project-management --check         # generated spec regions are current
pnpm protoyard export project-management               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
