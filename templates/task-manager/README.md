# Task Manager

A working Protoyard template for team task tracking: **projects → board → tasks**.
Every control is wired to persisted IndexedDB data, simulated permissions and the
simulated clock. Start a prototype from it with:

```bash
pnpm protoyard new my-tracker --template task-manager
pnpm protoyard dev my-tracker
```

## What works

- **Overview** — open / overdue / due-this-week / done-in-7-days stats and project cards with progress.
- **Projects** — create, edit (name, key, description, color) and delete (cascades to tasks,
  comments and history in one transaction). Owners and admins only.
- **Board** — To do → In progress → Review → Done. Move cards by drag-and-drop **or** the
  card's “Move to…” menu (keyboard and screen-reader path, with live announcements).
  Filters: text, assignee (incl. “Assigned to me” / “Unassigned”), priority, label, overdue only.
- **Tasks** — title, description, status, priority, assignee (`UserPicker` over the
  workspace personas; viewers cannot be assigned), due date, up to 4 labels, comments and
  a history trail. Overdue is always computed against the **simulated** clock.
- **My tasks** — tasks assigned to the current persona grouped into Overdue / Today /
  Next 7 days / Later / No date (+ Completed), with one-click done/reopen.

## Personas & permissions

| Persona | Role | Can |
| --- | --- | --- |
| Maya Chen (`user_0001`) | owner | everything |
| Jordan Blake (`user_0002`) | admin | everything |
| Priya Nair, Sam Ortiz, Lena Fischer | member | create/edit/move any task, comment; delete **only tasks they reported** and their own comments |
| Theo Grant (`user_0006`) | viewer | read only |

Rules live in `src/domain/policy.ts` and are enforced in the services
(`session.assert`), not just hidden in the UI.

## Scenarios

| Scenario | What you see |
| --- | --- |
| `empty` | Brand-new workspace, one owner, every empty state |
| `active-team` *(default)* | Six people in week 3: three projects, ~35 tasks, comments, a few overdue |
| `overdue-crunch` | Four projects where ~70% of open work is past due, seen by member Priya |
| `viewer` | The `active-team` world seen by read-only Theo |

All are composed from `@protoyard/scenarios` presets (`active-month`, `brand-new-signup`)
in `src/scenarios/index.ts`. Generator knobs live in `generators.tasks`
(`projects`, `tasksPerProject`, `overdueShare`, `focusAssignee`).

**Time travel:** advancing the clock in DevTools emits 1–3 deterministic
`task.progress` events per day that move seeded tasks one column forward. Event ids
depend only on scenario + day, so advancing 7×1 day equals 1×7 days.

## Layout

```text
src/database/schema.ts        projects, tasks, comments, activity (Dexie stores + types)
src/domain/policy.ts          roles → capabilities (+ "own task" rules)
src/domain/services.ts        assert → zod → environment.run → db.transaction
src/domain/tasks.ts           pure helpers: labels, due state, filters, sorting
src/scenarios/                scenarios (presets) + deterministic generator + timeline
src/lib/context.svelte.ts     runtime, services and live people list for screens
src/screens/                  Overview, Board, TaskDetail, MyTasks
src/components/               TaskDialog, ProjectDialog, TaskCard, badges
tests/                        generator determinism/integrity + services on the real runtime
```

## Checks

```bash
pnpm vitest run templates/task-manager
pnpm --filter @protoyard-template/task-manager typecheck
pnpm --filter @protoyard-template/task-manager build
```

## Layouts

The task manager starts with the sidebar layout and supports the icon rail and
top navigation. The navigation model includes the live project list so it
stays current as projects are added.
