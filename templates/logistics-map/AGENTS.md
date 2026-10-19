# AGENTS.md — Logistics Map (`logistics-map`)

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

Locations are generated only in the fictional `harbor-bay` ocean region. ETA
values are derived from the simulated clock and route distance; never add real
addresses, GPS or external map data to this template.

## Quick commands

The generated commands below apply to a prototype created from this template.
For this template workspace itself, use:

```bash
pnpm protoyard new my-dispatch --template logistics-map
pnpm protoyard dev my-dispatch
pnpm vitest run templates/logistics-map
pnpm protoyard validate logistics-map --strict-spec --build
```

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev logistics-map                  # run it (DevTools included)
pnpm vitest run prototypes/logistics-map          # unit + integration tests
pnpm protoyard validate logistics-map --build     # contract, schema, build
pnpm protoyard spec logistics-map --check         # generated spec regions are current
pnpm protoyard export logistics-map               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
