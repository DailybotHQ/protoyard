# Keel Projects: flows

- **Move a card**: drag, keyboard (Space, arrows, Space) or "Move to…" calls `tasks.reorder(move, lanes)`. Status, order and, with swimlanes, the new assignee or priority save in one transaction with activity entries.
- **Reschedule**: dragging, resizing or keyboard-moving a bar sends the bar and every shifted successor to `tasks.reschedule`, which refuses a set that would break a finish-to-start link and saves the rest together.
- **Move a ritual**: dragging a calendar occurrence asks for "this", "following" or "all" on a repeating ritual; `rituals.apply` writes the series the calendar sends (a "following" edit adds a split series).
- **Grid**: inline edits call `tasks.setField` (title, status, priority); "Save as new view", rename and delete call `savedViews.create/rename/remove` for the active persona.
- **Comment and mention**: `@priya.nair` in the composer is stored as `@{user_0003}`; `comments.add` saves the comment (or reply) and a mention notification for each teammate mentioned. The notifications center lists the active persona's notices and marks them read.
- **Command palette**: pages come from route metadata; actions open project boards and mark notifications read.
- Workload assignment (`tasks.assign`) and project/task forms are unchanged from the template. Views never write IndexedDB directly.
