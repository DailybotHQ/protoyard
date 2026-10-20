# AGENTS.md — IoT Monitoring template (`iot-monitoring`)

The entry point for agents working on this template. Repository-wide rules
live in the root [AGENTS.md](../../AGENTS.md); the spec standard is
[docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations, schema versions
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, screens and their states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, rules, personas

## Rules for this prototype

Device locations use only the fictional `harbor-bay` region. Telemetry and
incident transitions use the simulated clock; never add real device ids,
sensor feeds, addresses or external map data. Keep map and chart UI imports
lazy so unused kit code does not enter the initial chunk.

## Quick commands

The generated commands below apply to a prototype created from this template.
For this template workspace itself, use:

```bash
pnpm protoyard new my-monitoring --template iot-monitoring
pnpm protoyard dev my-monitoring
pnpm vitest run templates/iot-monitoring
pnpm protoyard validate iot-monitoring --strict-spec --build
```

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev iot-monitoring                  # run it (DevTools included)
pnpm vitest run prototypes/iot-monitoring          # unit + integration tests
pnpm protoyard validate iot-monitoring --build     # contract, schema, build
pnpm protoyard spec iot-monitoring --check         # generated spec regions are current
pnpm protoyard export iot-monitoring               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
