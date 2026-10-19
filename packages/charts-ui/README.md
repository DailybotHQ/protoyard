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

**Status:** scaffold (PLAN_003 Task 5). Each subpath currently exports only
its `FAMILY` name; the components are added by the following PLAN_003 charts
tasks. Load a family from a lazy route (`load: () => import('./Screen.svelte')`)
so charts stay out of the initial chunk.

## Tests

```bash
pnpm vitest run packages/charts-ui
pnpm --filter @protoyard/charts-ui typecheck
```
