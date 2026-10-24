# Charts

Protoyard's charts are Texuli's (`@texuli/charts`), re-exported with thin
adapters that keep Protoyard's props
([TEXULI → Charts](TEXULI.md#charts-from-texulicharts),
[ADR-044](DECISIONS.md)). Two packages:

- [`@protoyard/charts`](../packages/charts/README.md): framework-agnostic
  math. Scales, shapes, layouts and downsampling are re-exported from
  `@texuli/charts/math`; palettes use `@texuli/tokens/palette`
  (`deriveChartTokens`) with `--py-chart*` CSS helpers.
- [`@protoyard/charts-ui`](../packages/charts-ui/README.md): Svelte 5
  components, one lazy subpath per family. Every family re-exports Texuli's
  charts; the adapters are listed in
  [charts-ui/docs/texuli-charts.md](../packages/charts-ui/docs/texuli-charts.md).

Every chart has:
- a title and a description;
- an SVG with `role="img"` named by them, inside a `<figure>`;
- a data table with the same values (a "View as table" toggle on cartesian
  charts, a `<details>` table on the others);
- an empty state (`emptyMessage`, default "No data");
- colors from the theme.

Live reference: the **Charts** group of the ui-kit prototype
(`pnpm protoyard dev ui-kit`, then `#/c/chart-cartesian`, `#/c/chart-part-whole`,
`#/c/chart-matrix`, `#/c/chart-compact`, `#/c/chart-geo` and `#/c/chart-stress`).

## Install

Add `"@protoyard/charts-ui": "workspace:*"` to the prototype's dependencies.
Import the styles after the renderer's app.css (or after Tailwind and the
theme/UI styles):

```css
@import "@protoyard/renderer-svelte/app.css";
@import "@protoyard/charts-ui/styles.css";
```

Import charts from a **lazy** route or chunk (`load: () => import('./Screen.svelte')`),
so chart code stays out of initial JS. The bundle guard fails when cartesian
or interaction code reaches the initial chunk.

## Choosing a chart

| Need | Component | Subpath |
| --- | --- | --- |
| A value over time, many series | `LineChart`, `AreaChart` | `cartesian` |
| Compare categories, grouped or stacked | `BarChart` (`mode`) | `cartesian` |
| Bars and lines together | `ComboChart` | `cartesian` |
| Correlation, bubbles | `ScatterChart` (`size` on points) | `cartesian` |
| Share of a whole | `DonutChart`, `PieChart` | `part-whole` |
| Step-by-step conversion | `FunnelChart` (takes `computeFunnel().steps` as they are) | `part-whole` |
| Nested shares | `Treemap`, or Texuli's `SunburstChart` | `part-whole` |
| Flows between stages | `SankeyChart` (a DAG) | `part-whole` |
| Links between entities | `NetworkGraph` | `flow` |
| Two categorical axes | `Heatmap` | `matrix` |
| Daily activity over months | `CalendarHeatmap` | `matrix` |
| A distribution | `Histogram` | `matrix` |
| A number in a tile or cell | `Sparkline`, `Gauge`, `RadialProgress`, Texuli's `BulletChart` | `compact` |
| Values per region | `TileMap` (`WORLD_TILES`, `REGION_TILES` or your own tiles) | `geo` |

The `flow` subpath re-exports `@texuli/charts/flow` unchanged (`FunnelChart`,
`SankeyChart`, `NetworkGraph`, with Texuli's own props). The `interaction`
subpath re-exports `@texuli/charts/interaction` (`InteractivePlot`, `Legend`,
`ChartTable`, `TableToggle`, and the brush, zoom and keyboard helpers) for
building a custom chart.

The `chart` content block (`@protoyard/blocks-ui/data`, for decks, pages and
docs) reuses the AI `ChartSpec` (`@protoyard/ai/chart`) unchanged and renders
it with Texuli's cartesian and matrix charts directly, through the
`toTexuliChartBlock` adapter in blocks-ui.

## Props and data contracts

The adapters accept extra props without a type error (`[key: string]:
unknown`), but they **forward only the props listed here**. Older Protoyard
props such as `unit`, `currency`, `xKind`, `curve`, `renderer`, `height` on
cartesian charts, `loading`, `error`, `onretry`, `showLegend`, `showTable`
and `hidden` are ignored today.

Every adapter except the compact ones takes `title` (required),
`description?` and `emptyMessage?` (also used as the description when none is
given).

| Component | Data | Other props forwarded |
| --- | --- | --- |
| `LineChart` | `series: { id, label, points: { x, y \| null, datum? }[], color? }[]` (`seriesFromRows(rows, …)` builds it) | `area`, `interactive` (default `true`), `onselect({ seriesId, index, x, y })`, `class` |
| `AreaChart` | as `LineChart` | `onselect`, `class` |
| `BarChart` | as `LineChart` | `mode` (`grouped`, or `stacked` and `expanded`, which both render Texuli's `StackedBarChart`), `interactive`, `onselect` (adds the point's `datum`), `class` |
| `ComboChart` | as `LineChart` | `onselect`, `class` (per-series `type` and `axis` are not forwarded) |
| `ScatterChart` | as `LineChart`, numeric `x`, optional `size` per point (rendered by Texuli's matrix `ScatterChart`) | `height` (default 360), `class` |
| `DonutChart`, `PieChart` | `data: { id, label, value }[]` | `height` (becomes Texuli's `size`, at least 120) |
| `FunnelChart` | `steps: { id, label, value? \| count? }[]` | `height` (default 320), `orientation` |
| `Treemap` | `root` (or `tree`, `data`): a node tree with `id`, `label?`, `value?`, `children?` | — |
| `SankeyChart` | `nodes: { id, label? }[]`, `links: { source, target, value }[]` | — |
| `Heatmap` | `cells` (or `data`): `{ x, y, value }[]` | — |
| `CalendarHeatmap` | `values: Record<'YYYY-MM-DD', number>` (the range runs from the first to the last key) | — |
| `Histogram` | `values: number[]`, binned with `bin()` (Sturges) into a Texuli `BarChart` | — |
| `TileMap` | `data` (or `values`): `Record<tileId, number \| null>` | `shape` (`world`, `region` or tiles), `layout` (tiles `{ id, label, abbr, col, row }`); `unit` and `onselect` are accepted but have no effect |
| `Sparkline` | `values` (or `data`): `(number \| null)[]` | `label` (default: a trend sentence from `trendLabel`), `description`, `height` (32), `showLast` (default `false`), `variant` (`line`, `area`, `bar`), `period`, `format` |
| `Gauge` | `label`, `value` | `min`, `max` (100), `description`, `thresholds`, `bandLabels`, `format` |
| `RadialProgress` | `label`, `value` | `max` (default 1), `size`, `thickness` (Texuli's `ProgressRing`) |

Texuli's own components re-exported from the same subpaths (`CartesianChart`,
`StackedBarChart`, `TreemapChart`, `SunburstChart`, `HeatmapChart`,
`BubbleChart`, `BulletChart`, `ProgressRing`, `GeoMap`, `GeoPointMap`, and
everything in `flow`) take Texuli's props directly. For example, Texuli's
cartesian charts take `renderer`, `onzoom`, `onbrush` and `fullDomain`,
which the Protoyard adapters do not pass on.

## Accessibility

- **Cartesian charts** (line, area, bar, combo, and the histogram's bars) use
  Texuli's interaction layer:
  - The plot SVG is `role="img"`, named by the title and description. Over
    it, a focusable surface (`role="application"`,
    `aria-roledescription="chart"`, `aria-activedescendant`) holds the
    keyboard and pointer.
  - Arrows move between points; Home and End jump to the ends; Page Up and
    Page Down (or Up and Down) switch series; Enter or Space select; Escape
    dismisses the tooltip.
  - A polite live region reads the active point.
  - A legend and a "View as table" toggle load after the plot.
- **Every other chart** is a labeled `role="img"` SVG with its values in a
  data table, without a per-item keyboard model.
- **Errors** that Texuli detects (for example a Sankey cycle, or a funnel
  without a valid size) render as a `role="alert"` message.
- **The adapter wrapper.** Each adapter except `Sparkline` wraps the chart in
  a focusable, named `role="group"` (`data-py-chart`) that passes focus to the
  chart's keyboard surface, relabels Texuli's table toggle as "View as table"
  / "View as chart" with `aria-pressed`, and marks bar rectangles with
  `data-bar` for Protoyard's tests and hosts.
- **Reduced motion** follows `prefers-reduced-motion` in Texuli's interaction
  layer.

The E2E suite (`tests/e2e/charts.spec.ts`) runs axe (WCAG 2.1 A/AA, serious
and critical) on every family demo.

## Palette

Texuli's charts read `--tx-chart-1…8` and its sequential ramp. The renderer
writes Texuli's `--tx-*` variables from the active Protoyard theme
(`enableTexuliAppearance`, see
[TEXULI → Themes](TEXULI.md#themes-come-from-texulitokens)). Protoyard
themes still publish `--py-chart1…8`, `--py-seq-1…9` and `--py-div-1…9` for
Protoyard's own chart helpers (`RampLegend`, `seriesColor`).

- `chartPalette()` in `@protoyard/charts/palette` is Texuli's
  `deriveChartTokens`. It derives 8 categorical and 9-step sequential and
  diverging colors from a theme's `chart1…chart5` and repairs them:
  - contrast ≥ 3:1 against the surfaces;
  - categorical colors ≥ 0.08 apart in OKLab;
  - ≥ 0.04 apart under simulated color-vision deficiencies;
  - monotonic ramps.
- `@protoyard/charts/palette/derive` is kept for existing imports; it now
  points at the same module as `@protoyard/charts/palette`.

Details: [charts README → Chart palettes](../packages/charts/README.md#chart-palettes)
and [THEMES](THEMES.md).

## Renderers: SVG and Canvas

Texuli's cartesian charts take `renderer` (`auto`, `svg`, `canvas`), default
`auto`: from 5,000 source points (`CANVAS_POINT_THRESHOLD`) the marks are
drawn on a `<canvas>`, and the keyboard and tooltip work on a downsampled
copy of the series. The Canvas code is the `canvas` subpath.

The Protoyard `LineChart`, `AreaChart` and `ScatterChart` adapters **do not
forward `renderer`**, so they always use Texuli's `auto`. The ui-kit stress
demo (`#/c/chart-stress`, 10,000 points from a fixed seed) still shows an
SVG/Canvas toggle, but it has no effect through the adapters. To force a
renderer, use Texuli's `CartesianChart` (`kind="line"`) from the `cartesian`
subpath.

## Measured numbers

Measured 2026-10-24 on the Apple M1 Max (10 cores, 64 GB), macOS 27.0, Node
26.11.1. Method and history: [PERFORMANCE → Charts](PERFORMANCE.md#charts).

| What | Measured | Gate | Command |
| --- | ---: | ---: | --- |
| LTTB, 10,000 points → 1,600 (Node, median) | 0.20–0.27 ms | < 2 ms | `pnpm exec tsx scripts/bench-charts.ts --skip-browser --check` (two runs) |
| Scale + LTTB + path, 10,000 points (Node, median) | 0.86–0.97 ms | — | same |
| Scale + LTTB + path, 100,000 points (Node, median) | 5.44–25.11 ms | — | same (machine shared with other builds) |
| Sparkline added to a first screen (Vite build, gzip) | 3,211 B | ≤ 3,450 B | `pnpm vitest run packages/cli/tests/charts-bundle.test.ts` |
| LineChart + BarChart view (lazy, gzip) | 8,977 B | ≤ 17,000 B | same |

Whole family subpaths (every component, gzip level 9, beyond the app entry),
from the same bench: cartesian 13,466 B, part-whole 9,819 B, matrix 15,923 B,
compact 7,213 B, canvas 1,647 B, geo 4,651 B. The bench does not measure the
`flow` and `interaction` subpaths. A real view is smaller: unused components
are tree-shaken.

**Not measured today:** browser render and hover times. The bench's Chromium
step (`scripts/bench-charts.ts` without `--skip-browser`) waits for an
`svg[role="group"]` plot that Texuli's charts no longer render, so it times
out. The Chromium numbers in PERFORMANCE were measured on Protoyard's earlier
chart code and are kept there as history only.

## Limits (honest)

- **Most older props are ignored.** Units, currency formatting, axis kinds,
  curves, loading and error states, comparison dashing and combo axes are not
  forwarded by the adapters (see [Props](#props-and-data-contracts)).
- **No zoom, brush or pan through the adapters.** Texuli's cartesian charts
  support them (`onzoom`, `onbrush`), but only when used directly.
- **No annotation layer.** The Pebblestat flagship shows release notes and
  incidents in a dated strip under the charts.
- **Canvas covers cartesian charts only**, chosen automatically.
- **Not measured:** browser render and hover times (see above), real phones
  and GPUs, screen readers beyond axe and the live-region checks, and data
  larger than 100,000 points.

## Tests

```bash
pnpm vitest run packages/charts packages/charts-ui                # unit (happy-dom)
pnpm vitest run packages/cli/tests/charts-bundle.test.ts          # real Vite build, size ceilings
pnpm exec tsx scripts/bench-charts.ts --skip-browser --check      # Node math and family sizes
PROTOYARD_E2E_PROTOTYPES=ui-kit pnpm test:e2e tests/e2e/charts.spec.ts
```

## For agents

The distributable Protoyard skill routes kit choices through its `kits`
sub-skill ([`skills/protoyard/kits/SKILL.md`](../skills/protoyard/kits/SKILL.md))
and its catalog ([`skills/protoyard/references/kits.md`](../skills/protoyard/references/kits.md)),
which link back to this guide. Keep the catalog's entry for this kit in step
when its entry points or limits change.
