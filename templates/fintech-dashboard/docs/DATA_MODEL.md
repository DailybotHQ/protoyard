# Data model

- `accounts` stores the opening and current balances in integer cents.
- `transactions` stores positive integer-cent amounts with income, expense or
  paired transfer direction. Account references are indexed for ledger reads.
- `balanceSnapshots` stores the deterministic daily balance series; a transfer
  updates the simulated current-day row.
- `budgets` stores monthly category limits and alert thresholds.

For each account, opening balance plus income and incoming transfers minus
expenses and outgoing transfers equals the current balance. Generated checking
snapshots reconcile to that same ledger at every day boundary. All domain rows
are local IndexedDB simulation data.
