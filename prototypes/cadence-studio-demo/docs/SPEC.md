# Cadence Studio: spec

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
| `active` | Active | Roles | normal | 123002 | — | A normal density workspace for day-to-day demos. |
| `empty` | Empty | General | empty | 123001 | — | Team only — no projects or tasks yet. |
| `massive` | Massive | Roles | massive | 123004 | — | Dense seed for list virtualization and budget checks. |
| `viewer` | Viewer | Roles | sparse | 123003 | — | Read-only stroll through seeded work. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.cadence-studio-demo` |
| slug | `cadence-studio-demo` |
| name | Cadence Studio |
| version | 0.1.0 |
| platform | responsive |
| category | productivity |
| default scenario | `active` |
| default theme | `cadence-studio` |
| storage namespace | `cadence-studio-demo` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | Cadence Studio (`cadence-studio`) |
<!-- /protoyard:generated:manifest -->
