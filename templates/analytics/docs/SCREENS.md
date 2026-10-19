# Product Analytics: screens

## Routes

<!-- protoyard:generated:routes -->
| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Overview | — | Key metrics and the editable product dashboard. |
| `#/trends` | Trends | — | Event and user trends with filters, breakdowns and saved segments. |
| `#/funnels` | Funnels | — | The activation funnel with breakdowns and time to convert. |
| `#/retention` | Retention | — | Cohort retention by day or week. |
| `#/live` | Live | — | A live counter on simulated time and the latest events. |
| `#/segments` | Segments | — | Saved segments: rename and delete with ownership rules. |
<!-- /protoyard:generated:routes -->

## Screens

- **Overview:**
  - Shows KPI tiles (active users, signups, events, upgrade rate) against the previous period, and the dashboard grid with five lazy widgets: events over time, events by type, activation funnel, new users by plan, events by platform.
  - Actions: date range, Rename, Edit layout (hidden without `dashboards:edit`).
  - States: skeletons while loading, an error state, and an empty state when no events exist.
- **Trends:**
  - Shows events or unique users over time.
  - Actions: event picker, measure toggle, breakdown, filter builder, segment picker (Save is hidden without `segments:create`).
  - States: chart loading, empty and error states.
- **Funnels:**
  - Shows the activation funnel for signups in the range (14-day window), with a breakdown selector and a step table (conversion, drop-off, median time to convert).
  - States: loading and error.
- **Retention:**
  - Shows weekly (8 periods) or daily (14 periods) cohorts, counted as "active in period" or "not yet churned".
  - Uses an accessible table with a % / count toggle; incomplete cells are marked.
- **Live:**
  - Shows a counter that follows simulated time (polite live region, reduced-motion aware) and the latest 12 events.
  - Empty text when no events exist.
- **Segments:**
  - Shows saved segments with their filter in words, owner and date.
  - Actions: Rename and Delete (with a confirmation), shown only where the actor may manage that segment.
  - Empty state when there are none.

## Shell

A responsive web app previewed at the desktop viewport (`preview.viewport: desktop`). The sidebar collapses into a drawer below `lg`, and the dashboard grid collapses to one column on narrow screens.
