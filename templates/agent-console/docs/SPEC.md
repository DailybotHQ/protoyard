# Agent Console: spec

## Problem

TODO: the product problem in two or three sentences.

The `agent-console` template you started from: A simulated agent platform: agent definitions, a playground with step traces and approvals, run history, deterministic evaluations and usage/cost dashboards.

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
| `active` | Active platform | Lifecycle | normal | 202 | `{"agents":3,"evaluations":true,"runsPerAgent":6}` | Three agents with a month of playground runs, datasets and evaluations. |
| `empty` | Fresh console | Lifecycle | empty | 101 | `{"agents":0,"evaluations":false,"runsPerAgent":0}` | A brand-new workspace with no agents yet: shows every empty state. |
| `member` | Builder | Lifecycle | normal | 303 | `{"agents":3,"evaluations":true,"runsPerAgent":4}` | A builder who can create agents, run them and evaluate, but not delete agents. |
| `tool-outage` | Tool outage | Lifecycle | normal | 202 | `{"agents":3,"evaluations":true,"runsPerAgent":6}` | History is healthy, but every NEW tool call fails (failure scope ai.agent.tool.): playground runs and evaluations show failed steps. |
| `viewer` | Read-only viewer | Roles | normal | 202 | `{"agents":3,"evaluations":true,"runsPerAgent":6}` | Same platform, seen by a stakeholder who can read traces and dashboards only. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.agent-console` |
| slug | `agent-console` |
| name | Agent Console |
| version | 0.1.0 |
| platform | desktop |
| category | ai |
| default scenario | `active` |
| default theme | `ocean` |
| storage namespace | `template-agent-console` |
| schema version | 1 |
| generator version | 2 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
