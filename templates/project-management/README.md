# Project Management

A working Protoyard template for managing projects, sprint work and team capacity. The board, timeline and workload screens read live IndexedDB queries; changes use validated services and persist across reloads.

```bash
pnpm protoyard new my-projects --template project-management
pnpm protoyard dev my-projects
```

## What works

- **Projects and sprints** — seeded project plans and an initial sprint for each new project.
- **Board** — lazy `@protoyard/views-ui/board` with pointer and keyboard moves; task column and order are saved together through `tasks.reorder`.
- **Timeline** — lazy `@protoyard/views-ui/timeline` with day, week, month and quarter zoom; drag, resize and keyboard date changes save through `tasks.reschedule`.
- **Workload** — open tasks and estimated hours grouped by teammate. Assignment changes go through `tasks.assign`, with saving feedback and role enforcement.
- **Task detail and My tasks** — task comments/history, due dates, priority and labels, plus a persona-specific task list.
- **Permissions** — owners and admins manage projects; members can work on tasks; viewers are read-only. These are simulated UX permissions, never security.

## Scenarios

| Scenario | What it demonstrates |
| --- | --- |
| `empty` | New workspace with clear empty states |
| `active-team` *(default)* | Six teammates, three projects, sprints, dated tasks and varied workload |
| `overdue-crunch` | A high share of overdue work viewed by a member |
| `viewer` | The active team viewed with read-only controls |

The seeded schedule uses `@protoyard/scenarios` `schedule()` with the scenario seed and reference time. Task dates include past and upcoming work. Timeline events use stable task ids and simulated time, so advancing time is reproducible.

## Data and services

`src/database/schema.ts` defines projects, sprints, tasks, comments, activity and notifications. `src/domain/services.ts` owns every write: it checks the session, validates input, enters `environment.run`, and commits related rows in Dexie transactions. Screens never write tables directly.

## Checks

```bash
pnpm vitest run templates/project-management
pnpm --filter @protoyard-template/project-management typecheck
pnpm --filter @protoyard-template/project-management build
pnpm protoyard validate project-management --strict-spec --build
pnpm protoyard budget project-management
```

Board and timeline routes load lazily so their view kits are not part of the initial screen bundle. The initial JavaScript budget is 250 KB gzip.

## Layout

The template uses shared `LayoutHost` navigation, which switches to the mobile layout at its supported breakpoint. Project links and the Timeline and Workload routes remain available from responsive navigation.
