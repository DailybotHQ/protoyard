# Charts

Protoyard's own chart kit, with no third-party chart library
([ADR-021](DECISIONS.md)). Two packages:

- [`@protoyard/charts`](../packages/charts/README.md): framework-agnostic
  math (scales, shapes, downsampling, layouts, palettes), plain TypeScript
  tested in Node.
- [`@protoyard/charts-ui`](../packages/charts-ui/README.md): Svelte 5
  components, one lazy subpath per family.

Every chart has:
- a title;
- a spoken summary;
- one keyboard tab stop with arrow-key traversal and a polite live region;
- a tooltip that follows the pointer, focus and taps;
- a real table view;
- loading, empty and error states;
- colors from the theme.

Live reference: the **Charts** group of the ui-kit prototype
(`pnpm protoyard dev ui-kit`, then `#/components/charts`).

## Install

Add `"@protoyard/charts-ui": "workspace:*"` to the prototype's dependencies.
Import the styles after the renderer's app.css (or after Tailwind and the
theme/UI styles):

```css
@import "@protoyard/renderer-svelte/app.css";
@import "@protoyard/charts-ui/styles.css";
```

Import charts from a **lazy** route or chunk (`load: () => import('./Screen.svelte')`),
so chart code stays out of initial JS. The bundle guard fails when it leaks.

## Choosing a chart

| Need | Component | Subpath |
| --- | --- | --- |
| A value over time, many series | `LineChart`, `AreaChart` (`stacked`) | `cartesian` |
| Compare categories, stack or 100 % | `BarChart` (`mode`, `orientation`) | `cartesian` |
| Two units on two axes (bars + lines) | `ComboChart` | `cartesian` |
| Correlation, bubbles | `ScatterChart` (`size` on points) | `cartesian` |
| Share of a whole | `DonutChart`, `PieChart` | `part-whole` |
| Step-by-step conversion | `FunnelChart` (takes `computeFunnel().steps` as they are) | `part-whole` |
| Nested shares, drill-in | `Treemap` | `part-whole` |
| Flows between stages | `SankeyChart` (a DAG) | `part-whole` |
| Two categorical axes | `Heatmap` (sequential or `diverging`) | `matrix` |
| Daily activity over months | `CalendarHeatmap` | `matrix` |
| A distribution | `Histogram` (`rules: ['median', 'mean']`) | `matrix` |
| A number in a tile or cell | `Sparkline`, `Gauge`, `RadialProgress` | `compact` |
| Values per region | `TileMap` (`WORLD_TILES`, `REGION_TILES` or your own tiles) | `geo` |

## Props and data contracts

Every framed chart takes these props, besides those listed below:
- `title` (required);
- `description?` and `summary?`. The summary replaces the generated sentence.
- `height?`;
- the states: `loading?`, `error?` + `onretry?` (its promise keeps Retry pending), `emptyMessage?`;
- `onselect?`, fired on click, tap or Enter.

`unit` is one of `number`, `compact`, `cents` (integer cents, formatted
with `currency`) or `percent` (ratios, 0.25 = 25 %).

| Component | Data | Other props |
| --- | --- | --- |
| `LineChart` | `series: { id, label, points: { x, y \| null, datum? }[], color?, comparison? }[]` (`seriesFromRows(rows, …)` builds it) | `xKind` (`time` epoch ms or ISO, `linear`, `category`), `unit`, `currency`, `area`, `stacked`, `curve` (`linear`, `monotone-x`, `step*`), `renderer` (`auto`, `svg`, `canvas`), `margin`, `xHeader`, `showLegend`, `showTable`, `hidden` (bindable) |
| `AreaChart` | as `LineChart` | `LineChart` with `area` |
| `BarChart` | as `LineChart` | `xKind`, `orientation` (`vertical`, `horizontal`), `mode` (`grouped`, `stacked`, `expanded`), `unit`, `currency`, `showValues`, `margin`, `xHeader`, `showLegend`, `showTable`, `hidden` |
| `ComboChart` | as `LineChart`; each series may set `type: 'bar' \| 'line'` and `axis: 'left' \| 'right'` (default: the first series bars on the left, the rest lines on the right) | `xKind`, `leftUnit`, `rightUnit`, `currency`, `margin`, `xHeader`, `showTable`, `hidden` |
| `ScatterChart` | as `LineChart`, numeric `x`, optional `size` per point | `xKind` (`time`, `linear`), `unit`, `currency`, `radius: [min, max]`, `renderer`, `margin`, `xHeader`, `showLegend`, `showTable`, `hidden` |
| `DonutChart` | `data: { id, label, value, color? }[]` | `unit`, `currency`, `innerRatio`, `otherThreshold` (default 3 %), `otherLabel`, `centerLabel` |
| `PieChart` | as `DonutChart` | `DonutChart` with no hole |
| `FunnelChart` | `steps: { id, label, value? \| count? }[]` | `orientation`, `unit`, `color` |
| `Treemap` | `root: { id, label?, value?, children? }` (a parent's value, when given, must equal its children's sum) | `unit` |
| `SankeyChart` | `nodes: { id, label? }[]`, `links: { source, target, value }[]` (no cycles) | `unit` |
| `Heatmap` | `rows: string[]`, `cols: string[]`, `values: (number \| null)[][]` | `unit`, `currency`, `diverging` + `mid`, `showValues` |
| `CalendarHeatmap` | `start`, `end` (`YYYY-MM-DD`), `values: Record<'YYYY-MM-DD', number>` | `unit`, `weekStartsOn` |
| `Histogram` | `values: (number \| null)[]` | `bins` (`{ thresholds \| count, domain }`), `unit`, `currency`, `rules`, `color` |
| `TileMap` | `data: Record<tileId, number \| null>` | `layout` (tiles `{ id, label, abbr, col, row }`), `unit`, `currency` |
| `Sparkline` | `values: (number \| null)[]` | `variant` (`line`, `area`, `bar`), `label` (default: a trend sentence), `period`, `format`, `color`, `width`, `height`, `showLast`, `showMinMax`, `class` |
| `Gauge` | `label`, `value` | `min`, `max`, `thresholds`, `bandLabels`, `bandColors`, `format`, `size`, `thickness`, `class` |
| `RadialProgress` | `label`, `value` | `max`, `size`, `thickness`, `color`, `class` |
| `ChartFrame` (to build your own) | `children(size)` receives `{ width, height, plot }` | `title`, `description`, `summary`, `hideTitle`, `height`, `margin`, `loading`, `empty`, `error`, `onretry`, `footer`, `class` |

Behavior per family (grouping into "Other", drill-in, cycles as errors,
Canvas thresholds) is in the [charts-ui README](../packages/charts-ui/README.md).

## Accessibility

- **One tab stop per chart.** The plot is a focusable `role="group"` with
  `aria-roledescription="chart"` and `aria-activedescendant` (the WAI-ARIA
  composite pattern; no `role="application"`).
  - Arrows move between points, slices, cells, tiles or nodes; Home and End jump to the ends; Enter selects. On cartesian charts, Page Up and Page Down switch series.
  - A polite live region reads each item ("Pro, 280, 28 %. 2 of 4.").
- **Words before marks.** Every chart has a visible title and a generated
  summary sentence, which the plot's description links to.
- **"View as table"** swaps the plot for a real `<table>` with the same
  formatted values:
  - cartesian charts: one row per x;
  - donut and pie: slice, value and share;
  - funnel: count, conversion and drop-off per step;
  - Sankey: one row per link;
  - histogram: one row per bin;
  - heatmaps, calendar and tile maps: the same values by row and column.

  Treemap uses its breadcrumb and drill-in instead.
- **Pointer, focus and touch** show the same tooltip. A tap selects the
  point under the finger, because a touch fires `pointerleave` before its click.
- **Color is never the only cue.** Every chart has a legend and labels, and
  comparison series are dashed. Text on heatmap cells uses light or dark
  only where it reaches 4.5:1 against the cell.
- **Reduced motion** (OS setting or `data-py-motion="reduce"`) sets
  `--py-chart-duration: 0ms` and `data-motion="reduce"` on every chart.

The E2E suite runs axe (WCAG 2.1 A/AA, serious and critical) on every family
demo in light and dark mode.

## Palette

Charts read `--py-chart1…8` (categorical), `--py-seq-1…9` (sequential) and
`--py-div-1…9` (diverging).

- **Themes with a `charts` block** (library and generated themes) publish a
  validated palette on `<html>`, and charts use it as is.
- **Other themes:** `chartPalette()` derives the palette from
  `chart1…chart5` and repairs it:
  - contrast ≥ 3:1 against the surfaces;
  - categorical colors ≥ 0.08 apart in OKLab;
  - ≥ 0.04 apart under simulated protanopia and deuteranopia;
  - monotonic ramps.

  That builder loads on demand (`@protoyard/charts/palette/derive`).
- One shared reader watches theme, mode and motion changes for every chart
  on the page.

Details and the repair rules: [charts README → Chart palettes](../packages/charts/README.md#chart-palettes)
and [THEMES](THEMES.md).

## Renderers: SVG and Canvas

`LineChart` and `ScatterChart` take `renderer`:

- **`svg`:** every mark is an SVG element. Dense lines are reduced with
  LTTB to 2 points per pixel (200–4,000 points), keeping the shape, gaps and
  extremes.
- **`canvas`:** pixels are drawn on a decorative `<canvas>`, with min/max
  per pixel column for lines and circles for scatter. The focusable SVG layer
  on top keeps keyboard, tooltip and table on **all** points.
- **`auto`** (the default) switches to Canvas above a per-kind point count.
  The Canvas code is a lazy chunk, so SVG-only screens never download it.

The ui-kit stress demo (`#/c/chart-stress`: 10,000 points from a fixed
seed, an SVG/Canvas toggle) is the bench target.

## Measured numbers

All on the Apple M1 Max (10 cores, 64 GB), macOS 27.0, Node 26.11.1,
headless Chromium 156.0.8078.4, on 2026-10-19, with the machine shared by
other builds (load average 60–140): read them as upper bounds. Method and
history: [PERFORMANCE → Charts](PERFORMANCE.md#charts).

| What | Measured | Gate |
| --- | ---: | ---: |
| LTTB, 10,000 points → 1,600 (Node, median) | 0.19–0.25 ms | < 2 ms |
| Scale + LTTB + path, 100,000 points (Node, median) | 7.0 ms | — |
| 10k-point line render, SVG (Chromium, to DOM + layout) | 4.2–6.9 ms | < 50 ms |
| 10k-point line render, Canvas | 5.7–10.5 ms | < 50 ms |
| Hover latency p95, both renderers | 1.1–1.5 ms | < 16 ms |
| Long tasks during a 200-step hover sweep | 0 (one run of seven, at load average ~50, had two, longest 66 ms) | 0 |
| Sparkline added to a first screen (Vite build, gzip) | 2,549 B | ≤ 2,750 B |
| LineChart + BarChart view (lazy, gzip) | 16,006 B (15,959 B before the tap-selection fix) | ≤ 17,000 B |

Whole family subpaths (every component, gzip, beyond the app entry): cartesian
20.7 KB, part-whole 19.0 KB, matrix 21.1 KB, compact 4.6 KB, canvas 2.5 KB,
geo 14.1 KB. A real view is smaller: unused components are tree-shaken.

## Limits (honest)

- **The line + bar view is 16,006 B, not the planned 10 KB.**
  - About 3.7 KB is the interaction layer (keyboard model, tooltip, axes).
  - About 5.2 KB is the two charts themselves.
  - Removing the whole interaction layer would still leave about 12 KB.
  - The breakdown is in [PERFORMANCE → Charts](PERFORMANCE.md#charts).
- **No annotation layer.** Release notes or incidents cannot be drawn on
  the plot yet. The Pebblestat flagship shows them in a dated strip under
  the charts.
- **No zoom, brush or pan.** Use the date range and drill-downs instead.
- **Canvas covers lines and scatter only.** Bars, matrices and part-whole
  charts are SVG, which is fine for their sizes.
- **Not measured:** real phones and GPUs, screen readers beyond axe and the
  live-region checks, and data larger than 100,000 points.

## Tests

```bash
pnpm vitest run packages/charts packages/charts-ui                # unit (happy-dom)
pnpm vitest run packages/cli/tests/charts-bundle.test.ts          # real Vite build, size ceilings
pnpm protoyard build ui-kit && pnpm exec tsx scripts/bench-charts.ts --runs 3 --check
PROTOYARD_E2E_PROTOTYPES=ui-kit pnpm test:e2e tests/e2e/charts.spec.ts
```

## For agents

The distributable Protoyard skill routes kit choices through its `kits`
sub-skill ([`skills/protoyard/kits/SKILL.md`](../skills/protoyard/kits/SKILL.md))
and its catalog ([`skills/protoyard/references/kits.md`](../skills/protoyard/references/kits.md)),
which link back to this guide. Keep the catalog's entry for this kit in step
when its entry points or limits change.
