# Keel Projects: data model

- `projects`: owner, key, color and description (fictional clients and the studio's own kit).
- `sprints`: project, name, goal and inclusive start/end dates.
- `tasks`: project and sprint links, board status/order, assignee, due and schedule dates, estimated hours, priority, labels, reporter and `milestone` (a zero-length gate).
- `dependencies` (v4): finish-to-start links `fromId → toId` inside a project. Each seeded project has one chain: two tasks → milestone → two follow-ups.
- `rituals` (v4): recurring studio rituals in the calendar engine's series shape (`start`, `end`, `rule`, `exdates`, `overrides`).
- `savedViews` (v4): named task grid views per persona; `state` is the grid's view state (columns, sort, groupBy, filter, density) as JSON, validated with `SavedViewSchema`.
- `comments` (with optional `parentId` for replies), `activity`, `notifications`: discussion, audit history and mention notices.

All seeded identities and rows are fictional. Scenario output is deterministic; timestamps use the scenario clock. Schema version 4 adds the three tables and the `milestone` flag (an upgrade sets it to `false` on existing tasks).
