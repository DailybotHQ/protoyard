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
  class, inline variables) and, once per appearance change, builds the
  validated chart palette from the theme tokens. It sets `--py-chart1…8`,
  `--py-seq-*` and `--py-div-*` on the frame. When the tokens are not hex,
  charts fall back to the raw `--py-chart*` tokens.
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

## Tests

```bash
pnpm vitest run packages/charts-ui
pnpm --filter @protoyard/charts-ui typecheck
```
