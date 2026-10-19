# @protoyard/analytics

Framework-agnostic analytics engine for Protoyard prototypes
([ADR-021](../../docs/DECISIONS.md)): event and metric contracts, and (as the
PLAN_003 analytics tasks land) date ranges with comparison, bucketing,
aggregations, filters and segments, funnels, cohorts and deterministic
analytics generators. No Svelte; everything is plain TypeScript and zod,
tested in Node. The Svelte kit is [`@protoyard/analytics-ui`](../analytics-ui/README.md).

## Entry points

`sideEffects: false`; import a subpath to pull in only that module.

| Import | Contents today |
| --- | --- |
| `@protoyard/analytics` | `AnalyticsEventSchema` (id, lowercase `type`, `userId`, ISO `at`, primitive `properties`), `GranularitySchema` (`hour`/`day`/`week`/`month`), `MetricPoint` |
| `@protoyard/analytics` (ranges) | `resolveDateRange(input, now)` for presets `today`, `yesterday`, `last-7-days`, `last-30-days`, `last-90-days`, `month-to-date`, `quarter-to-date`, `year-to-date`, `last-month`, or custom days (inclusive) / instants (half-open); `comparisonRange(range, 'previous-period' \| 'previous-year')`; `DateRangeInputSchema`, `ComparisonSchema`, `PRESET_LABELS` |
| `@protoyard/analytics` (buckets) | `bucketStart`, `nextBucket`, `bucketStarts(range, granularity, { weekStartsOn })`, `bucketize(rows, { range, granularity, at, aggregate, value })` → every bucket, empty ones included |
| `@protoyard/analytics` (aggregates) | `aggregate(values, kind)` for `count`, `sum`, `unique`, `avg`, `min`, `max`, `p50`, `p90`, `p95`; `percentile` (linear interpolation); `createAccumulator`; `delta(current, previous)` → `{ absolute, relative }` |
| `@protoyard/analytics` (filters) | `FilterSchema` / `SegmentSchema` (data-only AND/OR trees, up to 4 levels), 14 operators with `OPERATORS_BY_TYPE`, `filterSchemaFor(catalog)` (unknown properties and type-mismatched operators become field errors), `compileFilter(filter)` → `(row) => boolean`, `readProperty` |
| `@protoyard/analytics` (layouts) | `DashboardWidgetSchema` / `DashboardLayoutSchema` (`{ id, widget, title?, x, y, w, h }` on 12 columns), `compactLayout` (no overlaps, upward gravity), `moveWidget(layout, id, 'up' \| 'down' \| 'left' \| 'right')`, `resizeWidget(layout, id, { dw, dh })`, `readingOrder`, `layoutRows` |
| `@protoyard/analytics/generators` | `ANALYTICS_GENERATOR_VERSION` |
| `@protoyard/analytics/funnel` | `FunnelStepSchema`, `FunnelDefinitionSchema` (2–12 steps, unique ids); `computeFunnel(events, steps, { window, breakdown, range })` → per-step `count`, `conversion`, `stepConversion`, `dropOff`, `medianTimeToConvert`, plus a `breakdown` per property value; `eventsByUser` |
| `@protoyard/analytics/cohort` | `RetentionIntervalSchema`, `RetentionPeriodsSchema`; `computeRetention(events, { cohortEvent, returnEvent, interval, periods, now, mode })` → cohorts × periods with `count`, `rate`, `incomplete`, plus size-weighted `average` |

**Status:** the engine (ranges, buckets, aggregates, deltas, filters,
layouts) and the funnel and retention computations are complete
(`T-analytics-engine`, `T-analytics-funnel-cohort`). The generators come with
the analytics-generators task; this table lists only what exists.

Funnels and retention, precisely:

- **Funnel:** a user enters at their earliest first-step event. Each later
  step must be a later event (in time order) within `window` ms of
  entering; steps out of order do not count. `medianTimeToConvert` is the
  median time from the previous step. `breakdown` reads a property path on
  the entry event; users without it fall in `(none)`.
- **Retention:** a user's cohort is the UTC bucket (day, week from
  `weekStartsOn`, or month) of their `cohortEvent`, or of their first
  event. Period N is the Nth bucket after it.
  - `bounded` (the default) counts users active during period N.
  - `unbounded` counts users active in period N or any later one (not
    churned yet), so rates never rise.
  - A period that has not finished at `now` is `incomplete`. One that has
    not started has `count: null`.
  - `average` weighs complete cells by cohort size.

Speed: a funnel over 100k events from 10k users (with a breakdown) takes a
median of 27–45 ms, and weekly retention over the same events 30–32 ms, in
Node on the Apple M1 Max under heavy machine load. `PROTOYARD_BENCH=1`
asserts the 50 ms funnel budget. Size: `computeFunnel` 1.9 KB,
`computeRetention` 1.6 KB gzip (zod external).

Semantics worth knowing:

- Ranges are half-open `[start, end)` in UTC epoch ms. "Last N days" is
  today plus the N − 1 days before it, ending at `now`. "To date" presets
  also end at `now`; `yesterday` and `last-month` end at their calendar
  boundary. Previous year clamps Feb 29 to Feb 28.
- Empty buckets are `0` for count/sum/unique and `null` for
  avg/min/max/percentiles (nothing to measure). More than 10,000 buckets
  throws a `RangeError` (use a coarser granularity).
- `delta().relative` is `null` when the previous value is 0, so a tile
  never shows "+∞%".
- Filters are data: missing, `null` and `''` count as "not set"; `neq` and
  `not_in` match rows without the property; text operators ignore case;
  ISO date strings compare by time. Paths only read own properties, and
  `__proto__`/`prototype`/`constructor` segments are rejected.

Size (esbuild minify + gzip -9, zod external): the whole entry is 3.8 KB;
ranges + buckets + delta are 1.8 KB, filters 1.5 KB. `bucketize` puts 50k
events into 90 daily buckets in about 5.5 ms in Node (Apple M1 Max, under
heavy machine load). The opt-in analytics generators bench owns the
10 ms budget.

## Rules

- "Now" always comes from the caller (the simulated clock), never `Date.now()`.
- Generators use only the scenario context (`ctx.rng`, `ctx.ids`, `ctx.time`,
  `ctx.scale`) and bump `ANALYTICS_GENERATOR_VERSION` when output changes.
- Bucketing is UTC. Money is integer cents.

## Tests

```bash
pnpm vitest run packages/analytics
pnpm --filter @protoyard/analytics typecheck
```
