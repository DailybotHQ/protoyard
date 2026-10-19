# Admin Console: spec

## Problem

TODO: the product problem in two or three sentences.

The `admin-console` template you started from: An internal admin console: tenants with suspend and reactivate, users across tenants with simulated impersonation, subscriptions with cancel and resume, and an audit log of every staff action, with role-gated destructive actions behind confirmation.

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
| `auditor` | Auditor (read-only) | Roles | normal | 7310 | `{"admin":{"pastDueShare":0.1,"suspendedShare":0.08,"tenants":24}}` | Same world as “Normal operations”, seen by an auditor: everything is visible, every action is hidden and blocked. |
| `empty` | Day one | Lifecycle | empty | 301 | `{"admin":{"pastDueShare":0,"suspendedShare":0,"tenants":0}}` | The console just went live: no tenants yet. Shows every empty state. |
| `incident` | Incident day | Lifecycle | normal | 9120 | `{"admin":{"pastDueShare":0.35,"suspendedShare":0.3,"tenants":30}}` | A rough day: many tenants suspended or past due. Good for triage, filters and reactivation flows. |
| `operations` | Normal operations | Lifecycle | normal | 7310 | `{"admin":{"pastDueShare":0.1,"suspendedShare":0.08,"tenants":24}}` | Two dozen tenants in every state, their people, subscriptions and a steady audit log, seen by the platform owner. |
| `support-agent` | Support agent | Lifecycle | normal | 7310 | `{"admin":{"pastDueShare":0.1,"suspendedShare":0.08,"tenants":24}}` | Same world as “Normal operations”, seen by a support agent: can read and impersonate, cannot suspend, disable or change billing. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.admin-console` |
| slug | `admin-console` |
| name | Admin Console |
| version | 0.1.0 |
| platform | desktop |
| category | starter |
| default scenario | `operations` |
| default theme | `ocean` |
| storage namespace | `template-admin-console` |
| schema version | 1 |
| generator version | 2 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
