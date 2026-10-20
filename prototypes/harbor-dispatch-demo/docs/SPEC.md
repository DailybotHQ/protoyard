# Harborlight Dispatch: spec

## Problem

TODO: the product problem in two or three sentences.

The `crud-app` template you started from: Blueprint-driven starter: projects and tasks with AppShell navigation, EntityList/EntityForm, notifications bell, members and a command palette. Base template for `protoyard generate`.

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
| `active` | Active dispatch | Roles | normal | 123002 | — | A regular day of shipments moving through the fictional harbor. |
| `empty` | New fleet | General | empty | 123001 | — | A Harborlight team waiting for its first shipment. |
| `massive` | Fleet scale | Roles | massive | 123004 | — | A dense Harborlight sample for checking large shipment lists. |
| `viewer` | Dispatch viewer | Roles | sparse | 123003 | — | A read-only look at the delivery board and harbor map. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.harbor-dispatch-demo` |
| slug | `harbor-dispatch-demo` |
| name | Harborlight Dispatch |
| version | 0.1.0 |
| platform | responsive |
| category | operations |
| default scenario | `active` |
| default theme | `harborlight-dispatch` |
| storage namespace | `harbor-dispatch-demo` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | Harborlight Dispatch (`harborlight-dispatch`) |
<!-- /protoyard:generated:manifest -->
