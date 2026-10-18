# Lumen Bank (fictional): spec

## Problem

A household shares a few bank accounts and needs to see where its money is and
move it safely from a phone. Lumen Bank (fictional) shows how a mobile banking
app behaves when the ledger is real: balances come from posted transactions,
transfers are atomic, and every failure (not enough money, a frozen account,
no connection, not allowed) is explained without moving any money.

## Users

The Rivera household (fictional), mapped to the roles in
[PERMISSIONS.md](PERMISSIONS.md):

| Person | Role | Label in the app | What they do |
| --- | --- | --- | --- |
| Alex Rivera | `owner` | Primary holder | Everything: transfers, payees, freezing and reactivating accounts |
| Jordan Rivera | `member` | Joint holder | Views everything; sends transfers up to $500 each; simulated payroll deposits |
| Sam Rivera | `viewer` | View only (dependent) | Sees balances and history; cannot move money or change anything |

## Capabilities

- See the total balance, account cards, recent activity and 30-day spending ([view balances and activity](FLOWS.md#view-balances-and-activity-read-only)).
- Move money between own accounts ([flow](FLOWS.md#send-money-between-own-accounts)).
- Send money to a saved payee ([flow](FLOWS.md#send-money-to-a-payee)).
- Add a payee with a fictional bank and the last 4 digits only ([flow](FLOWS.md#add-a-payee)).
- Remove a payee ([flow](FLOWS.md#remove-a-payee)).
- Freeze, unfreeze or reactivate an account ([flow](FLOWS.md#freeze-unfreeze-or-reactivate-an-account)).
- Give a brand-new account its first money with a simulated payroll deposit ([flow](FLOWS.md#simulated-payroll-deposit)).
- Choose light, dark or system appearance per persona ([flow](FLOWS.md#change-the-color-mode)).
- Watch payroll, rent, auto-save and card purchases land as simulated time passes ([timeline](FLOWS.md#time-passes-timeline)).

## Non-goals

- No real banking: no real bank, accounts, routing or card numbers, and no
  real money movement. Payees store a fictional institution name and the last
  4 digits only.
- No sign in, onboarding, KYC or account opening; new accounts appear only
  through scenarios.
- No card management, bill pay, statements, disputes, interest or fees.
- No transfer scheduling, cancellation or reversal; a transfer is final and
  `failed` transfers are never stored (a failure writes nothing).
- No multi-currency: every account is `USD`.
- No notifications or messages.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active-customer` | Active customer, 6 months | Lifecycle | normal | 2026 | `{"bank":{"months":6,"openingCents":420000}}` | Paycheck, rent, groceries and transfers over six months. Checking, savings and a credit card with realistic history. |
| `dependent-view` | Dependent with view-only access | Roles | normal | 2026 | `{"bank":{"months":6,"openingCents":420000}}` | Sam, a teenager on the household plan, can see balances but cannot move money. |
| `dormant-account` | Dormant account | Lifecycle | normal | 2026 | `{"bank":{"months":8,"openingCents":380000,"status":"dormant"}}` | No activity for four months; accounts flagged dormant until reactivated. |
| `locked-account` | Locked after suspicious activity | Conditions | normal | 2026 | `{"bank":{"months":6,"openingCents":420000,"status":"locked"}}` | Accounts are locked (simulated fraud hold): balances visible, transfers blocked. |
| `low-balance` | Insufficient balance | Conditions | normal | 2026 | `{"bank":{"lowBalance":true,"months":6,"openingCents":420000}}` | Checking is almost empty — try a transfer to see the insufficient-funds path. |
| `new-account` | Brand-new account | Lifecycle | empty | 7 | `{"bank":{"months":0,"openingCents":0}}` | Account opened today: zero balance, no transactions, no saved recipients. |
| `offline-mode` | Offline | Conditions | normal | 2026 | `{"bank":{"months":6,"openingCents":420000}}` | The phone lost its connection: reads work from the device, transfers fail clearly. |
<!-- /protoyard:generated:scenarios -->

What to try in each one (switch persona in DevTools: Alex = owner, Jordan =
joint holder, Sam = viewer, to compare permissions on the same data):

| Scenario | Try this |
| --- | --- |
| `active-customer` (default) | Six months of history; transfer between accounts and to payees |
| `new-account` | Empty states; **Simulate payroll deposit** writes the first ledger row |
| `low-balance` | Send $500 to a payee → *Not enough money*, balances untouched |
| `locked-account` | Transfers blocked; unfreeze from the account page as the owner |
| `dormant-account` | Stale history; reactivate an account |
| `dependent-view` | Sam (view only): all money-moving UI is disabled with an explanation |
| `offline-mode` | Offline banner; transfers fail clearly and write nothing |

## Honest boundaries

Everything here is a simulation (see
[docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries)):

| Concern | In this prototype |
| --- | --- |
| Data | IndexedDB in the visitor's browser (namespace `mobile-banking-demo`). Nothing is shared between visitors or devices, and nothing is backed up. |
| Identity | Three personas you switch between in DevTools. There is no authentication and no account security. |
| Permissions | Capabilities checked in services with `session.assert`. They shape the UX only and are not security: anyone with the browser can change the data. |
| Money | Integer-cent balances and ledger rows in fictional `USD` accounts. No money moves, nobody is charged, and there is no payment network. |
| Network | Simulated latency, failures and offline mode through `environment.run`; the `offline-mode` scenario makes every mutation fail and write nothing. No request leaves the browser. |
| Time | A simulation clock (reference time `2026-10-16T10:00:00-05:00`) and a timeline that posts payroll, rent, auto-save and card purchases when time is advanced. There are no real schedules or background jobs. |
| Fraud and dormancy | `locked` and `dormant` are scenario-set statuses. There is no fraud detection and no inactivity tracking. |

## Rebuild as a real app

How each piece maps to a production design (see
[docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app)). No vendor or
provider has been chosen.

| Prototype piece | Real counterpart to design |
| --- | --- |
| `src/database/schema.ts` (`accounts`, `transactions`, `beneficiaries`, `transfers`) | Server database schema. Ids, indexes and integer-cent money carry over. |
| Balance stored on `accounts` plus `ledgerIsBalanced` | A server-side double-entry ledger with immutable entries, balances derived or reconciled from it, and integrity checks. The prototype only keeps a single-entry invariant (`balance == sum(posted rows)`) in one browser. |
| `services.transfer` in one Dexie transaction | A transfer endpoint with the same input, checks and all-or-nothing boundary, plus idempotency keys, concurrency control on balances, and settlement with external payment rails for payees. |
| Per-transfer `dailyLimitCents` and the $500 member cap | Real limits and risk rules on the server (the prototype's "daily" limit is checked per transfer, not per day). |
| `beneficiaries` (last 4 digits) | Payee onboarding with verified account details stored and masked securely, which the prototype never holds. |
| `setAccountStatus`, `locked` and `dormant` | Fraud holds, dormancy rules and compliance workflows run by the bank. |
| `simulatePayroll` and the timeline | Real incoming payments, scheduled transfers and card authorisations from external systems. |
| `policy.roles` and `rules` | Server-side authorization enforced on every request, including reads. |
| Personas | A real identity provider, session management, strong customer authentication and KYC, all to be designed. |
| `environment.run` failure modes | The offline, timeout and server-error states the real UI must still handle. |
| Scenarios and generators | Seed data for staging, demo accounts and test fixtures. |
| Screens and flows | The UI to keep. The states in [SCREENS.md](SCREENS.md) are the acceptance list. |

Regulatory, audit and security requirements of a real bank are things to
design; none of them is implemented here.

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `example.mobile-banking` |
| slug | `mobile-banking-demo` |
| name | Lumen Bank (fictional) |
| version | 0.1.0 |
| platform | mobile |
| category | fintech |
| default scenario | `active-customer` |
| default theme | `emerald` |
| storage namespace | `mobile-banking-demo` |
| schema version | 1 |
| generator version | 1 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
