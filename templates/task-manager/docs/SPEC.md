# Task Manager: spec

## Problem

TODO: the product problem in two or three sentences.

The `task-manager` template you started from: Projects, a drag-and-drop board (To do → In progress → Review → Done), tasks with assignees, due dates, priorities, labels and comments, a “My tasks” view and owner/admin/member/viewer permissions.

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
| `active-team` | Active team, week 3 | Lifecycle | normal | 3107 | `{"tasks":{"overdueShare":0.12,"projects":3,"tasksPerProject":[10,14]}}` | Six people three weeks in: three projects, a busy board, comments and a few tasks slipping. |
| `empty` | Brand-new workspace | Lifecycle | empty | 3107 | `{"tasks":{"overdueShare":0,"projects":0,"tasksPerProject":[0,0]}}` | The owner just signed up: no projects or tasks yet. Shows every empty state. |
| `overdue-crunch` | Overdue crunch | Conditions | dense | 3107 | `{"tasks":{"focusAssignee":"user_0003","overdueShare":0.7,"projects":4,"tasksPerProject":[12,16]}}` | Launch week gone wrong: most open tasks are past due (relative to the simulated clock). Seen by Priya, a member who can edit tasks but delete only her own. |
| `viewer` | Read-only viewer | Roles | normal | 3107 | `{"tasks":{"overdueShare":0.12,"projects":3,"tasksPerProject":[10,14]}}` | The “Active team” world seen by Theo, a client stakeholder: every create, edit, move and delete is blocked in the UI and in services. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.task-manager` |
| slug | `task-manager` |
| name | Task Manager |
| version | 0.1.0 |
| platform | responsive |
| category | productivity |
| default scenario | `active-team` |
| default theme | `violet` |
| storage namespace | `template-task-manager` |
| schema version | 2 |
| generator version | 2 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
