# Team chat: spec

## Problem

TODO: the product problem in two or three sentences.

The `team-chat` template you started from: A Slack-like team chat starter: workspaces, channels and DMs, threads, reactions, mentions, presence, unread state, search, file shares, slash commands, AI bots in channels, and simulated huddles with captions. Simulated AI only — no real models.

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
| `busy-day` | Busy day | Roles | normal | 104002 | — | Channels, DMs, threads, reactions and presence mid-sprint. |
| `empty` | Empty workspace | General | normal | 104001 | — | One workspace, #general only, no history. |
| `quiet-night` | Quiet night | Lifecycle | normal | 104003 | — | Member persona, lighter traffic, bots idle. |
| `viewer` | Viewer | Roles | normal | 104004 | — | Read-only stroll through the workspace. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

Data lives in IndexedDB; personas and roles are simulated; bots and huddle
captions are canned. Channel membership is enforced for private/DM reads and
all writes; public channels need explicit Join before posting. See
[docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.team-chat` |
| slug | `team-chat` |
| name | Team chat |
| version | 0.1.0 |
| platform | responsive |
| category | communication |
| default scenario | `busy-day` |
| default theme | `ocean` |
| storage namespace | `template-team-chat` |
| schema version | 1 |
| generator version | 3 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
