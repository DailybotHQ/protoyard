# Fintech Dashboard: spec

## Problem

Households need a quick way to review accounts, understand cash flow and stay
within category budgets. Fintech Dashboard models that experience in a local
browser without connecting to a financial institution.

## Users

- **Owners** review finances and create transfers.
- **Members** review the shared ledger and move money between demo accounts.
- **Viewers** inspect balances, activity and budgets without transfer controls.

See [PERMISSIONS.md](PERMISSIONS.md) for the simulated capability matrix.

## Capabilities

- View checking and savings balances with daily payday-shaped history.
- Review transactions grouped by income, expense and category.
- Compare monthly income and spending in a lazy chart.
- Track monthly budget categories and threshold alerts.
- Transfer funds with service validation, insufficient-funds and offline states.

See [FLOWS.md](FLOWS.md) and [SCREENS.md](SCREENS.md) for behavior and routes.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Everyday finances | Household | normal | 4226 | `{"fintech":{"historyDays":90}}` | A household tracks payday cash flow, categorized spending and monthly budgets. |
| `empty` | New financial workspace | Lifecycle | empty | 91 | `{"fintech":{"historyDays":0}}` | A new workspace with empty accounts and monthly budget categories. |
| `network-offline` | Transfer while offline | Conditions | normal | 4226 | `{"fintech":{"historyDays":90}}` | Accounts and history remain readable while simulated transfers are unavailable. |
| `viewer` | Accountant read-only review | Roles | normal | 4226 | `{"fintech":{"historyDays":90}}` | The owner account is visible to an accountant persona without transfer controls. |
<!-- /protoyard:generated:scenarios -->

## Non-goals

- Connecting to banks, payment networks, credit bureaus or investment providers.
- Financial advice, regulated account statements or real authentication.
- Sending any account or transaction data over the network.

## Honest boundaries

All records are fictional local IndexedDB rows. Personas and permissions are
simulated UI behavior, and the offline state is a local environment setting.
No financial provider, bank account or real personal data is involved.

## Rebuild as a real app

Use a secured financial data provider and server-side account authorization,
ledger validation and idempotency. Reconcile transfers on the server and add
provider-specific consent, audit, retention, privacy and compliance workflows.
Keep the generated world only as synthetic development fixtures.

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.fintech-dashboard` |
| slug | `fintech-dashboard` |
| name | Fintech Dashboard |
| version | 0.1.0 |
| platform | responsive |
| category | finance |
| default scenario | `active` |
| default theme | `violet` |
| storage namespace | `template-fintech-dashboard` |
| schema version | 1 |
| generator version | 2 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
