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
| `@protoyard/analytics/funnel` | `FunnelStepSchema`, `FunnelDefinitionSchema` (2–12 steps, unique ids) |
| `@protoyard/analytics/cohort` | `RetentionIntervalSchema`, `RetentionPeriodsSchema` |

**Status:** the engine (ranges, buckets, aggregates, deltas, filters) is
complete (`T-analytics-engine`). Funnel and cohort computations and the
generators come with the following PLAN_003 analytics tasks; this table lists
only what exists.

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
