# Keel Projects

Keel Studio's project hub, a **fictional product studio**: a board with swimlanes, sprint rituals on a calendar, a gantt with dependencies and the critical path, a 10,000-task grid with saved views, comments with mentions, a notifications center and a command palette. Created with `pnpm protoyard new keel-projects-demo --template project-management`. All people, clients and data are simulated.

```bash
pnpm protoyard dev keel-projects-demo
```

## What works

- **Board** (`@protoyard/views-ui/board`): lanes by assignee or priority; drag, keyboard and "Move to…" save status, order and lane through `tasks.reorder`.
- **Calendar** (`@protoyard/views-ui/calendar`): recurring rituals; edits to one, the following or all occurrences save through `rituals.apply`.
- **Timeline** (`@protoyard/views-ui/timeline`): milestones, finish-to-start links and the critical path; moving a milestone shifts its successors, saved together by `tasks.reschedule` (which refuses broken links).
- **All tasks** (`@protoyard/views-ui/grid`): 10,004 tasks in `massive`, virtualized; sort, filter, group, inline edits (`tasks.setField`) and saved views per person (`savedViews.*`).
- **Task detail** (`@protoyard/views-ui/activity`): comments with `@` mentions and replies, history and status.
- **Notifications center** and **command palette** (`@protoyard/views-ui/notifications`, `/commands`) in the top bar.
- **Permissions**: owners/admins manage projects; members work on tasks, rituals and their own views; the viewer is read-only. Simulated, never security.

## Scenarios

| Scenario | What it shows |
| --- | --- |
| `empty` | A brand-new workspace and every empty state |
| `sprint-in-flight` *(default)* | Mid-Sprint 12: three client projects, rituals (the client review is today, Friday), linked milestones, some slipping work |
| `overdue-crunch` | Most open work past due, seen by Priya (a member) |
| `massive` | 4 × 2,500 tasks (10,004 with milestones), mostly an imported backlog without history |
| `viewer` | The sprint seen by Theo, a client stakeholder, with every change blocked |

Switch persona with DevTools or a link: `?actor=user_0003` acts as Priya (data is kept).

## Checks

```bash
pnpm vitest run prototypes/keel-projects-demo
pnpm protoyard validate keel-projects-demo --strict-spec --build
pnpm protoyard budget keel-projects-demo
pnpm protoyard scenario bench keel-projects-demo --check
PROTOYARD_E2E_PROTOTYPES=keel-projects-demo pnpm test:e2e tests/e2e/keel-projects-demo.spec.ts tests/e2e/layout-fit.spec.ts
pnpm protoyard export keel-projects-demo
```

Measured on 2026-10-19 (M1 Max): initial JS 173 KB gzip (target 210 KB; the template is 228 KB), `massive` generation 39 ms (budget 50 ms).
