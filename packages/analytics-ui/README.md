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
| `@protoyard/analytics-ui/grid` | `DashboardGrid`, `WidgetCard` (and the layout helpers from `@protoyard/analytics`) |

**Status:** scaffold (PLAN_003 `T-analytics-scaffold`). Each subpath currently
exports only its `VIEW` name; components arrive with the following PLAN_003
analytics tasks. Every mutation (save a segment, move a widget) will be a
callback that returns the prototype's service promise, so a `Button` shows
pending feedback; the kit never writes to the database itself.

## Dashboard grid (`./grid`)

`DashboardGrid` lays out widgets from a layout stored as data
(`DashboardLayoutSchema` in `@protoyard/analytics`). It is page content
inside whatever app shell the prototype uses, not a shell itself.

```svelte
<DashboardGrid {layout} label="Growth" editing={editing} onchange={(next) => runService(() => saveLayout(next))}>
  {#snippet widget(item)}
    <WidgetCard title={item.title ?? item.widget} menu={menuFor(item)}>
      {#snippet children({ expanded })}<RevenueChart {expanded} />{/snippet}
    </WidgetCard>
  {/snippet}
</DashboardGrid>
```

- **Layout:** 12 columns, `rowHeight` per row unit (default 80 px), `gap`.
  Below `collapseBelow` container width (default 640 px), measured with
  `ResizeObserver` so it also works inside a phone shell, the grid becomes
  one column in reading order (row, then column). The DOM is always in
  reading order.
- **Editing:** each widget gets a toolbar: a handle button that takes arrow
  keys (move) and Shift + arrow keys (resize), plus move, wider/narrower and
  taller/shorter buttons. Up and down swap with the nearest widget in the
  same columns; left and right shift one column; neighbours make room and
  everything compacts upward. Focus stays on the moved widget's handle and a
  polite live region announces the new position.
- **Saving:** every edit calls `onchange(layout)`. Return the service
  promise: the grid shows the change at once, is `aria-busy` with its
  buttons in their loading state until the promise settles, and restores
  the previous layout if it rejects. When the saved `layout` prop changes
  (liveQuery, scenario load), the grid follows it.
- **WidgetCard:** a titled `section` with an optional actions menu
  (`DropdownMenu`), loading/empty/error states (retry with pending
  feedback), and an Expand button that opens the same content in a large
  dialog (`children` receives `{ expanded }`).

Size (esbuild minify + gzip -9, `svelte` and `@protoyard/ui` external since
prototypes already ship them): `DashboardGrid` + `WidgetCard` 3.6 KB, or
4.3 KB with the layout engine. Widgets load their chart chunks themselves.

## Tests

```bash
pnpm vitest run packages/analytics-ui
pnpm --filter @protoyard/analytics-ui typecheck
```
