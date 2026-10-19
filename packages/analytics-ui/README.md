# @protoyard/analytics-ui

Svelte 5 analytics kit for Protoyard prototypes
([ADR-021](../../docs/DECISIONS.md)), built on
[`@protoyard/analytics`](../analytics/README.md),
[`@protoyard/charts-ui`](../charts-ui/README.md) and `@protoyard/ui`. Each
view has its own subpath, so a prototype pays only for the views its screens
import. Nothing here is re-exported from the `@protoyard/ui` barrel.

## Install in a workspace prototype

Add `"@protoyard/analytics-ui": "workspace:*"` to the prototype dependencies
and import the styles after Tailwind and the theme, UI and charts styles:

```css
@import 'tailwindcss';
@import '@protoyard/themes/base.css';
@import '@protoyard/ui/styles.css';
@import '@protoyard/charts-ui/styles.css';
@import '@protoyard/analytics-ui/styles.css';
```

## Entry points

| Import | View |
| --- | --- |
| `@protoyard/analytics-ui` | `ANALYTICS_VIEWS` and the data contract types (imports no view); KPI tiles will live here |
| `@protoyard/analytics-ui/date-range` | Date range picker with presets, comparison and granularity |
| `@protoyard/analytics-ui/filters` | Filter builder, segment picker, breakdown selector |
| `@protoyard/analytics-ui/cohort` | Cohort retention table |
| `@protoyard/analytics-ui/funnel` | Funnel analysis |
| `@protoyard/analytics-ui/grid` | Keyboard-editable dashboard grid and widget cards |

**Status:** scaffold (PLAN_003 `T-analytics-scaffold`). Each subpath currently
exports only its `VIEW` name; components arrive with the following PLAN_003
analytics tasks. Every mutation (save a segment, move a widget) will be a
callback that returns the prototype's service promise, so a `Button` shows
pending feedback; the kit never writes to the database itself.

## Tests

```bash
pnpm vitest run packages/analytics-ui
pnpm --filter @protoyard/analytics-ui typecheck
```
