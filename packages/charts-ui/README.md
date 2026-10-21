# @protoyard/charts-ui

Svelte 5 chart components for Protoyard prototypes, built on
[`@protoyard/charts`](../charts/README.md) with no third-party chart library
([ADR-021](../../docs/DECISIONS.md)). Each chart family has its own subpath,
so a prototype pays only for the families its screens import. Nothing here is
re-exported from the `@protoyard/ui` barrel.

## Install in a workspace prototype

Add `"@protoyard/charts-ui": "workspace:*"` to the prototype dependencies and
import the styles after Tailwind and the theme/UI styles:

```css
@import 'tailwindcss';
@import '@protoyard/themes/base.css';
@import '@protoyard/ui/styles.css';
@import '@protoyard/charts-ui/styles.css';
```

## Entry points

| Import | Family |
| --- | --- |
| `@protoyard/charts-ui` | `CHART_FAMILIES` and the data contract types only (imports no family) |
| `@protoyard/charts-ui/cartesian` | Line, area, bar, combo, scatter |
| `@protoyard/charts-ui/part-whole` | Pie, donut, funnel, treemap, sankey |
| `@protoyard/charts-ui/matrix` | Histogram, heatmap, calendar heatmap |
| `@protoyard/charts-ui/compact` | Sparkline, gauge, radial progress |
| `@protoyard/charts-ui/canvas` | Canvas renderer for dense series |
| `@protoyard/charts-ui/geo` | Tile-grid choropleth |

What each subpath ships:
- `./cartesian`: LineChart, AreaChart, BarChart, ComboChart, ScatterChart;
- `./part-whole`: DonutChart, PieChart, FunnelChart, Treemap, SankeyChart;
- `./matrix`: Heatmap, CalendarHeatmap, Histogram, RampLegend;
- `./compact`: Sparkline, Gauge, RadialProgress;
- `./geo`: TileMap;
- `./canvas`: the Canvas renderer used by the dense line and scatter charts.

The platform guide with every chart's props, the data contracts and the
measured numbers is [docs/CHARTS.md](../../docs/CHARTS.md). `sideEffects` lists only CSS,
so a bundler keeps just the components a screen imports from a subpath. Load a family from a lazy route (`load: () => import('./Screen.svelte')`)
so charts stay out of the initial chunk.

## Cartesian charts (`./cartesian`)

Every cartesian chart takes series in data space:

```ts
const series: CartesianSeries[] = [
  { id: 'signups', label: 'Signups', points: days.map((d) => ({ x: d.at, y: d.count })) },
  { id: 'previous', label: 'Previous period', comparison: true, points: previous },
];
// or from rows: seriesFromRows(rows, { x: (r) => r.day, series: [{ id: 'signups', label: 'Signups', y: (r) => r.signups }] })
```

Each one renders in a `ChartFrame` with axes, a grid, the keyboard and
pointer layer, a legend that hides series (never the last one), and a "View
as table" toggle whose table loads on demand. Values are formatted by `unit`:
`number`, `compact`, `percent` (ratios) or `cents` (integer cents with
`currency`).

| Chart | Highlights |
| --- | --- |
| `LineChart` | `xKind` `time` (default), `linear` or `category`; `curve`; comparison series dashed; dense series downsampled with LTTB to about two points per pixel (the table keeps every value) |
| `AreaChart` | LineChart with fills; `stacked` piles series so the top line is the total |
| `BarChart` | `orientation` vertical or horizontal; `mode` `grouped`, `stacked` (negatives below zero) or `expanded` (shares of 100 %); `showValues` |
| `ComboChart` | Bars on the left axis, lines on the right (`type` and `axis` per series; default first series bars), each with its own `leftUnit` / `rightUnit`; the legend names the axis |
| `ScatterChart` | `xKind` `linear` or `time`; a symbol per series; `size` per point drawn as area-true bubbles (`radius` range) |

All charts take `onselect({ series, index, datum })` for drill-down,
`loading`, `error` + `onretry`, `emptyMessage` and a bindable `hidden` set.

Size, measured by the bundle guard (`pnpm vitest run packages/cli/tests/charts-bundle.test.ts`,
a real Vite production build of a fixture app): opening a LineChart + BarChart
view downloads 16,006 B gzip. Before the reductions below it was 17,833 B:

| Change | Line + bar view |
| --- | ---: |
| Before | 17,833 B |
| Palette builder loads only for themes without a chart block | 16,650 B |
| Legend and TableToggle load after the plot | 16,148 B |
| Unit formatters from one `Intl` table; Canvas pixel reduction moved into the lazy Canvas chunk | 15,959 B |
| Tap selection for touch (current) | 16,006 B |

A Sparkline on a first screen adds 2,549 B. The guard fails above 2,750 B and
17,000 B. The plan's 10 KB target for line + bar is not met; the rest is chart
code. See [docs/PERFORMANCE.md → Charts](../../docs/PERFORMANCE.md#charts-and-analytics-kits).

## Dense data: the Canvas renderer (`./canvas`)

`LineChart`, `AreaChart` and `ScatterChart` take `renderer: 'auto' | 'svg' |
'canvas'`. With `auto` (the default), lines switch to Canvas above 5,000
visible points after LTTB downsampling (several dense series), and scatter
charts above 2,000 visible points. On Canvas:

- Marks are painted on a DPR-aware `<canvas>` under the SVG, which still holds
  the axes, grid, crosshair, focus marker and tooltip. The keyboard layer,
  live region and "View as table" (50 rows per page) work exactly as on SVG.
- Lines keep the first, lowest, highest and last point per pixel column
  (`reduceForPixels`, built on `minMaxBuckets`), so they look the same as
  drawing every point. Spikes and gaps survive, and hover and keys use every
  point.
- Scatter hover uses a uniform grid index (`ScatterIndex`) for a true 2-D
  nearest point. Canvas draws circles; SVG keeps a symbol per series.
- It redraws once per animation frame, only when the data, the size or the
  theme (palette, mode) change. Theme colors (`var(--py-chart…)`) are resolved
  from computed styles (`resolveColor`).
- The drawing component loads lazily: charts that stay on SVG never download
  it.

Measured in Node (Apple M1 Max, load average 15–34): reducing 10k points to
pixel columns takes 0.7–2.0 ms and 100k points 3.6–9.2 ms. Indexing 20k scatter
points takes about 5 ms, and a nearest lookup 2–9 µs. Browser paint time is
measured by charts-bench. Size: the `./canvas` entry is 2.0 KB gzip, and it is
lazy from the charts.

## Part-whole and flow charts (`./part-whole`)

These charts share one keyboard model (`ItemPlot`): a single tab stop with
`aria-activedescendant`. Arrows move between slices, steps, cells or nodes,
Home and End jump to the ends, and Enter selects. A polite live region reads
each item ("Pro, 280, 28%. 2 of 4."), and the shared tooltip follows pointer
and focus.

Donut, pie, funnel and Sankey charts also have the same lazy "View as table"
toggle as the cartesian charts, backed by `ValueTable` (loaded only when it is
opened):
- donut and pie list each slice with its value and share;
- funnel lists each step with its count, share of entered, conversion from
  the previous step and drop-off;
- Sankey lists each link source → target with its value.

Treemap uses its breadcrumb and drill-in instead.

| Chart | Highlights |
| --- | --- |
| `DonutChart` / `PieChart` | `data: [{ id, label, value, color? }]`. Slices under `otherThreshold` (3 %) fold into "Other" (`groupSmallSlices`; the selection keeps its `members`). Outside labels appear only for slices of 6 % or more, pushed apart so they never overlap. The total sits in the hole (`centerLabel`), and a legend lists every value and share. `PieChart` has no hole. |
| `FunnelChart` | `steps: [{ id, label, value }]`, or `computeFunnel(...).steps` from @protoyard/analytics as they are (`count`). Vertical or horizontal. Each step shows its value and share of entered; the tooltip adds step-to-step conversion and drop-off. |
| `Treemap` | `root` as a `TreemapNode` tree, shown one level at a time. Labels appear only in cells that fit. Enter or a click on a group drills in, Backspace or Escape goes back, and a breadcrumb jumps up. `onselect(node, path)` fires for leaves. Invalid trees show the error state. |
| `SankeyChart` | `nodes` and `links` (a DAG). Links are colored by their source node, and the focused node's links are highlighted. Cycles and unknown nodes show the error state instead of throwing. |

Size (esbuild minify + gzip -9, splitting, `svelte` external), each chart on
its own: DonutChart 10.6 KB, FunnelChart 9.6 KB, Treemap 10.3 KB, SankeyChart
10.3 KB; all five 16.5 KB. Most of each is the shared frame + `ItemPlot`
(7.3 KB, including the palette builder). That is over the 6 KB target for the
subpath; the same frame reductions as for the cartesian family apply.

## Matrix and tile charts (`./matrix`, `./geo`)

Heatmaps, calendars and tile maps share one 2-D keyboard grid (`CellPlot`):
arrows move by row and column, skipping gaps (a calendar starting mid-week),
Home and End go to the ends of the row, Ctrl+Home and Ctrl+End to the first
and last cell, and Enter selects. A live region reads each cell, and the
tooltip follows focus and pointer. Each chart has a ramp legend with its
minimum and maximum, a "No data" swatch when values are missing, and a lazy
"View as table". Colors come from the theme's 9-step sequential ramp
(`--py-seq-*`), or the diverging one.

| Chart | Highlights |
| --- | --- |
| `Heatmap` | `rows`, `cols` and `values[row][col]`. `null` cells are dashed "no data", distinct from 0. Values print in a cell only when it fits and white or near-black text reaches 4.5:1 on the actual ramp color. `diverging` with `mid` for changes around a midpoint. |
| `CalendarHeatmap` | `start` and `end` days with `values` by `YYYY-MM-DD`. One cell per UTC day in week columns (53 for a year) and weekday rows (`weekStartsOn`), month labels, and empty days distinct from zero. |
| `Histogram` | `values` binned with `bin()` (Sturges by default, or `bins: { count | thresholds }`); optional `rules: ['mean', 'median']`. It uses the cartesian keyboard layer over its bins. |
| `TileMap` (`./geo`) | A choropleth on a data-only tile grid: `layout: [{ id, label, abbr, col, row }]` and `data` by id. Ships `WORLD_TILES` (large world regions, no borders) and `REGION_TILES` (fictional districts). |

Size (esbuild minify + gzip -9, splitting, `svelte` external), each chart on
its own: Heatmap 10.9 KB, CalendarHeatmap 11.2 KB, Histogram 13.8 KB (it uses
the cartesian layer), TileMap 10.9 KB; the tile layouts alone are 0.6 KB. Most
of each is the shared frame. This is over the 5 KB (`./matrix`) and 3 KB
(`./geo`) targets; see the frame reductions in the PLAN_003 reports.

## Compact charts (`./compact`)

Tiny inline charts for KPI tiles and table cells. Each one carries a text
equivalent instead of the keyboard layer and imports neither the frame nor
the interaction layer, so it can sit on a first screen.

- **`Sparkline`** (`values`, `variant: 'line' | 'area' | 'bar'`): fills its
  container width (or `width`) at `height` (32 px), using a stretched
  viewBox with non-scaling strokes, so it needs no resize observer.
  - It marks the last value (`showLast`) and optionally the minimum and
    maximum (`showMinMax`). Gaps (`null`) break the line. Bars stand on a
    zero baseline.
  - It is `role="img"` with `label`, or a generated sentence:
    `trendLabel(values, period)` gives "Trend: up 12% over 30 days".
  - It fades in, except under `data-py-motion="reduce"` or
    `prefers-reduced-motion`.
- **`Gauge`** (`value`, `min`, `max`, `thresholds`, `bandLabels`,
  `bandColors`, `format`): a 270° track with a threshold band ring
  (success / warning / destructive by default) and a value arc in the
  current band's color. It is `role="meter"` with `aria-valuemin/max/now`
  and `aria-valuetext` such as "72%, Busy".
- **`RadialProgress`** (`value`, `max`): a ring with a percentage, as
  `role="progressbar"`.

Size (esbuild minify + gzip -9, `svelte` external, each component on its
own): Sparkline 1.9 KB (including the trend text), Gauge 2.1 KB,
RadialProgress 1.4 KB.

## ChartFrame (shared by every family)

`src/frame/` holds the container every chart renders in. It is internal for
now: each family subpath re-exports it with its charts, so the root entry
stays free of component code.

- **Responsive:** width comes from the container through `ResizeObserver`
  (it works inside device shells; no window media queries). `height` is a
  prop. The chart (`children` snippet) renders once the width is known and
  receives `{ width, height, plot }`.
- **Accessible:** a `<figure>` named by `title` (visible, or `hideTitle`)
  and described by `description` and a screen-reader `summary`. Loading
  (`role="status"`, `aria-busy`), empty and error (`role="alert"`) states
  replace the plot. `onretry` returning a promise disables the button and
  shows "Retrying…" until it settles.
- **Themed:** one shared reader per page watches `<html>` (`data-py-*`,
  class, inline variables) once per appearance change. Themes that ship a
  validated chart block (library and generated themes) already publish
  `--py-chart1…8`, `--py-seq-*` and `--py-div-*`; the frame uses those as
  they are and sets nothing. For other themes it loads the palette builder
  on demand (`@protoyard/charts/palette/derive`), then builds the validated
  palette from `chart1…5` and sets those variables on the frame. Until it
  arrives, charts use the raw theme tokens. When the
  tokens are not hex, charts fall back to the raw `--py-chart*` tokens.
- **Motion:** `data-py-motion="reduce"` or `prefers-reduced-motion` sets
  `data-motion="reduce"` and `--py-chart-duration: 0ms` on the frame and
  `reducedMotion` in the context. Charts animate only through
  `--py-chart-duration`.
- **Context:** `getChartFrameContext()` gives nested chart parts `width`,
  `height`, `margin`, `plot`, `mode`, `reducedMotion` and `palette`, all
  reactive.

Size (esbuild minify + gzip -9, `svelte` runtime external): 5.4 KB with the
palette builder it pulls in (about 2.8 KB of that), shared by every chart
on a page.

## Interaction layer (shared by every family)

`src/interaction/` holds the parts charts compose. Charts map their data to
pixel points (`PlotSeries` → `PlotPoint { x, y, xValue, yValue, datum }`)
and pass formatters (`{ x, y }`); the same formatters feed the tooltip, the
live region and the table.

Three details that only show up in a real browser (covered by `tests/e2e/charts.spec.ts`):
- **Touch:** a tap selects the point under the finger and shows its tooltip. The click locates its own point, because a touch fires `pointerleave` before its click.
- **Shrinking:** the measured plot container uses `contain: inline-size`, so a chart narrows with its container when the window shrinks or a phone rotates. Without it, the drawn SVG width would hold grid and flex parents open.
- **Table toggle:** it references the table with `aria-controls` only while the table exists.

- **`InteractivePlot`:** the plot `<svg>`. It is one tab stop
  (`role="group"`, `aria-roledescription="chart"`, `aria-activedescendant`
  on a single focus marker, so it scales to any number of points).
  - Keys: arrows move between points and skip gaps; Home and End jump to
    the ends; Page Up and Page Down (or Up and Down) switch to the nearest
    point in the previous or next visible series; Enter or Space call
    `onselect({ series, index, datum })` for drill-down; Escape dismisses
    the tooltip.
  - A polite live region reads "Signups, Tue: 20 users. Point 2 of 3."
  - The pointer follows the nearest x (then the nearest series vertically);
    a click selects.
  - A dashed crosshair and a tooltip list every visible series at that x.
    The tooltip stays inside the frame, flips at the edges and never covers
    the point; it is `aria-hidden` because the live region carries the text.
- **`Legend`:** one toggle button per series (`aria-pressed`). The last
  visible series cannot be hidden. Without `onchange` it renders a static
  key.
- **`ChartTable` + `TableToggle`:** the same data as an HTML table, one row
  per x and one column per series. Hidden series are still listed, marked
  "(hidden)". Long tables page 50 rows at a time ("Show 50 more").
  `TableToggle` is an `aria-pressed` "View as table" / "View as chart"
  button.
- **`Axis` and `Grid`:** decorative SVG (`aria-hidden`) in
  `--py-chart-axis` and `--py-chart-grid`, falling back to the muted and
  border tokens.

Size (esbuild minify + gzip -9, `svelte` external): `InteractivePlot` 4.3 KB;
`Legend` 2.2 KB, `Axis` + `Grid` 2.1 KB, `ChartTable` + `TableToggle`
2.3 KB measured alone; 6.4 KB for the whole layer.

## Tests

```bash
pnpm vitest run packages/charts-ui
pnpm --filter @protoyard/charts-ui typecheck
pnpm vitest run packages/cli/tests/charts-bundle.test.ts      # real Vite build, size ceilings
pnpm protoyard build ui-kit && pnpm exec tsx scripts/bench-charts.ts --runs 3 --check
```

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.
