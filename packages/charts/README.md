# @protoyard/charts

Framework-agnostic chart math for Protoyard prototypes: scales, shapes,
downsampling, layouts and theme-token palettes. No Svelte and no third-party
chart library ([ADR-021](../../docs/DECISIONS.md)), so everything here is
plain TypeScript tested in Node. Svelte components live in
[`@protoyard/charts-ui`](../charts-ui/README.md).

## Entry points

`sideEffects: false`; import a subpath to pull in only that module.

| Import | Contents today |
| --- | --- |
| `@protoyard/charts` | Everything below plus the data contract types (`ChartPoint`, `ChartSeries`, `Extent`, `Margin`, `Rect`) |
| `@protoyard/charts/scales` | `linearScale`, `logScale`, `sqrtScale`, `timeScale` (UTC), `bandScale`, `pointScale`; `ticks`, `tickStep`, `niceDomain`, `timeTicks`, `chooseTimeInterval`, `floorTime`; formatters `formatNumber`, `formatCompact`, `formatTick`, `formatCents` (integer cents only), `formatPercent`, `formatTimeTick`, `formatDate`; `extent` |
| `@protoyard/charts/shapes` | `roundCoord(value, digits?)`: stable coordinates for SVG paths |
| `@protoyard/charts/downsample` | `largestTriangleThreeBuckets(points, threshold)` (keeps gaps, returns the input when small), `lttbIndices(xs, ys, threshold)` (plain or typed arrays), `minMaxBuckets(xs, ys, { buckets, x0?, x1? })` (first/min/max/last per pixel column, for canvas), `bisectX` / `bisectLeft` (O(log n) crosshair lookup), `downsampleThreshold(plotWidthPx)` (2 per pixel, 200–4,000) |
| `@protoyard/charts/layout` | `plotArea(width, height, margin)`: the plot rectangle inside a frame |
| `@protoyard/charts/palette` | `CHART_TOKENS`, `seriesColor(index)`: `var(--py-chart1)` … `var(--py-chart5)`, cycling |

Scales are complete (PLAN_003 `T-charts-scales`): the whole `./scales` module
is 3.1 KB gzip (esbuild, minified, gzip -9); a typical import of
`linearScale` + `ticks` + `formatCompact` is 0.9 KB. Downsampling is complete
(`T-charts-downsample`, 1.2 KB gzip for the whole `./downsample` module).
Measured in Node 26.11.1 on an Apple M1 Max (median of 9, three runs of
`PROTOYARD_BENCH=1 pnpm vitest run packages/charts/tests/downsample.test.ts`):
LTTB 10k → 1k points 0.29–0.71 ms, 100k → 2k 1.27–1.37 ms; min-max 100k
points into 1,600 columns 2.6–4.0 ms; 10,000 `bisectX` lookups on 100k
points 1.3–1.6 ms. Path
generators, treemap/sankey/funnel/calendar/gauge layouts
and validated palettes are added by the following PLAN_003 charts tasks; this
table lists only what exists.

## Rules

- Color comes only from theme variables (`--py-chart*`), so light/dark and
  every theme work without recomputation.
- No `Date.now()` or `Math.random()`: time and data come from the caller.
- Time scales, ticks and date formatters work in UTC, so labels do not move
  with the viewer's time zone or daylight saving. Formatters default to
  `en-US`; pass `locale` to change.
- `formatCents` throws on a non-integer: money is stored as integer cents.

```ts
import { formatCents, formatTimeTick, linearScale, timeScale } from '@protoyard/charts/scales';

const x = timeScale({ domain: [start, end], range: [0, width], nice: true });
const y = linearScale({ domain: [0, maxCents], range: [height, 0], nice: true });
const interval = x.tickInterval(6);
const xLabels = x.ticks(6).map((t) => formatTimeTick(t, interval));
const yLabels = y.ticks(5).map((v) => formatCents(Math.round(v), 'USD', { compact: true }));
```

## Tests

```bash
pnpm vitest run packages/charts
pnpm --filter @protoyard/charts typecheck
```
