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
| `@protoyard/charts/shapes` | `linePath(points, { curve, defined })` and `areaPath(points)` with `linear`, `monotone-x`, `step`, `step-before`, `step-after` curves and gaps; `stack(series, { offset: 'none' \| 'expand' \| 'diverging' })`, `stackExtent`, `groupOffsets(bandwidth, n, padding)`; `pie(values, { padAngle, sort })`, `arcPath({ innerRadius, outerRadius, startAngle, endAngle, cornerRadius, padAngle })`, `arcCentroid`; `symbolPath(type, x, y, area)` (circle, square, diamond, triangle, cross); `bin(values, { thresholds \| count, domain })` with Sturges default; `roundCoord` |
| `@protoyard/charts/downsample` | `largestTriangleThreeBuckets(points, threshold)` (keeps gaps, returns the input when small), `lttbIndices(xs, ys, threshold)` (plain or typed arrays), `minMaxBuckets(xs, ys, { buckets, x0?, x1? })` (first/min/max/last per pixel column, for canvas), `bisectX` / `bisectLeft` (O(log n) crosshair lookup), `downsampleThreshold(plotWidthPx)` (2 per pixel, 200–4,000) |
| `@protoyard/charts/layout` | `treemap(root, { width, height, padding, paddingTop })` (squarified; validates sums, `TreemapError`); `sankey(nodes, links, { width, height, nodeWidth, nodePadding, iterations })` (DAG only, `SankeyError` with `code: 'cycle' \| 'unknown-node' \| 'invalid-value' \| 'duplicate-node'`); `funnelLayout(steps, { width, height, orientation, gap })` (geometry + conversion/drop-off); `calendarLayout({ start, end }, { values, weekStartsOn })` (UTC week columns × weekday rows, missing days `null`); `matrixLayout(rows, cols, { width, height, gap })`; `gaugeLayout(value, { min, max, startAngle, endAngle, thresholds })`; `plotArea` |
| `@protoyard/charts/palette` | `chartPalette(themePalette, mode)` → 8 categorical + 9-step sequential + 9-step diverging hex colors, repaired to pass; `validateChartPalette()`; `chartPaletteVariables()` (`--py-chart1…8`, `--py-seq-1…9`, `--py-div-1…9` for a chart root); `readChartPaletteInput()`; `seriesColor(i)`, `sequentialColor(t)`, `divergingColor(t)`; color math (`contrastRatio`, OKLCH, `simulateDeficiency`) |

Scales are complete (PLAN_003 `T-charts-scales`): the whole `./scales` module
is 3.1 KB gzip (esbuild, minified, gzip -9); a typical import of
`linearScale` + `ticks` + `formatCompact` is 0.9 KB. Downsampling is complete
(`T-charts-downsample`, 1.2 KB gzip for the whole `./downsample` module).
Measured in Node 26.11.1 on an Apple M1 Max (median of 9, three runs of
`PROTOYARD_BENCH=1 pnpm vitest run packages/charts/tests/downsample.test.ts`):
LTTB 10k → 1k points 0.29–0.71 ms, 100k → 2k 1.27–1.37 ms; min-max 100k
points into 1,600 columns 2.6–4.0 ms; 10,000 `bisectX` lookups on 100k
points 1.3–1.6 ms. Shapes are complete (`T-charts-shapes`): the whole
`./shapes` module is 2.9 KB gzip; `linePath` + `areaPath` + `stack` alone
are 1.1 KB, `pie` + `arcPath` 0.9 KB. Shapes work in pixel space (scale the
data first), use radians clockwise from 12 o'clock for arcs, round every
coordinate to two decimals, and treat `null`/`NaN` y values as gaps (lines
break, never drop to 0). Layouts are complete (`T-charts-layouts`), each
tree-shaken on its own: treemap 1.0 KB, sankey 1.5 KB, funnel 0.4 KB,
calendar + matrix 0.7 KB, gauge 0.4 KB gzip (3.5 KB for all). The sankey
puts nodes in columns by longest path from the sources, sinks in the last
column, then runs six relaxation passes. Node heights equal their flow on
both sides. Gauge angles use the `arcPath` convention, so its bands and value
arc draw directly with `arcPath`.

### Chart palettes

`chartPalette()` starts from the theme's `chart1…chart5` and adds three hues
placed as far as possible from them. Every color that marks data is checked
and, when needed, repaired by moving lightness only, so hues stay
recognizable:

| Check | Rule |
| --- | --- |
| Contrast | Every categorical color and each ramp's data end ≥ 3:1 against `surface` and `background` (WCAG 1.4.11) |
| Distinct | Any two categorical colors ≥ 0.08 apart in OKLab |
| Colour vision | Any two categorical colors ≥ 0.04 apart under simulated protanopia and deuteranopia (Machado et al. 2009) |
| Ramps | Sequential lightness moves monotonically toward the data end; diverging has a neutral midpoint |

Gray tokens (a monochrome theme) can only differ in lightness. When they end
up too close, they are spread evenly over the lightness band that keeps 3:1.
`palette.repaired` names the theme tokens that were changed. Every built-in
and library theme passes in both modes after repair
(`pnpm vitest run packages/charts/tests/palette.test.ts` prints the repair
list). Color alone never identifies a series: legends and labels stay
required.

Size and speed: building a palette costs 2.9 KB gzip (`chartPalette` +
`chartPaletteVariables` + `seriesColor`; the whole module with validation is
3.6 KB). `seriesColor`/`sequentialColor` alone are 0.3 KB. One palette takes
about 0.3 ms median and up to 1.5 ms after warm-up in Node (Apple M1 Max).
Compute it once per appearance change, not per render.

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
