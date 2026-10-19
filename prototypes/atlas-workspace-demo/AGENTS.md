# AGENTS.md — Atlas Workspace Demo (`atlas-workspace-demo`)

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

Order values are integer cents, generated dates use the fixed scenario clock, and all record changes go through `src/domain/services.ts` so permission checks and audit writes remain atomic. Persona access is simulated and must never be described as security.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev atlas-workspace-demo                  # run it (DevTools included)
pnpm vitest run prototypes/atlas-workspace-demo          # unit + integration tests
pnpm protoyard validate atlas-workspace-demo --build     # contract, schema, build
pnpm protoyard spec atlas-workspace-demo --check         # generated spec regions are current
pnpm protoyard export atlas-workspace-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
