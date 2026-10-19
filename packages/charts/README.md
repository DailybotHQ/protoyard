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
| `@protoyard/charts/downsample` | `downsampleThreshold(plotWidthPx)`: points a line needs (2 per pixel, 200–4,000) |
| `@protoyard/charts/layout` | `plotArea(width, height, margin)`: the plot rectangle inside a frame |
| `@protoyard/charts/palette` | `CHART_TOKENS`, `seriesColor(index)`: `var(--py-chart1)` … `var(--py-chart5)`, cycling |

Scales are complete (PLAN_003 `T-charts-scales`): the whole `./scales` module
is 3.1 KB gzip (esbuild, minified, gzip -9); a typical import of
`linearScale` + `ticks` + `formatCompact` is 0.9 KB. Path
generators, LTTB downsampling, treemap/sankey/funnel/calendar/gauge layouts
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
