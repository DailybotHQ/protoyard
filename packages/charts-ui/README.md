# @protoyard/charts-ui

Svelte 5 chart components for Protoyard prototypes. Every family re-exports
the charts of [Texuli](../../docs/TEXULI.md#charts-from-texulicharts)
(`@texuli/charts`), with thin adapters that keep Protoyard's props
([docs/texuli-charts.md](docs/texuli-charts.md)). The math comes from
[`@protoyard/charts`](../charts/README.md), which re-exports
`@texuli/charts/math` ([ADR-044](../../docs/DECISIONS.md)). Each chart family
has its own subpath, so a prototype pays only for the families its screens
import. Nothing here is re-exported from the `@protoyard/ui` barrel.

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
| `@protoyard/charts-ui/flow` | Funnel, sankey and network graph, straight from `@texuli/charts/flow` |
| `@protoyard/charts-ui/interaction` | The shared interaction layer (`InteractivePlot`, `Legend`, `ChartTable`, `TableToggle`, brush, zoom and keyboard helpers) from `@texuli/charts/interaction` |

What each subpath ships:
- `./cartesian`: LineChart, AreaChart, BarChart, ComboChart, ScatterChart;
- `./part-whole`: DonutChart, PieChart, FunnelChart, Treemap, SankeyChart, plus
  Texuli's TreemapChart and SunburstChart;
- `./matrix`: Heatmap, CalendarHeatmap, Histogram, RampLegend;
- `./compact`: Sparkline, Gauge, RadialProgress;
- `./geo`: TileMap;
- `./canvas`: the Canvas renderer used by the dense line and scatter charts;
- `./flow` and `./interaction`: Texuli's flow charts and interaction layer.

Sizes, measured by `pnpm exec tsx scripts/bench-charts.ts --skip-browser
--check` (a real Vite build with one lazy import per family; gzip level 9 of
the chunks each family downloads beyond the app entry): cartesian 13,466 B,
part-whole 9,819 B, matrix 15,923 B, compact 7,213 B, canvas 1,647 B, geo
4,651 B. A LineChart + BarChart view is 8,977 B, within the bench's 17,000 B
guard.

The platform guide with every chart's props, the data contracts and the
measured numbers is [docs/CHARTS.md](../../docs/CHARTS.md). `sideEffects` lists only CSS,
so a bundler keeps just the components a screen imports from a subpath. Load a family from a lazy route (`load: () => import('./Screen.svelte')`)
so charts stay out of the initial chunk.

## Families and props

Each subpath re-exports Texuli's charts, through an adapter where Protoyard's
props differ ([docs/texuli-charts.md](docs/texuli-charts.md)):

- **`./cartesian`:** LineChart, AreaChart, BarChart and ComboChart pass
  `emptyMessage` and `description` to Texuli's `description` and drop
  Protoyard-only series fields; ScatterChart maps `series[]` to Texuli's
  matrix `points[]`.
- **`./part-whole`:** Pie and Donut default the table `labels` and map
  `height` to `size`; FunnelChart maps `count` to `value`; Texuli's
  TreemapChart and SunburstChart are re-exported as they are.
- **`./matrix` and `./geo`:** Histogram bins with `@texuli/charts/math`
  `bin` and draws a BarChart; CalendarHeatmap lays out cells with
  `calendarLayout`; TileMap draws Texuli's `GeoMap` (`WORLD_TILES` and
  `REGION_TILES` re-exported).
- **`./compact`:** RadialProgress draws Texuli's `ProgressRing`.
- **`./canvas`, `./flow`, `./interaction`:** Texuli's, unchanged.

**Many older props are accepted but ignored** (units and currency
formatting, axis kinds, `curve`, `renderer`, `loading` / `error` /
`onretry`, `showLegend` / `showTable` / `hidden`, among others). The exact
props each adapter forwards, the data contracts, the keyboard and screen
reader behavior, the palette and the renderers are documented in
[docs/CHARTS.md](../../docs/CHARTS.md) from the adapter source.

## Tests

```bash
pnpm vitest run packages/charts-ui
pnpm --filter @protoyard/charts-ui typecheck
pnpm vitest run packages/cli/tests/charts-bundle.test.ts      # real Vite build, size ceilings
pnpm exec tsx scripts/bench-charts.ts --skip-browser --check        # Node math + real Vite bundle sizes
```

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.
