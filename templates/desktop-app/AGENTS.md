# AGENTS.md — Desktop App (`desktop-app`)

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

TODO: only what is specific to this prototype (units, invariants, ownership rules). Do not copy the root rules.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev desktop-app                  # run it (DevTools included)
pnpm vitest run prototypes/desktop-app          # unit + integration tests
pnpm protoyard validate desktop-app --build     # contract, schema, build
pnpm protoyard spec desktop-app --check         # generated spec regions are current
pnpm protoyard export desktop-app               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
