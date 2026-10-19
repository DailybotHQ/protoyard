# Fintech Dashboard

A finance starter with checking and savings accounts, a categorized ledger,
payday-shaped balance history, monthly budget alerts and a real transfer flow.
Amounts stay in integer cents; charts are loaded only when the overview screen
opens. Every role and balance is a local simulation, not a bank connection.

```bash
pnpm protoyard new my-finance --template fintech-dashboard
pnpm protoyard dev my-finance
```

| Scenario | What it shows |
| --- | --- |
| `active` *(default)* | Three months of generated payroll, spending, balances and budgets. |
| `empty` | New accounts with no activity and budget categories ready to configure. |
| `viewer` | The same generated ledger with transfer controls hidden and blocked. |
| `network-offline` | Read-only account history while transfers fail through the simulated environment. |

Transfer amounts are parsed as integer cents, checked against the source balance,
and written as paired ledger rows in one Dexie transaction. The account records
and latest simulated-day snapshots update atomically. No network requests or
financial provider integrations are used.

## Checks

```bash
pnpm vitest run templates/fintech-dashboard
pnpm --filter @protoyard-template/fintech-dashboard typecheck
pnpm protoyard validate fintech-dashboard --strict-spec --build
pnpm protoyard budget fintech-dashboard
```

The initial JavaScript budget is 250 KB gzip. Cartesian chart code is imported
as a lazy chunk and stays out of the app's boot chunk.
