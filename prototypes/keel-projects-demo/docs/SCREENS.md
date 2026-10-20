# Keel Projects: spec

- **Overview**: project summaries and due-date metrics.
- **My tasks**: tasks assigned to the active persona, grouped by due date.
- **All tasks** (`#/tasks`): the virtualized task grid with saved views; a card list below `md`.
- **Project board** (`#/projects/:id`): status columns with "No lanes / By assignee / By priority" swimlanes.
- **Calendar** (`#/calendar`): week, month, day and agenda views of studio rituals (agenda by default on narrow screens).
- **Timeline** (`#/timeline`): gantt with dependencies, milestones and the critical path; below `md` only the task table shows.
- **Workload**: open tasks and estimated hours per assignable persona.
- **Task detail** (`#/tasks/:id`): description, comment thread with mentions and replies, history, status.
- **Review toolbar** (published builds, `build.review`): a small launcher placed off the app's controls that expands to Comment, Comments, Export and Import; pins attach to the `data-py-anchor` regions listed in the README.
- **Top bar** on every screen: "Search or jump to…" (the command palette, ⌘K / Ctrl+K) and the notifications bell.

Every route is a lazy chunk, and the palette and notifications center load after the shell, so the initial JS stays at 173 KB gzip.
