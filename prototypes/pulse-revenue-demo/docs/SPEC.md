# Pulse Revenue: spec

## Problem

Finance and growth teams need a quick way to see revenue movement, plan mix, and lifecycle changes across a recent quarter. Pulse Revenue presents a fictional, deterministic transaction history in generated dashboard, analytics, and board screens, without connecting to a billing system or ingesting network data.

The `crud-app` template you started from: Blueprint-driven starter: projects and tasks with AppShell navigation, EntityList/EntityForm, notifications bell, members and a command palette. Base template for `protoyard generate`.

## Users

Owners and administrators review the workspace and export analytics. Analysts can inspect and export transaction data. Read-only viewers can inspect trends without changing records or exporting them. These simulated personas are documented in [PERMISSIONS.md](PERMISSIONS.md).

## Capabilities

 - Review revenue KPIs and trends on the generated dashboard.
 - Change the time period, measure, and dimension in the generated analytics explorer.
 - Export the selected analytics data as CSV when the persona has export permission.
 - Compare transactions by lifecycle stage on the generated board.
See [FLOWS.md](FLOWS.md) for the interaction details.

## Non-goals

This prototype does not connect to payment providers, ingest live events, calculate contractual recurring revenue, or provide real authentication or authorization. All records are fictional and stored in browser-local simulated infrastructure.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `empty` | No transactions yet | Lifecycle | empty | 129001 | — | A new Pulse Revenue workspace before its first recorded transaction. |
| `launch-spike` | Launch spike | Data | dense | 129003 | `{"series":{"historyDays":45,"seasonality":"weekly","spikes":[{"daysAgo":3,"decayDays":4,"factor":5}]}}` | A recent product launch creates a visible surge in transactions and revenue. |
| `quarter-of-history` | Quarter of history | Data | normal | 129002 | `{"series":{"historyDays":90,"seasonality":"weekly"}}` | Ninety days of rising fictional revenue with a weekly business rhythm. |
| `viewer` | Read-only viewer | Data | normal | 129002 | `{"series":{"historyDays":90,"seasonality":"weekly"}}` | The quarter of revenue history viewed without export or record editing. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

Data is fictional and stored in the visitor's browser. Personas and permissions simulate UX and are not security. Payments, network ingestion, and billing integrations are not implemented. Scenario time is fixed for reproducibility. See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

For a production application, replace the local transaction schema and generated service layer with a backend-owned billing ledger and validated API. Replace scenario personas with an identity provider and server-side authorization. Connect real event ingestion, currency handling, and retention rules only after defining their ownership and audit requirements. Keep the generated screens as a prototype reference. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.pulse-revenue-demo` |
| slug | `pulse-revenue-demo` |
| name | Pulse Revenue |
| version | 0.1.0 |
| platform | responsive |
| category | analytics |
| default scenario | `quarter-of-history` |
| default theme | `pulse-revenue` |
| storage namespace | `pulse-revenue-demo` |
| schema version | 1 |
| generator version | 49867619 |
| timeline | no |
| themes | Pulse Revenue (`pulse-revenue`) |
<!-- /protoyard:generated:manifest -->
