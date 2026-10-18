# Blank: spec

## Problem

TODO: the product problem in two or three sentences.

The `blank` template you started from: A minimal but real starting point: a persisted Notes list with owner and viewer personas, three scenarios and permission-checked services.

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
| `active` | Active owner | Lifecycle | normal | 202 | `{"notes":12}` | Three weeks in: a dozen notes, a few pinned, edited by both people. |
| `empty` | Brand-new workspace | Lifecycle | empty | 101 | `{"notes":0}` | The owner just signed up: no notes yet. Shows the empty state. |
| `viewer` | Read-only viewer | Roles | normal | 202 | `{"notes":12}` | Same world as “Active owner”, seen by a viewer who cannot create, edit or delete. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.blank` |
| slug | `blank` |
| name | Blank |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `active` |
| default theme | `violet` |
| storage namespace | `template-blank` |
| schema version | 1 |
| generator version | — |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
