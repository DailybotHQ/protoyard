# Keel Projects: spec

## Problem

Keel Studio, a fictional six-person product studio, runs client projects in two-week sprints. It needs one place to move work on a board, keep its rituals on a calendar, see how linked work and milestones line up on a gantt, search and slice every task, and talk about tasks with mentions that reach the right person.

## Users

Owners and admins (Maya, Jordan) manage projects; members (Priya, Sam, Lena) plan, move, schedule and discuss work and keep personal grid views; the viewer (Theo, a client stakeholder) reads everything and changes nothing. Roles are simulated and enforced in services.

## Capabilities

- **Board with swimlanes**: columns by status, lanes by assignee or priority; a drop into another lane reassigns or reprioritizes in the same write. Mouse, keyboard and the "Move to…" menu.
- **Calendar**: recurring rituals (weekday standup with a cancelled day, planning and review/retro every other week, weekly design critique); move one occurrence, the following ones or the whole series.
- **Timeline**: gantt with milestones, finish-to-start dependencies and the critical path; moving a milestone shifts its successors, saved together.
- **Task grid**: every task (10,004 in `massive`) in a virtualized grid with sort, filters, grouping, density, inline edits of title/status/priority and named views saved per person.
- **Task detail**: comments with `@` mentions and threaded replies, activity history, status changes.
- **Notifications center** with unread mentions, and a **command palette** (⌘K / Ctrl+K) for pages, project boards and actions.
- Workload by teammate and a personal "My tasks" list (from the template).

## Non-goals

Not a hosted project tool: no server sync, real identity, external calendars, email, time tracking or real authorization. Data lives in this browser's IndexedDB.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `empty` | Brand-new workspace | Lifecycle | empty | 3107 | `{"tasks":{"overdueShare":0,"projects":0,"tasksPerProject":[0,0]}}` | The owner just signed up: no projects or tasks yet. Shows every empty state. |
| `massive` | Massive backlog | Scale | massive | 3107 | `{"tasks":{"overdueShare":0.15,"projects":4,"synthetic":{"historyPerProject":12},"tasksPerProject":[2500,2500]}}` | Four projects with 2,500 tasks each (10,000 in all), mostly an imported backlog: for the task grid, saved views and the virtualized board and timeline. |
| `overdue-crunch` | Overdue crunch | Conditions | dense | 3107 | `{"tasks":{"focusAssignee":"user_0003","overdueShare":0.7,"projects":4,"tasksPerProject":[12,16]}}` | Launch week gone wrong: most open tasks are past due (relative to the simulated clock). Seen by Priya, a member who can edit tasks but delete only her own. |
| `sprint-in-flight` | Sprint in flight | Lifecycle | normal | 3107 | `{"tasks":{"overdueShare":0.12,"projects":3,"tasksPerProject":[10,14]}}` | Keel Studio halfway through Sprint 12: three client projects, a busy board, daily standups and a review on Friday, linked milestones and a few tasks slipping. |
| `viewer` | Read-only viewer | Roles | normal | 3107 | `{"tasks":{"overdueShare":0.12,"projects":3,"tasksPerProject":[10,14]}}` | The “Sprint in flight” world seen by Theo, a client stakeholder: every create, edit, move and delete is blocked in the UI and in services. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

The database is local IndexedDB and can be cleared by the browser. Personas, roles, environment failures and time are simulated. Seeded people and projects are fictional. No external services are contacted.

## Rebuild as a real app

Keep the task, dependency, ritual and saved-view model. Replace IndexedDB with an API over a transactional database, and enforce dependency validation and permissions on the server. Store rituals as RRULE series in the calendar backend, deliver mention notifications through a real notification service, and replace persona switching with an identity provider.

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.keel-projects-demo` |
| slug | `keel-projects-demo` |
| name | Keel Projects |
| version | 0.1.0 |
| platform | responsive |
| category | productivity |
| default scenario | `sprint-in-flight` |
| default theme | `violet` |
| storage namespace | `keel-projects-demo` |
| schema version | 4 |
| generator version | 4 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
