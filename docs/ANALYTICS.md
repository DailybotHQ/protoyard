# Analytics

Everything a prototype needs to look and behave like a product-analytics or
dashboard app, on simulated data ([ADR-021](DECISIONS.md)):

| Layer | Package | What |
| --- | --- | --- |
| Engine | [`@protoyard/analytics`](../packages/analytics/README.md) | Date ranges and comparison, bucketing, aggregates and deltas, filters and segments, funnels, retention, dashboard layouts. Plain TypeScript + zod. |
| Generators | `@protoyard/analytics/generators` | Deterministic time series, product events, funnel journeys, cohorts, live-counter timelines and scenario fragments (launch spike, outage, seasonal, empty, massive) |
| Views | [`@protoyard/analytics-ui`](../packages/analytics-ui/README.md) | KPI tiles and live counters, date range picker, filter builder and segments, dashboard grid, drill-down, cohort table, funnel analysis (Svelte 5, one subpath per view) |
| Charts | [`@protoyard/charts-ui`](../packages/charts-ui/README.md) | Every chart the views draw. See [CHARTS](CHARTS.md). |
| Starter | [`templates/analytics`](../templates/analytics/README.md) | `pnpm protoyard new my-idea --template analytics` |
| Flagship | [`prototypes/pebblestat-analytics-demo`](../prototypes/pebblestat-analytics-demo/README.md) | Projects, reports, alerts, annotations, sampling at enterprise scale |

Everything is simulated: events come from scenarios and the timeline, "now"
is the simulated clock, and roles are a UX simulation, not security.

## The data flow

```text
scenario (presets + analyticsFragments)
  → generator (generateProductEvents, …; ctx.rng forks, ctx.ids, reference time)
  → Dexie tables (events indexed on [type+at] and at)
  → liveQuery(querier, { initial, deps: () => [range, filter, …] })
  → pure read model (bucketize, compileFilter, computeFunnel, computeRetention)
  → analytics-ui views and charts-ui charts (lazy routes)
```

Mutations (save a layout, a segment, a report) go through services:
UI → service → `session.assert` → zod (`DashboardLayoutSchema`,
`filterSchemaFor(catalog)`) → `environment.run` → `db.transaction`. The views
never write: they call a callback that returns the service promise, so
Buttons and the grid show pending feedback.

## Engine

`@protoyard/analytics`, all in UTC with "now" passed in:

- **Ranges:** `resolveDateRange(input, now)` for nine presets or custom
  days and instants (half-open `[start, end)`), plus
  `comparisonRange(range, 'previous-period' | 'previous-year')`.
- **Buckets:** `bucketize(rows, { range, granularity, at, aggregate, value })`
  fills every bucket, empty ones included. Empty buckets are 0 for counts and
  `null` for averages. More than 10,000 buckets throws.
- **Aggregates:** `count`, `sum`, `unique`, `avg`, `min`, `max`, `p50`,
  `p90`, `p95`. `delta()` is `null` for a previous value of 0, never ∞.
- **Filters:** data-only AND/OR trees up to 4 levels with 14 operators.
  - `filterSchemaFor(catalog)` turns unknown properties and wrong operators into field errors.
  - `compileFilter` builds the predicate.
  - Paths reject `__proto__`, `prototype` and `constructor`.
- **Funnels:** `computeFunnel(events, steps, { window, breakdown, range })`
  returns counts, conversions, drop-off and the median time to convert, per
  step and per breakdown value.
- **Retention:** `computeRetention(events, { cohortEvent, returnEvent, interval, periods, now, mode })`.
  - `mode` is `bounded` (active in period) or `unbounded` (not yet churned).
  - Unfinished periods are marked `incomplete`.
- **Layouts:** `DashboardLayoutSchema` (12 columns), `compactLayout`,
  `moveWidget`, `resizeWidget`.

Exact semantics: [analytics README](../packages/analytics/README.md).

## Generators

`@protoyard/analytics/generators` uses only the scenario context, so the
same seed always gives the same world. The table and an example are in
[SCENARIOS → Analytics data](SCENARIOS.md#analytics-data).

- `generateProductEvents` gives a power-law number of sessions per user,
  weighted event types, quiet weekends when the scenario is weekly, and user
  properties on every event.
- `liveCounterEvents` builds timeline events that do not depend on the
  window: advancing a week at once yields the same events, with the same
  ids, as advancing seven times by a day.
- Spikes and outages shape `generateTimeSeries`. Event streams do not apply
  them by themselves: the template and the flagship add a launch wave and
  thin events inside an outage (see their `generators.ts`).

## Views (`@protoyard/analytics-ui`)

Each view is its own subpath, so a screen pays only for what it imports.

| Import | Components | Key props |
| --- | --- | --- |
| `@protoyard/analytics-ui` | `KpiTile`, `KpiRow`, `LiveCounter`; `formatKpi`, `kpiDelta` | `KpiTile`: `label`, `value`, `unit` (`number`, `compact`, `percent`, `cents`), `previous`, `positive`, `trend`, `trendPeriod`, `href`, `loading`, `empty`. `LiveCounter`: `label`, `query` (a liveQuery), `duration`, `announceEvery` |
| `…/date-range` | `DateRangePicker`, `DateRangePanel`, `MonthGrid` | `value: { range, comparison, granularity }`, `now`, `onchange(value, change)`; `toDateRangeQuery` / `fromDateRangeQuery` for the hash |
| `…/filters` | `FilterBuilder`, `FilterGroupEditor`, `SegmentPicker`, `BreakdownSelect` | `properties: { path, label, type, options? }[]`, `value` / `filter`, `onchange`, `onsave` (returns the service promise; field errors render inline) |
| `…/grid` | `DashboardGrid`, `WidgetCard` | `layout`, `label`, `editing`, `onchange(layout)` (returns the save promise; reverts on rejection), `widget` snippet, `collapseBelow`. `WidgetCard`: `title`, `description`, `menu`, states, `expandable` |
| `…/drill` | `DrillDown`; `drillStep`, `pushDrill`, `truncateDrill`, `drillFilter`, `toDrillQuery`, `fromDrillQuery` | `rows`, `columns`, `getRowId`, `path` (data, round-trips the hash), `onchange`, `chart` snippet (`drill(step)` from `onselect`), `base`, `pageSize` |
| `…/cohort` | `CohortTable` | `title`, `result` (from `computeRetention`), `display` (`percent`, `count`), `palette`, `description` |
| `…/funnel` | `FunnelAnalysis` | `title`, `result` (from `computeFunnel`), `selected` (breakdown, bindable), `breakdownLabel`, `orientation`, `onstepselect` |

Accessibility:
- KPI tiles are articles named by their label; the delta reads its direction first.
- The grid can be moved and resized by keyboard, with live announcements.
- The drill breadcrumb is a `nav` with `aria-current`.
- The cohort table has scoped headers, and its cell text is shown only where it reaches 4.5:1.
- Toggles use `aria-pressed`.

## Build an analytics prototype

```bash
pnpm protoyard new my-analytics --template analytics
pnpm protoyard dev my-analytics
pnpm vitest run prototypes/my-analytics
pnpm protoyard scenario bench my-analytics --check
pnpm protoyard budget my-analytics
```

The template ships six screens (Overview, Trends, Funnels, Retention, Live,
Segments) and six scenarios (`empty`, `active`, `launch-spike`, `outage`,
`massive`, `viewer`). To add a dashboard to a prototype step by step, use the
[`add-dashboard` skill](../.agents/skills/add-dashboard/SKILL.md).

## The flagship: Pebblestat Analytics

`prototypes/pebblestat-analytics-demo` is fictional Mixpanel-style product
analytics built from the template:
- two projects (Web, Mobile);
- Insights with a comparison period and totals per breakdown;
- a user explorer with a hash-restorable drill-down;
- saved reports and segments;
- daily metric alerts that fire as simulated time advances;
- release, incident and campaign annotations;
- owner, analyst and viewer personas.

Its specs (AGENTS.md, docs/) describe every flow.

**Enterprise scale is sampled, and says so.**
- 100,000 raw events, or even the plan's 20,000-event sample, cannot be
  generated inside the 50 ms scenario budget.
- So `enterprise-scale` stores daily rollups (about 100k events) plus a 5 %
  user sample (about 5,000 raw events).
- Event totals come from the rollups, and user counts are estimates labelled
  "(est.)".

## Measured numbers

On the Apple M1 Max, Node 26.11.1, headless Chromium 156, 2026-10-19, under
heavy shared load (load average 60–140): upper bounds.

| What | Measured | Budget |
| --- | ---: | ---: |
| Generators: 90 days × 10 metrics + ~19k events from 2,000 users (Node, median) | 26–33 ms | < 50 ms |
| Funnel over 100k events from 10k users, with a breakdown (Node, median) | 27–45 ms | < 50 ms |
| Weekly retention over the same events | 30–32 ms | — |
| Template scenarios (`scenario bench`, slowest: `massive`, ~10k rows) | 36–38 ms | < 50 ms |
| Flagship scenarios (slowest: `launch-day`, 4.5k rows; `enterprise-scale` 16 ms) | 19–23 ms | < 50 ms |
| Template initial JS (gzip) | 191.8 KB | ≤ 210 KB (plan), 250 KB |
| Flagship initial JS (gzip) | 207.4 KB | ≤ 210 KB (plan), 250 KB |
| Flagship `enterprise-scale` dashboard, first visit (generate + render) | ~1.0 s, 0 long tasks | 0 long tasks > 200 ms |

View sizes (esbuild, gzip, with `svelte`, `@protoyard/ui` and the engine
treated as external):

| View | Gzip |
| --- | ---: |
| KpiTile (with its Sparkline) | 5.1 KB |
| LiveCounter | 1.3 KB |
| FilterBuilder | 4.6 KB |
| SegmentPicker | 2.0 KB |
| Date range picker | 4.3 KB |
| DashboardGrid + WidgetCard | 3.6 KB |
| DrillDown | 1.3 KB |
| CohortTable | 2.7 KB |
| FunnelAnalysis | 2.0 KB |

## Limits (honest)

- No ingestion: no SDK, API or warehouse. Events exist only in scenarios and
  the timeline.
- Aggregation runs in the browser over IndexedDB rows. That is fine up to
  tens of thousands of events per screen, which is why enterprise scale is
  sampled.
- No alert delivery (email, Slack), no scheduled reports, no sharing.
- Annotations are a strip under the charts, not marks on the plot (charts-ui
  has no annotation layer yet).
- The date range is shared per tab in memory. The drill path is in the hash;
  the range is not.

## Tests

```bash
pnpm vitest run packages/analytics packages/analytics-ui
PROTOYARD_BENCH=1 pnpm vitest run packages/analytics/tests/generators.test.ts   # opt-in generation budget
pnpm vitest run templates/analytics prototypes/pebblestat-analytics-demo
PROTOYARD_E2E_PROTOTYPES=pebblestat-analytics-demo,analytics pnpm test:e2e tests/e2e/pebblestat-analytics-demo.spec.ts tests/e2e/layout-fit.spec.ts
```
