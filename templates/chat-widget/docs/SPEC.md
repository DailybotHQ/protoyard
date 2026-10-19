# Chat widget: spec

## Problem

TODO: the product problem in two or three sentences.

The `chat-widget` template you started from: A compact single-thread support widget for the widget-host shell: greeting, scripted streaming assistant, handoff-to-human simulation, offline banner, and four scenarios.

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
| `agent-offline` | Visitor offline | Conditions | normal | 42 | `{"history":2}` | Network is offline — the offline banner shows and sends fail (simulated). |
| `first-visit` | First visit | Lifecycle | empty | 11 | `{"history":0}` | Empty support thread with a greeting. The visitor can post and hand off. |
| `outage` | Assistant outage | Conditions | normal | 42 | `{"history":1}` | Assistant replies fail with a simulated 500. Retry recovers after clearing the failure override. |
| `returning-visitor` | Returning visitor | Lifecycle | normal | 42 | `{"history":3}` | Prior messages already in the support thread from an earlier session. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.chat-widget` |
| slug | `chat-widget` |
| name | Chat widget |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `first-visit` |
| default theme | `ocean` |
| storage namespace | `template-chat-widget` |
| schema version | 1 |
| generator version | 2 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
