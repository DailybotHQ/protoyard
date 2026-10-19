# Pebblestat Analytics: screens

## Routes

<!-- protoyard:generated:routes -->
| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Overview | — | Key metrics and the editable product dashboard. |
| `#/trends` | Trends | — | Event and user trends with filters, breakdowns and saved segments. |
| `#/funnels` | Funnels | — | The activation funnel with breakdowns and time to convert. |
| `#/retention` | Retention | — | Cohort retention by day or week. |
| `#/live` | Live | — | A live counter on simulated time and the latest events. |
| `#/reports` | Reports | — | Saved Trends reports: open, rename and delete with ownership rules. |
| `#/alerts` | Alerts | — | Daily metric alerts that fire as simulated time advances. |
| `#/segments` | Segments | — | Saved segments: rename and delete with ownership rules. |
<!-- /protoyard:generated:routes -->

## Screens

- **Shell:** a project switcher (Web or Mobile) in the sidebar; the Alerts item shows how many alerts are firing.
- **Overview:**
  - KPI tiles (active users, signups, events, upgrade rate) against the previous period, the annotation strip, and the project dashboard grid with five lazy widgets.
  - Sampled projects show a "Sampled" badge; event totals come from rollups and user counts are marked "(est.)".
  - Actions: date range, Rename, Edit layout (with `dashboards:edit`).
  - States: skeletons, an error state, and an empty state when the project has no events.
- **Trends:**
  - Events or unique users over time with an event picker, a breakdown, the filter builder and the segment picker, plus the annotation strip.
  - Actions: **Save report** (`reports:save`), **Annotate** (`annotations:create`).
  - `?report=<id>` opens a saved report.
- **Funnels:** the activation funnel for signups in the range (14-day window), with a breakdown and a step table.
- **Retention:** weekly or daily cohorts, "active in period" or "not yet churned"; the churn-risk cohorts stand out.
- **Reports:** saved reports with what each shows (in words), its owner and date. Actions: Open, Rename, Delete where allowed. Empty state.
- **Alerts:**
  - One card per alert: the rule, status (OK, Firing, Muted), a sparkline of recent checks, and the last check and last firing.
  - Actions: New alert, Mute/Unmute and Delete where allowed. Empty state.
- **Live:** a counter that follows simulated time and the project's latest events.
- **Segments:** saved segments of the project with rename and delete where allowed.

## Shell

A responsive web app previewed at the desktop viewport (`preview.viewport: desktop`). The sidebar collapses into a drawer below `lg`, and the dashboard grid collapses to one column on narrow screens.

