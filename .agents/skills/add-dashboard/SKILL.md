---
name: add-dashboard
description: Add an analytics dashboard (KPI row, editable widget grid, date range and filters) to a Protoyard prototype with @protoyard/analytics, analytics-ui and charts-ui on lazy routes, saving through services and proving it with tests, a scenario bench and the bundle budget.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
# === Documentation (ignored by harnesses, useful for humans) ===
tier: standard
intent: create
max-files: 12
---

# Skill: Add a dashboard

## Goal

Give a prototype a working analytics dashboard:
- KPI tiles against the previous period;
- an editable grid of chart widgets whose layout persists;
- a shared date range with comparison;
- filters or saved segments.

All of it computes from the prototype's own simulated rows and stays inside
the bundle and generation budgets.

## When to use

- A brief asks for a dashboard, an overview with metrics, trends, funnels or
  retention, or "an analytics product".
- An existing prototype needs an Overview screen built from its data.
- For a brand-new analytics product, start from the template instead:
  `pnpm protoyard new <slug> --template analytics`. It already has
  everything below; then use this skill to adapt it.

## Inputs

- `slug` of the prototype.
- The metrics to show (what is counted, over which rows and time field) and
  the widgets (trend, breakdown, funnel, mix…).
- Who may edit the layout (a capability) and who only reads.

## Steps

1. **Read the guides first.**
   - [docs/ANALYTICS.md](../../../docs/ANALYTICS.md): data flow, views, limits.
   - [docs/CHARTS.md](../../../docs/CHARTS.md): which chart for which data, props, a11y.
   - The working reference is `templates/analytics/src/` (`screens/Overview.svelte`,
     `widgets/`, `domain/metrics.ts`, `lib/range.svelte.ts`).
2. **Dependencies and styles.** Add `@protoyard/analytics`,
   `@protoyard/analytics-ui` and `@protoyard/charts-ui` (`workspace:*`) to
   `prototypes/<slug>/package.json`, and import their styles in `src/app.css`
   after the renderer's:
   ```css
   @import "@protoyard/charts-ui/styles.css";
   @import "@protoyard/analytics-ui/styles.css";
   ```
   A new dependency changes `pnpm-lock.yaml`, which the owner commits
   (AGENTS rule 9).
3. **Data.** The metrics need rows with a time field in ISO UTC.
   - If they are events, add an `events` table indexed for range scans, for example `id, [type+at], at` (use `add-entity` for the version and migration).
   - Add a `dashboards` table `{ id, name, layout, ownerId, createdAt, updatedAt }`; validate `layout` with `DashboardLayoutSchema` from `@protoyard/analytics`.
4. **Read model.** Put pure helpers in `src/domain/metrics.ts`:
   - events in a range through the index;
   - KPIs;
   - `bucketize` series;
   - counts by property;
   - filters through `compileFilter`.

   Unit-test them in `tests/metrics.test.ts`.
5. **Generator.** Seed the dashboard row (the default layout) and enough rows
   for every scenario.
   - Use `@protoyard/analytics/generators` (`generateProductEvents`, `generateTimeSeries`, `analyticsFragments`) with `ctx.rng` forks, `ctx.ids` and the reference time.
   - Add `integrity.relations` for every foreign key.
   - Bump the generator version if existing seeds change (`add-scenario`).
6. **Service and policy.** Add a capability (for example `dashboards:edit`)
   and `dashboards.saveLayout(id, { layout })`:
   - `session.assert` → `parse(Schema)` → `environment.run` → `db.transaction`;
   - write an audit row in the same transaction.

   Viewers must be denied at the service, not only in the UI.
7. **Screen, on a lazy route.**
   - `liveQuery(querier, { initial, deps: () => [range.start, range.end, filter…] })`.
   - `KpiRow` / `KpiTile` (`previous` for the delta).
   - `DateRangePicker` (shared state like `lib/range.svelte.ts`, resolved against `useClock().now`).
   - `DashboardGrid` with `editing={can(…)}` and `onchange={(layout) => services.dashboards.saveLayout(id, { layout })}`, returning the promise so the grid shows pending feedback and reverts on failure.
   - Inside `WidgetCard`, each widget is its own lazy chunk (`WIDGET_LOADERS: { key: () => import('./TrendWidget.svelte') }`) rendering one charts-ui chart.
8. **States.** Show a skeleton while `data.current === undefined`, an
   `ErrorState` on `data.error`, and an `EmptyState` for the empty scenario.
   Charts handle their own loading, empty and error states.
9. **Tests.**
   - `tests/services.test.ts`: the layout persists across `harness.reload`, the viewer gets `PermissionDeniedError`, and offline writes nothing.
   - `tests/generators.test.ts`: determinism and integrity for every scenario.
10. **Spec.** Run `pnpm protoyard spec <slug> --write`, then describe the
    dashboard in `docs/SCREENS.md` and the layout flow in `docs/FLOWS.md`.

## Validation

```bash
pnpm vitest run prototypes/<slug>
pnpm protoyard scenario bench <slug> --check        # every scenario generates within budget
pnpm protoyard budget <slug>                        # initial JS within budget (charts stay lazy)
pnpm protoyard validate <slug> --strict-spec --build
```

## Notes

- Charts and analytics views must stay out of initial JS. Import them only
  from lazy routes or widget chunks; `budget` fails otherwise.
- "Now" is the simulated clock (`useClock()`), never `Date.now()`. Bucketing
  is UTC, and money is integer cents (`unit="cents"`).
- Aggregation runs in the browser. Past a few tens of thousands of rows per
  screen, store daily rollups plus a sample and label the estimates, as the
  Pebblestat flagship does (`prototypes/pebblestat-analytics-demo`, docs/SPEC.md → Honest boundaries).
- Every chart needs a `title`; never rely on color alone (legends stay on);
  keep "View as table" enabled.
- Fictional data only.
