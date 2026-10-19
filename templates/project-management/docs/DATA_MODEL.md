# Data model

- `projects`: owner, key, color and description.
- `sprints`: project, name, goal and inclusive start/end dates.
- `tasks`: project and sprint links, board status/order, assignee, due and schedule dates, estimated hours, priority, labels and reporter.
- `comments`, `activity`, `notifications`: task discussion, audit history and mention notices.

All seeded identities and rows are fictional. Scenario output is deterministic; timestamps use the scenario clock, and task dates are produced with the scenarios schedule helper. Schema version 3 adds sprints and task schedule/workload fields.
