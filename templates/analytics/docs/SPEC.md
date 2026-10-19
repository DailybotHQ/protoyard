# Product Analytics: spec

## Problem

Product teams need to see how people use their product: who is active, what they do, where they drop out of activation, and whether they come back. This template is a working analytics product on simulated tracked events, ready to remix into a specific product's analytics.

## Users

- Product leads and analysts (`owner`, `admin`, `member`) explore the data, arrange the dashboard and save segments.
- Stakeholders (`viewer`) read dashboards, trends, funnels and retention without changing anything.

## Capabilities

- See key metrics against the previous period, and arrange and rename the dashboard ([Arrange the dashboard](FLOWS.md#arrange-the-dashboard)).
- Chart events or unique users over time, filtered and broken down by plan, country or platform.
- Save a filter as a segment and reuse it ([Save a segment](FLOWS.md#save-a-segment)).
- Rename or delete segments within ownership rules ([Manage segments](FLOWS.md#manage-segments)).
- Read the activation funnel with breakdowns and time to convert, and cohort retention.
- Watch a live counter move as simulated time advances.

## Non-goals

- No event ingestion API or SDK: events come from scenarios and the timeline.
- No SQL or custom query language: filters are the structured `FilterGroup` model.
- No sharing, alerts, scheduled reports or data export.
- No real accounts: personas stand in for users.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Quarter of history | Data | normal | 4242 | `{"analytics":{"users":80},"series":{"historyDays":90,"seasonality":"weekly"}}` | Ninety days of steady product usage with a weekly rhythm, two saved segments and a busy dashboard. |
| `empty` | Brand-new workspace | Lifecycle | empty | 101 | — | Tracking was just installed: no users or events yet. Shows every empty state. |
| `launch-spike` | Launch spike | Data | dense | 5150 | `{"analytics":{"users":30},"series":{"historyDays":45,"seasonality":"weekly","spikes":[{"daysAgo":3,"decayDays":4,"factor":5}]}}` | A launch three days ago brought a wave of new signups; traffic is still settling back. |
| `massive` | Massive workspace | Data | massive | 9001 | `{"analytics":{"users":30},"series":{"historyDays":90,"seasonality":"weekly"}}` | About 750 tracked users and seven times the events of the quarter scenario: for density, performance and paging. |
| `outage` | Outage last week | Data | normal | 4242 | `{"analytics":{"outages":[{"days":2,"daysAgo":6,"depth":0.1}],"users":80},"series":{"historyDays":90,"seasonality":"weekly"}}` | Same quarter of history with a two-day incident six days ago: tracked events dropped to a tenth. |
| `viewer` | Read-only viewer | Data | normal | 4242 | `{"analytics":{"users":80},"series":{"historyDays":90,"seasonality":"weekly"}}` | Same world as “Quarter of history”, seen by a viewer: dashboards and segments can be read but not edited. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

- **Data:** every event, user, dashboard and segment is fictional and lives in the visitor's browser (IndexedDB).
- **People:** personas replace authentication, and roles are simulated permissions (UX only, not security).
- **Network:** latency, offline and failures come from the simulated environment (DevTools).
- **Time:** the "live" counter follows simulated time (DevTools → advance), not a real stream.

## Rebuild as a real app

| Prototype piece | Real counterpart |
| --- | --- |
| `events` / `users` tables | An event pipeline (SDK → ingestion → columnar store) with schema validation and retention policies |
| `src/domain/metrics.ts` | Server-side aggregation queries (pre-aggregated rollups for large ranges) |
| `dashboards`, `segments` + services | A metadata API with the same validation (DashboardLayoutSchema, filterSchemaFor) and audit log |
| `policy.ts` + personas | Real authentication and authorization (workspace roles, row ownership) enforced on the server |
| Environment failures | Real error handling and retries; offline queues if needed |
| Scenarios | Fixtures and staging datasets for tests and demos |
| Live counter timeline | A streaming endpoint (SSE or WebSocket) feeding the counter |
| Screens | Kept as they are; swap the data layer behind `liveQuery` for API calls |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.analytics` |
| slug | `analytics` |
| name | Product Analytics |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `active` |
| default theme | `violet` |
| storage namespace | `template-analytics` |
| schema version | 1 |
| generator version | 1 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
