# @protoyard/analytics-ui

Svelte 5 analytics kit for Protoyard prototypes
([ADR-021](../../docs/DECISIONS.md)), built on
[`@protoyard/analytics`](../analytics/README.md), Texuli 0.5.0 (`texuli/stat`,
`texuli/date`, `texuli/select`, `texuli/toggle`,
`@texuli/data/filter-builder`, `@texuli/charts/compact` and
`@texuli/charts/matrix`),
[`@protoyard/charts-ui`](../charts-ui/README.md) and `@protoyard/ui`. Each
view has its own subpath, so a prototype pays only for the views its screens
import. Nothing here is re-exported from the `@protoyard/ui` barrel.

The platform guide is [docs/ANALYTICS.md](../../docs/ANALYTICS.md). Working
examples:
- [`templates/analytics`](../../templates/analytics/README.md): every view on
  lazy routes, as a starter;
- [`prototypes/pebblestat-analytics-demo`](../../prototypes/pebblestat-analytics-demo/README.md):
  the flagship.

## Install in a workspace prototype

Add `"@protoyard/analytics-ui": "workspace:*"` to the prototype dependencies
and import the styles after Tailwind and the theme, UI and charts styles:

```css
@import 'tailwindcss';
@import '@protoyard/themes/base.css';
@import '@protoyard/ui/styles.css';
@import '@protoyard/charts-ui/styles.css';
@import '@protoyard/analytics-ui/styles.css';
```

## Entry points

| Import | View |
| --- | --- |
| `@protoyard/analytics-ui` | `KpiTile`, `KpiRow`, `LiveCounter`, `formatKpi`, `kpiDelta`; `ANALYTICS_VIEWS` and the data contract types (imports no view) |
| `@protoyard/analytics-ui/date-range` | `DateRangePicker`, `DateRangePanel`, `MonthGrid`; `toDateRangeQuery` / `fromDateRangeQuery`, `allowedGranularities`, `fitGranularity`, `describeDateRange` |
| `@protoyard/analytics-ui/filters` | `FilterBuilder`, `FilterGroupEditor`, `SegmentPicker`, `BreakdownSelect`; `describeFilter`, `validateFilter`, `saveErrorOf` |
| `@protoyard/analytics-ui/cohort` | `CohortTable`; `formatRate`, `cohortLabel`, `periodLabel`, `readSequentialRamp` |
| `@protoyard/analytics-ui/funnel` | `FunnelAnalysis`; `funnelSeries`, `formatConversion`, `formatDuration` |
| `@protoyard/analytics-ui/grid` | `DashboardGrid`, `WidgetCard` (and the layout helpers from `@protoyard/analytics`) |
| `@protoyard/analytics-ui/drill` | `DrillDown`; `drillStep`, `pushDrill`, `truncateDrill`, `drillFilter`, `toDrillQuery` / `fromDrillQuery` |

Every mutation (save a segment, move a widget) is a callback that returns the
prototype's service promise, so a `Button` shows pending feedback; the kit
never writes to the database itself.

## KPI tiles and live counters (root entry)

KPI tiles are small enough for a first screen, so they live on the root
entry; every view stays on its subpath.

```svelte
<KpiRow label="Key metrics">
  <KpiTile label="Signups" value={now.signups} previous={before.signups} trend={series} trendPeriod="30 days" href="#/insights/signups" />
  <KpiTile label="Churn" value={0.031} previous={0.04} unit="percent" positive="down" />
  <KpiTile label="MRR" value={1_245_000} previous={1_180_000} unit="cents" />
</KpiRow>
<LiveCounter label="Active users" query={activeUsers} />
```

- **`KpiTile`** adapts `texuli/stat` `Kpi` and `@texuli/charts/compact` `Sparkline`, formatting the value by unit (`number`, `compact`, `percent` ratios,
  `cents` = integer cents).
  - The delta comes from `previous`: a signed percentage, or the signed absolute
    change when the previous value is 0.
  - Tone and wording come from the same helpers as `@protoyard/ui` `StatCard`
    (`resolveTrend`, `trendTone`, `trendWord`): success when the change goes the
    `positive` way, destructive otherwise, with "Increased / Decreased / No
    change:" read first.
  - An optional Sparkline speaks its trend sentence. `href` makes the whole
    tile a drill-down link named by the label and described by the value.
  - `loading` shows a skeleton with `aria-busy`; `empty` shows "—" and a
    message.
- **`KpiRow`** adapts `texuli/stat` `KpiRow`; `min` maps to `minItemWidth`
  (default `12rem`) so the library owns responsive wrapping.
- **`LiveCounter`** follows a liveQuery result (`query.current`) and never
  writes data; new values arrive from timeline events.
  - It renders through Texuli `Kpi`, counts up visually over `duration`, or
    shows the value at once under reduced motion (`data-tx-motion="reduce"`).
  - Its polite live region speaks at most once per `announceEvery` (5 s),
    always with the latest value.

KPI number formatting and trend calculation re-export `texuli/stat` directly.
Lucide glyphs are rendered only through `texuli/icons/lucide`'s `LucideIcon`
bridge; raw Lucide components are never placed in markup.

## Filters and segments (`./filters`)

Filters are data: `FilterBuilder` edits and emits a `FilterGroup` (the
`FilterSchema` of `@protoyard/analytics`). The prototype stores it and runs
`compileFilter(filter)` over its rows. Properties come from a catalog that
the prototype declares:

```ts
const properties: FilterProperty[] = [
  { path: 'properties.plan', label: 'Plan', type: 'string', options: [{ value: 'pro', label: 'Pro' }] },
  { path: 'properties.seats', label: 'Seats', type: 'number' },
];
```

- **`FilterBuilder`:** Texuli's `@texuli/data/filter-builder` with the
  property catalog: match all/any, rows of field / operator / value as
  native controls, and nested groups up to three levels deep. Operators
  follow the property type, in `OPERATORS_BY_TYPE` order; the ones Texuli
  does not ship (greater/less than, at least/most, does not contain, starts
  with, is none of, on or after/before) are catalog operators
  (`BUILDER_OPERATORS`). Values include number, date, Yes/No, a choice or
  a multi-select for known options (shown by label), comma-separated text
  for lists, two inputs for "between".
  - "Apply filters" validates against the catalog: unknown properties,
    operators that do not fit the type and missing values are listed under
    the builder by condition ("Condition 1: Enter a value"). Only valid data
    reaches `onchange`. Texuli's builder marks values that do not fit a
    field itself; it takes no host issues, so Protoyard's are listed
    instead of marked on the control (a Texuli gap; the lead assigns its id).
  - A one-line summary reads "Plan is Pro and Seats at least 5".
- **`SegmentPicker`:** saved segments as `aria-pressed` chips ("Everyone"
  clears) and a "Save current filter as a segment" form.
  - `onsave({ name, filter })` must return the service promise, for example
    `runService(() => saveSegment(runtime, input))`. The `Button` shows
    pending feedback until it settles.
  - A resolved `{ ok: false, error }` or a rejection shows inline: field
    issues next to the name, a permission error as "Your role can't save
    segments". `runService` still shows its toast.
- **`BreakdownSelect`:** "Break down by" over string and boolean
  properties, or None.

**Why not `@protoyard/ui` `FilterBar`?** FilterBar filters list rows by flat
per-field values (`FilterValues`) for CRUD screens. Analytics filters are
nested AND/OR trees that are saved as segments and validated against a
property catalog, so they need this data-first builder. `FilterGroupEditor`
renders Texuli's `@texuli/data/filter-builder` with that catalog (fields,
per-type operator lists and catalog operators, G49) and converts its model
to and from `@protoyard/analytics` `FilterGroup` (`toBuilderFilter`,
`fromBuilderFilter`); validation and the compiled predicate stay
`@protoyard/analytics`. Use FilterBar for entity lists and FilterBuilder for
analytics queries.

Pre-migration size estimates (esbuild minify + gzip -9; svelte, @protoyard/ui, @protoyard/analytics
and zod external), each imported from the subpath: FilterBuilder 4.6 KB (5.5 KB
with the analytics filter code it validates with), SegmentPicker 2.0 KB,
BreakdownSelect 0.7 KB. Like charts-ui, analytics-ui marks only CSS as
side-effectful, so a screen pays only for the components it imports.

## Date range (`./date-range`)

`DateRangePicker` edits a `DateRangeValue` (`{ range, comparison,
granularity }`, where `range` is a preset or custom days from
`@protoyard/analytics`). It always works from a caller-supplied `now`, so it
follows the simulated clock:

```svelte
<script lang="ts">
  const clock = useClock();
  let value = $state(fromDateRangeQuery(location.hash.split('?')[1] ?? ''));
</script>

<DateRangePicker {value} now={clock.now} onchange={(next) => { value = next; navigate(`#/insights?${toDateRangeQuery(next)}`); }} />
```

- **Trigger:** an outline `Button` reading "Last 30 days vs previous
  period", opening a `Popover`.
- **Presets:** today through last month, as `aria-pressed` buttons. Picking
  one emits at once and closes the popover.
- **Custom range:** the month view is rendered by `texuli/date` `Calendar`.
  The adapter supplies the simulated maximum and today, week start, selected
  range highlighting, and the 3,660-day limit. Presets, comparison and Apply
  behavior remain Protoyard-owned.
- **Compare to** none, previous period or previous year, and **Group by**
  hour/day/week/month: segmented `aria-pressed` buttons. Granularities that
  do not fit the span (hourly over a year, monthly over a week) are
  disabled, and a range change refits the granularity.
- **Query:** `toDateRangeQuery` writes `range=last-30-days&compare=previous-period&by=day`
  (custom: `range=2026-03-01..2026-03-07`); `fromDateRangeQuery` reads it back,
  ignoring invalid parts. It fits `by=` to the range (`fitGranularity`; pass
  `now` to fit presets too), and custom ranges span at most
  `MAX_CUSTOM_RANGE_DAYS` (3,660 days), so a shared link cannot request more
  than `MAX_BUCKETS` buckets.

The date adapter consumes Texuli's keyboard-accessible range Calendar and
keeps only Protoyard's analytics-specific preset, comparison and granularity
controls around it.

## Dashboard grid (`./grid`)

`DashboardGrid` lays out widgets from a layout stored as data
(`DashboardLayoutSchema` in `@protoyard/analytics`). It is page content
inside whatever app shell the prototype uses, not a shell itself.

```svelte
<DashboardGrid {layout} label="Growth" editing={editing} onchange={(next) => runService(() => saveLayout(next))}>
  {#snippet widget(item)}
    <WidgetCard title={item.title ?? item.widget} menu={menuFor(item)}>
      {#snippet children({ expanded })}<RevenueChart {expanded} />{/snippet}
    </WidgetCard>
  {/snippet}
</DashboardGrid>
```

- **Layout:** 12 columns, `rowHeight` per row unit (default 80 px), `gap`.
  Below `collapseBelow` container width (default 640 px), measured with
  `ResizeObserver` so it also works inside a phone shell, the grid becomes
  one column in reading order (row, then column). The DOM is always in
  reading order.
- **Editing:** each widget gets a toolbar: a handle button that takes arrow
  keys (move) and Shift + arrow keys (resize), plus move, wider/narrower and
  taller/shorter buttons. Up and down swap with the nearest widget in the
  same columns; left and right shift one column; neighbours make room and
  everything compacts upward. Focus stays on the moved widget's handle and a
  polite live region announces the new position.
- **Saving:** every edit calls `onchange(layout)`. Return the service
  promise: the grid shows the change at once, is `aria-busy` with its
  buttons in their loading state until the promise settles, and restores
  the previous layout if it rejects. When the saved `layout` prop changes
  (liveQuery, scenario load), the grid follows it.
- **WidgetCard:** a titled `section` with an optional actions menu
  (`DropdownMenu`), loading/empty/error states (retry with pending
  feedback), and an Expand button that opens the same content in a large
  dialog (`children` receives `{ expanded }`).

Pre-migration size estimate (esbuild minify + gzip -9, `svelte` and `@protoyard/ui` external since
prototypes already ship them): `DashboardGrid` + `WidgetCard` 3.6 KB, or
4.3 KB with the layout engine. Widgets load their chart chunks themselves.

## Explore: drill-down, cohorts, funnels (`./drill`, `./cohort`, `./funnel`)

```svelte
<DrillDown title="Tickets" {rows} {columns} getRowId={(r) => r.id} {path} onchange={(p) => go(`#/tickets?${toDrillQuery(p)}`)}>
  {#snippet chart({ drill })}
    <BarChart title="Tickets by priority" {series} onselect={(s) => drill(drillStep('priority', s.datum.priority))} />
  {/snippet}
</DrillDown>
<CohortTable title="Weekly retention" result={computeRetention(events, { interval: 'week', periods: 8, now })} />
<FunnelAnalysis title="Activation" result={computeFunnel(events, steps, { breakdown: 'properties.plan' })} breakdownLabel="Plan" />
```

- **`DrillDown`**: the chart snippet calls `drill(step)` from its `onselect`;
  the rows matching the path (ANDed with an optional `base` filter, via
  `compileFilter`) fill a `DataTable`, and a breadcrumb `nav` walks back
  (`aria-current` on the last step, a polite row count).
  - The path is data (`{ steps: [{ label, filter }] }`). `toDrillQuery` /
    `fromDrillQuery` round-trip it through the hash query, so a reload or a
    shared link restores it. The parser validates every filter with
    `FilterConditionSchema` and drops anything else (the query is untrusted).
  - A step on a property already in the path replaces it and drops the
    steps after it.
- **`CohortTable`**: a real `<table>` with a caption, `scope="col"` period
  headers, `scope="row"` cohort headers and an average row.
  Its fills and text colors come from `@texuli/data/cohort`
  `resolveHeatScale` and `heatLevel` (G51); the semantic row/period layout,
  the %/count toggle and the incomplete marks stay Protoyard-owned.
  - Cells use the theme's sequential ramp (`--tx-chart-sequential-*`, or a
    `palette` prop). Texuli checks each hex step and pairs it with the text
    color that reaches 4.5:1 on it, so every number sits on its fill. Without
    a hex ramp (or one Texuli refuses) cells keep the token fill and the value
    sits on a surface chip, so contrast never depends on a guess.
  - The % / Count toggle uses `aria-pressed` buttons and is bindable
    (`display`). Incomplete periods are outlined and marked with an asterisk
    and "(incomplete)" for screen readers. Period 0 is unfilled because it is
    always 100%.
- **`FunnelAnalysis`**: a `FunnelChart` plus a step table (users, overall
  conversion, conversion from the previous step, drop-off, median time to
  convert).
  - With a breakdown, `aria-pressed` buttons (each with its overall
    conversion) switch the chart and the table to that series. `selected` is
    bindable, and `onstepselect` passes the clicked step on (for example, to
    a `DrillDown`).

Pre-migration size estimates (esbuild minify + gzip -9; svelte, `@protoyard/ui`, charts and analytics
external): DrillDown 1.3 KB (2.7 KB with its filter code, zod external),
CohortTable 2.7 KB, FunnelAnalysis 2.0 KB. All are under the 6 KB budget
beyond the charts they use.

## Tests

```bash
pnpm vitest run packages/analytics-ui
pnpm --filter @protoyard/analytics-ui typecheck
```

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.
