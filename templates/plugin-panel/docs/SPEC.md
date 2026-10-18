# Plugin panel: spec

## Problem

TODO: the product problem in two or three sentences.

The `plugin-panel` template you started from: A narrow side-panel plugin starter with editable connected items, account preferences, and a simulated OAuth connection flow.

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
| `connect-error` | Connection outage | Conditions | normal | 41 | — | The simulated connection service fails until environment failures are cleared. |
| `connected-workspace` | Connected workspace | Workspace | normal | 41 | — | A small team with two integrations connected and automatic sync enabled. |
| `empty` | Fresh panel | Workspace | normal | 11 | — | No connected items yet; start with the simulated account connection flow. |
| `read-only` | Read-only teammate | Workspace | normal | 77 | — | A viewer can review connections and settings but cannot change them. |
| `sync-paused` | Sync paused | Conditions | normal | 58 | — | Connected items are present, but automatic sync is paused in settings. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.plugin-panel` |
| slug | `plugin-panel` |
| name | Plugin panel |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `connected-workspace` |
| default theme | `ocean` |
| storage namespace | `template-plugin-panel` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
