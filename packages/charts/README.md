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
| `@protoyard/charts/scales` | `extent(values)`: `[min, max]` of the finite values, or `null` |
| `@protoyard/charts/shapes` | `roundCoord(value, digits?)`: stable coordinates for SVG paths |
| `@protoyard/charts/downsample` | `downsampleThreshold(plotWidthPx)`: points a line needs (2 per pixel, 200–4,000) |
| `@protoyard/charts/layout` | `plotArea(width, height, margin)`: the plot rectangle inside a frame |
| `@protoyard/charts/palette` | `CHART_TOKENS`, `seriesColor(index)`: `var(--py-chart1)` … `var(--py-chart5)`, cycling |

This is the package scaffold (PLAN_003 Task 5). Scales with ticks, path
generators, LTTB downsampling, treemap/sankey/funnel/calendar/gauge layouts
and validated palettes are added by the following PLAN_003 charts tasks; this
table lists only what exists.

## Rules

- Color comes only from theme variables (`--py-chart*`), so light/dark and
  every theme work without recomputation.
- No `Date.now()` or `Math.random()`: time and data come from the caller.

## Tests

```bash
pnpm vitest run packages/charts
pnpm --filter @protoyard/charts typecheck
```
