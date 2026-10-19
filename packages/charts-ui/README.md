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

**Status:** `./cartesian` ships LineChart, AreaChart, BarChart, ComboChart and
ScatterChart; `./compact` ships Sparkline, Gauge and RadialProgress. The other
family subpaths currently export only their `FAMILY` name; their components
are added by the following PLAN_003 charts tasks. `sideEffects` lists only CSS,
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

Size, measured with esbuild (minify + gzip -9, splitting, `svelte` external):
LineChart + BarChart is a 17.4 KB entry chunk, and the table loads lazily
(about 1.3 KB). The shared frame and interaction layer account for 10.6 KB of
that and the chart math (scales, shapes, downsampling, palette) for 7.0 KB,
so each further chart adds 1–3 KB. This is over the 10 KB target; see the
PLAN_003 report for the planned reductions.

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
  they are and sets nothing. For other themes it builds the validated
  palette from `chart1…5` and sets those variables on the frame. When the
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
```
