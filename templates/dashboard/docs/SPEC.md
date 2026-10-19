# SaaS Dashboard: spec

## Problem

TODO: the product problem in two or three sentences.

The `dashboard` template you started from: A SaaS admin starter: overview metrics and a revenue chart, customers with search, filters and detail pages, orders with audited status changes, and a role-gated settings page for owner, admin, member and viewer personas.

## Users

TODO: who uses it, mapped to the roles in [PERMISSIONS.md](PERMISSIONS.md).

## Capabilities

TODO: what a user can do, one line each, linked to [FLOWS.md](FLOWS.md).

## Non-goals

TODO: what this prototype deliberately does not do.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Active month | Lifecycle | normal | 4242 | `{"dashboard":{"customers":36,"ordersPerCustomer":[1,5]}}` | Thirty days in: a few dozen customers, steady orders in every status and a busy audit trail. |
| `empty` | Brand-new workspace | Lifecycle | empty | 101 | `{"dashboard":{"customers":0,"ordersPerCustomer":[0,0]}}` | The owner just signed up: no customers or orders yet. Shows every empty state. |
| `power-user` | Power user, year one | Lifecycle | dense | 9001 | `{"dashboard":{"customers":180,"ordersPerCustomer":[2,8]}}` | A year of heavy use: ~180 customers and close to a thousand orders. Good for density, pagination and performance. |
| `viewer` | Read-only viewer | Roles | normal | 4242 | `{"dashboard":{"customers":36,"ordersPerCustomer":[1,5]}}` | Same world as “Active month”, seen by a viewer: every create, edit, delete and settings control is hidden and blocked. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.dashboard` |
| slug | `dashboard` |
| name | SaaS Dashboard |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `active` |
| default theme | `violet` |
| storage namespace | `template-dashboard` |
| schema version | 2 |
| generator version | 3 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
