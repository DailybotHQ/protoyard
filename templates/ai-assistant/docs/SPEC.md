# AI Assistant: spec

## Problem

TODO: the product problem in two or three sentences.

The `ai-assistant` template you started from: A simulated assistant workspace with persistent project history, model selection, canvas, agent and voice modes, settings, memory controls and usage limits.

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
| `active-workspace` | Active workspace | Workspace | normal | 734 | `{"approvals":0,"conversations":4,"messagesPerConversation":8}` | A small team with project folders, saved conversations and a ready-to-use canvas. |
| `agent-approval` | Agent approval | Agents | normal | 621 | `{"approvals":1,"conversations":2,"messagesPerConversation":4}` | An agent plan includes a tool action that asks for simulated approval. |
| `assistant-outage` | Assistant outage | Conditions | normal | 734 | `{"approvals":0,"conversations":4,"messagesPerConversation":8}` | The simulated assistant is unavailable until the environment changes. |
| `fresh-workspace` | Fresh workspace | Workspace | empty | 17 | `{"approvals":0,"conversations":0,"messagesPerConversation":0}` | A first-visit workspace with no history. |
| `power-user` | Power user | Workspace | normal | 155 | `{"approvals":0,"conversations":6,"messagesPerConversation":18}` | A workspace with a wider project history and long conversations. |
| `rate-limited` | Rate limited | Conditions | normal | 244 | `{"approvals":0,"conversations":2,"maxRequestsPerMinute":2,"messagesPerConversation":4}` | The simulated model accepts two requests per minute. |
| `slow-model` | Slow model | Conditions | normal | 734 | `{"approvals":0,"conversations":4,"messagesPerConversation":8}` | Responses have simulated latency so loading and stop states can be explored. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.ai-assistant` |
| slug | `ai-assistant` |
| name | AI Assistant |
| version | 0.1.0 |
| platform | responsive |
| category | ai |
| default scenario | `active-workspace` |
| default theme | `amethyst` |
| storage namespace | `template-ai-assistant` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
