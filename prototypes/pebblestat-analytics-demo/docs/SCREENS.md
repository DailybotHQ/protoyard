# Pebblestat Analytics: screens

## Routes

<!-- protoyard:generated:routes -->
| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Overview | — | Key metrics and the editable product dashboard. |
| `#/trends` | Insights | — | Event and user trends with filters, breakdowns and saved segments. |
| `#/funnels` | Funnels | — | The activation funnel with breakdowns and time to convert. |
| `#/retention` | Retention | — | Cohort retention by day or week. |
| `#/live` | Live | — | A live counter on simulated time and the latest events. |
| `#/users` | Users | — | Tracked users with a drill-down by plan, country and platform. |
| `#/users/:id` | User | — | One tracked user: properties, activation and their event timeline. |
| `#/reports` | Reports | — | Saved Insights reports: open, rename and delete with ownership rules. |
| `#/alerts` | Alerts | — | Daily metric alerts that fire as simulated time advances. |
| `#/segments` | Segments | — | Saved segments: rename and delete with ownership rules. |
<!-- /protoyard:generated:routes -->

## Screens

- **Shell:**
  - The sidebar has a project switcher (Web or Mobile); the "Alerts & notes" item shows how many alerts are firing.
  - On phones and in device shells the sidebar becomes a drawer and the date range opens in a bottom sheet (`RangeBar`); wider screens use the popover picker.
- **Overview:**
  - KPI tiles (active users, signups, events, upgrade rate) against the previous period, the annotation strip, and the project dashboard grid. The grid's five widgets each load lazily, and it collapses to one column on narrow screens.
  - Sampled projects show a "Sampled" badge; event totals come from rollups and user counts are marked "(est.)".
  - Actions: date range, Rename, Edit layout (with `dashboards:edit`).
  - States: skeletons, an error state, and an empty state without events.
- **Insights** (`#/trends`):
  - **Over time:** events or unique users, with the comparison period dashed when the date range compares and there is no breakdown.
  - **Totals:** a horizontal bar chart per breakdown value, or per event.
  - Inputs: event picker, measure, breakdown, filter builder and segment picker, plus the annotation strip.
  - Actions: **Save report** (`reports:save`), **Annotate** (`annotations:create`).
  - `?report=<id>` opens a saved report.
- **Funnels:** the activation funnel for signups in the range (14-day window), with a breakdown and a step table.
- **Retention:** weekly or daily cohorts, "active in period" or "not yet churned"; the churn-risk cohorts stand out.
- **Users** (`#/users`):
  - A drill-down: a bar chart of users by plan, then country, then platform. Selecting a bar (pointer, tap or Enter) adds a breadcrumb step and filters the table.
  - The drill path lives in the hash (`?drill=…`), so a reload or link restores it.
  - The table shows each user with plan, country, platform, events and last seen; a user's link opens their page. Empty state without users.
- **User** (`#/users/:id`):
  - Properties, activation progress (the four funnel steps), event mix, and the event timeline (newest first, paged).
  - A not-found state for ids outside the scenario.
- **Reports:** saved reports with what each shows, its owner and date. Actions: Open, Rename, Delete where allowed. Empty state.
- **Alerts & annotations:**
  - One card per alert: rule, status (OK, Firing, Muted), a sparkline of recent checks, last check and last firing. Actions: New alert, Mute/Unmute, Delete where allowed.
  - Below, every annotation with its kind, date and author. Actions: Add annotation, Remove where allowed.
- **Live:**
  - A counter that follows simulated time.
  - A stream of the latest tracked events and alert checks, newest first. Items that arrived after the page opened are marked **New**, announced politely.
- **Segments:** saved segments of the project with rename and delete where allowed.

## Shell

A responsive web app previewed at the desktop viewport (`preview.viewport: desktop`):
- Below `sm`, and in phone or tablet device shells (`device-frame:`), the date range opens in a bottom sheet.
- Below `lg`, the sidebar is a drawer.
- The dashboard grid collapses to one column on narrow screens.
- Charts keep their keyboard model and their tooltips on tap; every chart also has "Show data table".

