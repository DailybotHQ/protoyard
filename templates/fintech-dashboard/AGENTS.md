# AGENTS.md — Fintech Dashboard (`fintech-dashboard`)

Repository rules live in the root [AGENTS.md](../../AGENTS.md). This template
uses the per-prototype spec harness in [docs/SPECS.md](../../docs/SPECS.md).

## Index

- [README.md](README.md): capabilities, scenarios and validation commands
- [docs/SPEC.md](docs/SPEC.md): users, boundaries and manifest facts
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): accounts, transactions and balances
- [docs/FLOWS.md](docs/FLOWS.md): transfers, budget alerts and cash flow
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): simulated role capabilities
- [docs/SCREENS.md](docs/SCREENS.md): overview and responsive layouts

## Template-specific rules

- Store money in integer cents. Do not describe this simulation as a bank or as financial advice.
- Account, transaction and snapshot writes belong in `src/domain/services.ts`; transfer writes update both accounts and paired ledger rows atomically.
- Generators use `timeSeries()` and deterministic context only. Every account balance must reconcile with its opening balance and signed transactions.
- Keep `@protoyard/charts-ui/cartesian` behind the screen's dynamic import; do not add chart components to the `@protoyard/ui` barrel.
- Personas and permissions are UI simulation, not authentication or account security.

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev fintech-dashboard                  # run it (DevTools included)
pnpm vitest run prototypes/fintech-dashboard          # unit + integration tests
pnpm protoyard validate fintech-dashboard --build     # contract, schema, build
pnpm protoyard spec fintech-dashboard --check         # generated spec regions are current
pnpm protoyard export fintech-dashboard               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
