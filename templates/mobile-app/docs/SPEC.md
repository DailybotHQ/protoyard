# Mobile app: spec

## Problem

TODO: the product problem in two or three sentences.

The `mobile-app` template you started from: A mobile-first starter: bottom navigation, sticky header and a persisted Items list → detail → create/edit flow with owner and viewer personas and three scenarios.

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
| `active` | Active owner | Lifecycle | normal | 22 | `{"items":12}` | Two weeks in: a dozen items across to do, doing and done. |
| `empty` | First launch | Lifecycle | empty | 11 | `{"items":0}` | The owner just installed the app: nothing yet. Shows the empty state. |
| `viewer` | Read-only viewer | Roles | normal | 22 | `{"items":12}` | Same world as “Active owner”, seen by someone who can look but not change. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.mobile-app` |
| slug | `mobile-app` |
| name | Mobile app |
| version | 0.1.0 |
| platform | mobile |
| category | starter |
| default scenario | `active` |
| default theme | `emerald` |
| storage namespace | `template-mobile-app` |
| schema version | 1 |
| generator version | 2 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
