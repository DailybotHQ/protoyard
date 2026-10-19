# Atlas Workspace Demo: spec

## Problem

Operations teams need to inspect customer activity, orders and workspace health without losing context as their product grows. Atlas demonstrates the same fictional workspace inside multiple navigation and content frames, with a seeded data set for empty, normal and dense states.

## Users

Owners and admins manage customer and order records; members work with permitted records; viewers inspect the same workspace read-only. The playbook and layout gallery are available to every persona. See [PERMISSIONS.md](PERMISSIONS.md).

## Capabilities

Users can review metrics and recent activity, search customer and order records, update permitted records, configure workspace preferences, compare layout frames and complete a local workspace orientation. Mutation details are in [FLOWS.md](FLOWS.md).

## Non-goals

Atlas does not provide real authentication, authorization, payment processing, remote synchronization, email delivery or production analytics. It is a browser-only product simulation.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Active month | Lifecycle | normal | 4242 | `{"dashboard":{"customers":36,"ordersPerCustomer":[1,5]}}` | Thirty days in: a few dozen customers, steady orders in every status and a busy audit trail. |
| `empty` | Brand-new workspace | Lifecycle | empty | 101 | `{"dashboard":{"customers":0,"ordersPerCustomer":[0,0]}}` | The owner just signed up: no customers or orders yet. Shows every empty state. |
| `massive` | Massive operations year | Lifecycle | dense | 9001 | `{"dashboard":{"customers":180,"ordersPerCustomer":[2,8]}}` | A year of heavy use: 180 fictional customers and close to a thousand orders. Good for density, pagination and performance. |
| `viewer` | Read-only viewer | Roles | normal | 4242 | `{"dashboard":{"customers":36,"ordersPerCustomer":[1,5]}}` | Same world as “Active month”, seen by a viewer: every create, edit, delete and settings control is hidden and blocked. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

Data is fictional and stored in the visitor's IndexedDB. Personas are selectable demo identities, and role rules demonstrate simulated product access only. Network latency, offline behavior and time are runtime simulations. The access preview never requests credentials. No remote APIs or payment providers are contacted. See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

For a production implementation, replace Dexie with a server-backed database and authenticated API, retain zod input contracts at the boundary, enforce roles on the server, and connect notification, billing and analytics screens to explicit providers. Keep deterministic scenario generators as fixtures rather than production data sources. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.atlas-workspace-demo` |
| slug | `atlas-workspace-demo` |
| name | Atlas Workspace Demo |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `active` |
| default theme | `aurora-analytics` |
| storage namespace | `atlas-workspace-demo` |
| schema version | 2 |
| generator version | 3 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
