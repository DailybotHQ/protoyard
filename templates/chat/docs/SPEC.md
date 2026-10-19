# Chat: spec

## Problem

TODO: the product problem in two or three sentences.

The `chat` template you started from: A chat starter: persisted conversations and messages, one scripted assistant whose replies stream in (with stop, retry and simulated outages), unread badges, a two-pane layout, owner/member/viewer personas and four scenarios.

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
| `active` | Active team | Lifecycle | normal | 42 | `{"conversations":5}` | Three weeks of conversations with the assistant, a couple of them unread. |
| `assistant-outage` | Assistant outage | Conditions | normal | 42 | `{"conversations":5}` | Chat works, but every assistant reply fails with a simulated 500. Check the failed-reply and retry UX. |
| `empty` | First visit | Lifecycle | empty | 7 | `{"conversations":0}` | The owner just arrived: no conversations yet. Shows the empty state. |
| `viewer` | Read-only viewer | Roles | normal | 42 | `{"conversations":5}` | Same world as “Active team”, seen by someone who can read but not post. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.chat` |
| slug | `chat` |
| name | Chat |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `active` |
| default theme | `ocean` |
| storage namespace | `template-chat` |
| schema version | 1 |
| generator version | 2 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
