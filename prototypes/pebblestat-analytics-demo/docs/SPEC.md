# Pebblestat Analytics: spec

## Problem

Pebblestat is a fictional product analytics company in the spirit of Mixpanel. Its team needs to see how people use its two products: growth, activation, retention and incidents. This flagship dogfoods every Protoyard charts and analytics kit on data that feels real, up to an enterprise-scale project.

## Users

- **Owner** (`owner`, Maya): runs the workspace and manages everything, including other people's reports, segments, alerts and annotations.
- **Analyst** (`analyst`, Theo): explores data, edits dashboards, and saves reports, segments, alerts and annotations, managing their own.
- **Viewer** (`viewer`, Inês): reads every screen and changes nothing.

## Capabilities

- Switch between projects.
- See key metrics against the previous period, with release annotations, and arrange and rename the project dashboard ([Arrange the dashboard](FLOWS.md#arrange-the-dashboard)).
- Chart events or unique users over time with filters, breakdowns and segments, then save the query as a report ([Save a report](FLOWS.md#save-a-report)) and reopen it from Reports.
- Annotate a day with a release, incident or campaign ([Annotate the timeline](FLOWS.md#annotate-the-timeline)).
- Create daily threshold alerts, mute or delete them, and watch them fire as simulated time advances ([Create and manage an alert](FLOWS.md#create-and-manage-an-alert)).
- Read the activation funnel with breakdowns and time to convert, cohort retention, and a live counter.

## Non-goals

- No event ingestion, SDK or warehouse: events come from scenarios and the timeline.
- No notification delivery (email, Slack): alerts change state in the app only.
- No SQL or custom query language: filters are the structured `FilterGroup` model.
- No real accounts or projects: personas and fixed projects stand in for them.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `churn-risk` | Churn-risk cohort | Data | normal | 7331 | `{"pebblestat":{"churn":{"fromDaysAgo":56,"keep":0.15,"toDaysAgo":35},"users":80},"series":{"historyDays":90,"seasonality":"weekly"}}` | Users who signed up five to eight weeks ago stopped coming back after their first week: their cohorts stand out on Retention. |
| `enterprise-scale` | Enterprise scale | Data | normal | 9001 | `{"pebblestat":{"sampleRate":0.05,"users":360},"series":{"historyDays":90,"seasonality":"weekly"}}` | About 100,000 Web events in ninety days, stored as daily rollups per event type plus a 5 % user sample (about 5,000 raw events) for filters, funnels and retention. |
| `healthy-growth` | Healthy growth | Data | normal | 4242 | `{"pebblestat":{"users":80},"series":{"historyDays":90,"seasonality":"weekly"}}` | Ninety days of steady growth with a weekly rhythm: saved reports, segments, two alerts and release annotations. |
| `launch-day` | Launch day spike | Data | dense | 5150 | `{"pebblestat":{"users":30},"series":{"historyDays":45,"seasonality":"weekly","spikes":[{"daysAgo":3,"decayDays":4,"factor":5}]}}` | A launch three days ago brought a wave of signups; the analyst is reading the spike. A campaign annotation marks the day. |
| `new-project` | New project, no data yet | Lifecycle | empty | 101 | `{"pebblestat":{"users":0}}` | The tracking snippet was just installed: projects exist but no users or events have arrived. Every empty state. |
| `outage-incident` | Outage incident | Data | normal | 4242 | `{"analytics":{"outages":[{"days":2,"daysAgo":6,"depth":0.1}]},"pebblestat":{"users":80},"series":{"historyDays":90,"seasonality":"weekly"}}` | Ingestion dropped to a tenth for two days, six days ago: the page-view alert is firing and an incident annotation explains the gap. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

- **Data:** every project, user, event, report and alert is fictional and lives in the visitor's browser (IndexedDB).
- **People:** personas replace authentication, and roles are simulated permissions (UX only, not security).
- **Network:** latency, offline and failures come from the simulated environment (DevTools).
- **Time:** alerts and the live counter move only when simulated time advances.
- **Scale:** `enterprise-scale` does **not** store 100,000 raw events.
  - Generating them, or even the plan's 20,000-event sample, would break the 50 ms generation budget on the reference machine.
  - So it stores a 5 % user sample (about 5,000 raw events) plus daily rollups per event type that total about 100,000 events.
  - The rollups are derived from the sample (each sampled event stands for 20) with a ±3 % seeded jitter.
  - Event totals are therefore consistent with the sample, not independent measurements.

## Rebuild as a real app

| Prototype piece | Real counterpart |
| --- | --- |
| `events` / `users` / `rollups` | An event pipeline (SDK → ingestion → columnar store) with server-side rollups and sampling for large projects |
| `src/domain/metrics.ts` | Aggregation queries against the store |
| `reports`, `segments`, `dashboards`, `annotations` + services | A metadata API with the same zod validation and an audit log |
| `alerts` + timeline checks | A scheduler that evaluates thresholds daily and delivers notifications |
| `policy.ts` + personas | Real authentication and workspace roles, with ownership enforced on the server |
| Environment failures | Real error handling and retries |
| Scenarios | Fixtures and staging datasets |
| Screens | Kept as they are; swap the data layer behind `liveQuery` for API calls |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `example.pebblestat-analytics` |
| slug | `pebblestat-analytics-demo` |
| name | Pebblestat Analytics |
| version | 0.1.0 |
| platform | responsive |
| category | analytics |
| default scenario | `healthy-growth` |
| default theme | `violet` |
| storage namespace | `pebblestat-analytics-demo` |
| schema version | 1 |
| generator version | 2 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
