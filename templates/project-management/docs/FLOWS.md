# Flows

- Board drag/drop, keyboard move and the “Move to” menu call `tasks.reorder`; the card order and status are persisted in one transaction.
- Timeline rescheduling previews date changes in the view and calls `tasks.reschedule` to validate and persist every changed date together.
- Workload assignment calls `tasks.assign`; pending feedback is shown on the row and the service validates that the selected persona can receive work.
- Project and task forms use domain services. Views never write IndexedDB directly.
