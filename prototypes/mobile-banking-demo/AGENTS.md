# AGENTS.md — Lumen Bank (fictional) (`mobile-banking-demo`)

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

- Money is integer cents everywhere (`balanceCents`, `amountCents`,
  `dailyLimitCents`). The transfer form takes dollars; only
  `services.transfer` converts them (`Math.round(amount * 100)`).
- Ledger invariant: `accounts.balanceCents` equals the sum of the account's
  posted `transactions`. Any code that changes a balance writes the matching
  ledger row in the same transaction (see `services.transfer`,
  `simulatePayroll` in `src/lib/simulations.ts`, `applyBankEvent`), and
  tests check `ledgerIsBalanced`.
- Only `active` accounts move money. Locked and dormant accounts block
  transfers, deposits and timeline postings; checking and savings never go
  below 0.
- Roles: `owner` does everything; `member` sends up to 50,000 cents per
  transfer (the `transfers:create` rule); `viewer` is read only. Payee and
  account-status changes are owner only.
- Timeline events depend only on the scenario, the day and the stable account
  ids (`acct_checking`, `acct_savings`, `acct_credit`); never on balances or
  the window. Keep those ids stable.
- Payees store a fictional institution and the last 4 digits only. Never add
  fields for full account, routing or card numbers.

## Tests

- `tests/services.test.ts`, `tests/generators.test.ts`: ledger, atomicity,
  roles, offline, deterministic generation.
- `tests/ui-logic.test.ts`: read models (spending, month groups, filters,
  amount parsing), error descriptions, payroll simulation on the real runtime.
- `tests/timeline.test.ts`: 7×1 = 1×7 days, replays apply nothing, payroll,
  rent and auto-save land on their days, locked accounts never move, no
  overdrafts, all-or-nothing multi-leg events.
- `tests/transfer-flow.test.ts`: the transfer screen with
  `@testing-library/svelte` on the real runtime (receipt and balanced ledger,
  inline insufficient funds, the member cap, the viewer explanation).

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev mobile-banking-demo                  # run it (DevTools included)
pnpm vitest run prototypes/mobile-banking-demo          # unit + integration tests
pnpm protoyard validate mobile-banking-demo --build     # contract, schema, build
pnpm protoyard spec mobile-banking-demo --check         # generated spec regions are current
pnpm protoyard export mobile-banking-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
