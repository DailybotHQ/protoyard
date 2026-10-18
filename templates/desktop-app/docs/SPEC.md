# Desktop App: spec

## Problem

TODO: the product problem in two or three sentences.

The `desktop-app` template you started from: A desktop-app starter: a notes workspace with folders, tags, a working menu bar, a three-pane document view, keyboard shortcuts and owner/editor/viewer personas, framed in a desktop window.

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
| `active` | Active workspace | Lifecycle | normal | 2026 | `{"desktop":{"documentsPerFolder":[3,9],"folders":5,"tags":6}}` | A month of use: a handful of folders, a few dozen notes with tags and a couple of pinned documents. |
| `empty` | Fresh install | Lifecycle | empty | 11 | `{"desktop":{"documentsPerFolder":[0,0],"folders":0,"tags":0}}` | The app was just installed: one empty Inbox folder, no documents and no tags. Shows every empty state. |
| `large` | Large library | Lifecycle | dense | 90210 | `{"desktop":{"documentsPerFolder":[8,24],"folders":24,"tags":8}}` | A year of heavy use: 24 folders and several hundred documents. Good for search, scrolling and performance. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.desktop-app` |
| slug | `desktop-app` |
| name | Desktop App |
| version | 0.1.0 |
| platform | desktop |
| category | starter |
| default scenario | `active` |
| default theme | `violet` |
| storage namespace | `template-desktop-app` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
