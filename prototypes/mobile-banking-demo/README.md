# Lumen Bank (fictional) — mobile banking demo

A mobile-first banking app for a fictional household: accounts, a real transaction ledger,
payees and atomic transfers, all persisted in the browser. Money is integer cents, every balance
equals the sum of its posted transactions, and a failed transfer writes nothing.

> **Demo only.** Lumen Bank, its people, merchants and institutions are invented. There is no
> real money, no real bank and no network. Never enter real account numbers or personal details.

```bash
pnpm protoyard dev mobile-banking-demo     # run it (open DevTools from the floating button)
pnpm protoyard build mobile-banking-demo   # static build → artifacts/mobile-banking-demo/dist
pnpm vitest run prototypes/mobile-banking-demo
pnpm --filter @prototype/mobile-banking-demo typecheck
```

Start with the default `active-customer` scenario, then switch scenarios and personas
(Alex = owner, Jordan = joint holder, Sam = viewer) in DevTools, and advance time to see
payroll, rent, auto-save and card purchases land.

## Documentation

- [AGENTS.md](AGENTS.md): rules for agents, tests and quick commands
- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, scenarios, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, relations, field notes, schema history
- [docs/FLOWS.md](docs/FLOWS.md): transfers, payees, account status, deposits and the timeline
- [docs/SCREENS.md](docs/SCREENS.md): every hash route, its states, and the phone shell
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, the member cap, personas
