# Lumen Bank (fictional) — mobile banking demo

A mobile-first banking app for a fictional household: accounts, a real transaction ledger,
payees and atomic transfers, all persisted in the browser.

> **Demo only.** Lumen Bank, its people, merchants and institutions are invented. There is no
> real money, no real bank and no network. Never enter real account numbers or personal details.

```bash
pnpm protoyard dev mobile-banking-demo     # run it (open DevTools from the floating button)
pnpm protoyard build mobile-banking-demo   # static build → artifacts/mobile-banking-demo/dist
pnpm vitest run prototypes/mobile-banking-demo
pnpm --filter @prototype/mobile-banking-demo typecheck
```

## Screens (hash routes)

| Route | What it does |
| --- | --- |
| `#/` Home | Greeting, total balance (net of card balances), swipeable account cards with locked/dormant/low-balance badges, quick actions, recent activity with pending rows, spending by category for the last 30 **simulated** days |
| `#/accounts/:id` | Balance, pending total, limits; transactions with search, category filter and month grouping; **Freeze / Unfreeze / Reactivate** (primary holder only, confirmed in an alert dialog) |
| `#/activity` | Every transaction with account, category and in/out filters; pages of 30 that load as you scroll |
| `#/transfer` | From → To (own account or payee) → Amount → Review → Receipt with reference id. Deep links: `#/transfer?from=acct_checking&to=payee_0001` |
| `#/payees` | List, add (validated, last 4 digits only, demo warning), remove with confirmation; send money from a payee. Read-only for non-owners |
| `#/profile` | Persona, role, household members, light/dark/system preference (saved per persona), demo notice |

Every number comes from the database: balances update instantly through `liveQuery` and survive
reloads.

## Domain

- **Schema** (`src/database/schema.ts`): `accounts`, `transactions`, `beneficiaries`,
  `transfers`. Money is integer cents. Invariant: `balance == sum(posted transactions)`.
- **Services** (`src/domain/services.ts`): `transfer` runs in ONE Dexie transaction that writes
  the transfer, the debit/credit rows and both balances, so a failure writes nothing.
  `addBeneficiary`, `removeBeneficiary` and `setAccountStatus` all go through
  `session.assert` and `environment.run`.
- **Simulations** (`src/lib/simulations.ts`): `simulatePayroll` credits a fictional payroll
  deposit, with the same ledger, permission and environment rules. It's how a brand-new
  account gets its first money.
- **Policy** (`src/domain/policy.ts`): owner = everything; joint holder (member) = transfers
  up to $500; dependent (viewer) = read only. The UI hides or explains what a role can't do,
  and the services enforce it.

Every failure is explained in plain words (`src/lib/errors.ts`): insufficient funds, locked or
dormant accounts, over-limit, the member cap, view-only access, and simulated offline/server
errors. Each is shown inline in the review step plus a toast, along with "No money moved".

## Time travel

Advancing time from DevTools commits what the household would see (`src/domain/timeline.ts`):
payroll on the 1st and 15th, rent on the 3rd, a $400 auto-save to savings on the 5th, and
1–3 card purchases a day.

- **Events** depend only on the scenario, the day and stable account ids, never on balances
  or the window. Advancing 7 days at once and 1 day seven times commit identical events with
  ids like `evt:<scenario>:<day>:<n>`. Re-running a window applies nothing.
- **`applyBankEvent`** decides what happens to each event, inside one transaction. Locked or
  dormant accounts don't move, and a debit never overdraws checking or savings (cards are
  capped at their credit line). Multi-leg events such as the auto-save land completely or
  not at all. Skipped events are still stored, with `payload.outcome = { status: 'skipped',
  reason }`, so DevTools shows why.
- After any advance, each balance still equals the sum of its posted rows.
- Previewing time (without committing) still changes nothing.

## Scenarios

| Scenario | Try this |
| --- | --- |
| `active-customer` (default) | Six months of history; transfer between accounts and to payees |
| `new-account` | Empty states; **Simulate payroll deposit** writes the first ledger row |
| `low-balance` | Send $500 to a payee → *Not enough money*, balances untouched |
| `locked-account` | Transfers blocked; unfreeze from the account page as the owner |
| `dormant-account` | Stale history; reactivate an account |
| `dependent-view` | Sam (view only): all money-moving UI is disabled with an explanation |
| `offline-mode` | Offline banner; transfers fail clearly and write nothing |

Switch persona in DevTools (Alex = owner, Jordan = joint holder, Sam = viewer) to compare
permissions on the same data.

## Tests

- `tests/services.test.ts` and `tests/generators.test.ts`: ledger, atomicity, roles, offline and
  deterministic generation.
- `tests/ui-logic.test.ts`: read models (spending, month groups, filters, amount parsing),
  error descriptions, and payroll simulation on the real runtime.
- `tests/timeline.test.ts`: 7×1 = 1×7 days, replays apply nothing, payroll/rent/auto-save
  land on their days, locked accounts never move, no overdrafts, all-or-nothing multi-leg
  events.
- `tests/transfer-flow.test.ts`: component flow with `@testing-library/svelte` on the real
  runtime, covering the happy path with receipt and balanced ledger, inline insufficient
  funds, the member cap, and the viewer explanation.
