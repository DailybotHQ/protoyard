# Project Management: spec

## Problem

Small product teams need one place to plan project work, see progress over time and balance assignments. This template demonstrates those workflows with persisted project, sprint and task data.

## Users

Owners and admins configure projects; members plan, move, schedule and receive work; viewers inspect a read-only workspace. Role behavior is simulated and enforced for the prototype's UI flows.

## Capabilities

- Create and manage projects and their sprints.
- Move and reorder tasks on the status board, with changes saved after reload.
- Reschedule tasks on the timeline and persist every changed date.
- Review estimated open hours per teammate and reassign tasks.
- View task comments and activity history, and browse tasks assigned to the active persona.

## Non-goals

This is not a hosted project system: it has no server sync, real identity, external calendar, time tracking or real authorization. Data lives in browser storage.

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

The database is local IndexedDB and can be cleared by the browser. Personas, roles, environment failures and time are simulated. Seeded people and projects are fictional. No external services are contacted.

## Rebuild as a real app

Keep the task and sprint model, then replace IndexedDB with an API and transactional database. Replace persona switching with a real identity provider and enforce authorization on the server. Move scenario generation to fixtures and connect scheduling and notifications to the team's real systems.

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.project-management` |
| slug | `project-management` |
| name | Project Management |
| version | 0.1.0 |
| platform | responsive |
| category | productivity |
| default scenario | `active-team` |
| default theme | `violet` |
| storage namespace | `template-project-management` |
| schema version | 3 |
| generator version | 3 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
