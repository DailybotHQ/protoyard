# Product Analytics

A Protoyard starter for product analytics. It has six screens, all computed
from simulated events in IndexedDB:
- **Overview:** KPI tiles (with comparison and sparkline) and an editable 12-column dashboard grid whose layout is saved.
- **Trends:** events or unique users over time, with an event picker, breakdowns, a filter builder and saved segments.
- **Funnels:** the activation funnel with breakdowns and time to convert.
- **Retention:** daily or weekly cohorts, "active in period" or "not yet churned".
- **Live:** a counter that follows simulated time, and the latest events.
- **Segments:** rename and delete, with ownership rules.

Everything is fictional and simulated. The roles are a UX simulation, not
security.

```bash
pnpm protoyard new my-analytics --template analytics
pnpm protoyard dev my-analytics
```

| Scenario | What you see |
| --- | --- |
| `empty` | Tracking just installed: no users or events, every empty state |
| `active` *(default)* | 90 days, weekly rhythm: 80 tracked users, ~1,500 events, two saved segments |
| `launch-spike` | A launch 3 days ago: a wave of new signups (dense, ~3,400 events) |
| `outage` | The `active` quarter with a 2-day incident 6 days ago: events dropped to a tenth |
| `massive` | ~750 users and ~10,000 events, for density and performance |
| `viewer` | Same world as `active`, seen by a read-only viewer (controls hidden **and** services blocked) |

Personas are fixed so links stay meaningful:

| Persona | Name | Role |
| --- | --- | --- |
| `user_0001` | Amara | owner |
| `user_0002` | Jonas | admin |
| `user_0003` | Lucía | member |
| `user_0004` | Kenji | viewer |

Open DevTools with **Ctrl/⌘ + .** to switch persona, load scenarios, go
offline, advance time (the Live counter moves) and take snapshots.

| Role | Dashboards | Segments |
| --- | --- | --- |
| owner, admin | edit layout, rename | create, rename and delete any |
| member | edit layout, rename | create; rename and delete their own |
| viewer | read | read |

## Layout

```text
protoyard.json               manifest (id, slug, scenarios, storage namespace + schemaVersion)
src/prototype.ts             definePrototype(): schema + policy + scenarios + generator + timeline + integrity
src/database/schema.ts       users, events ([type+at], userId, at), dashboards, segments, counters, activity
src/domain/policy.ts         simulated roles → capabilities (dashboards:edit, segments:*)
src/domain/validation.ts     zod: DashboardLayoutSchema, filterSchemaFor(EVENT_CATALOG), names
src/domain/services.ts       saveLayout / rename / segment create, rename, delete (assert → zod → environment.run → transaction)
src/domain/catalog.ts        event labels, filterable properties, the activation funnel
src/domain/metrics.ts        pure read model: events in range (indexes), KPIs, trend series, counts
src/scenarios/index.ts       six scenarios from @protoyard/scenarios presets + analytics fragments
src/scenarios/generators.ts  generate(ctx) → WorldSeed; traffic shape (launch wave, outage); live timeline
src/scenarios/seeds.ts       the default dashboard layout and two saved segments
src/widgets/*.svelte         dashboard widgets, one lazy chunk each (WIDGET_LOADERS)
src/screens/*.svelte         Overview, Trends, Funnels, Retention, Live, Segments (lazy routes)
tests/generators.test.ts     determinism, integrity per scenario, scale, funnel, traffic shape, timeline
tests/services.test.ts       persistence across reload, field errors, roles and ownership, offline writes nothing
tests/metrics.test.ts        KPIs, buckets and breakdowns, counts, segment filters
```

## How the data flows

Screens read with `liveQuery(querier, { initial, deps })`, with the date
range (and event type) in `deps`.
- Events of one type in a range use the `[type+at]` index; every type in a range uses `at`.
- Aggregation runs in `src/domain/metrics.ts` with `@protoyard/analytics` (`bucketize`, `compileFilter`, `computeFunnel`, `computeRetention`).
- The date range is shared presentation state (`src/lib/range.svelte.ts`), resolved against the **simulated** clock.

Charts come from `@protoyard/charts-ui` and views from `@protoyard/analytics-ui`.
Each lives in its route's chunk, or in a widget's own chunk on the Overview.

## Add a widget

1. Add a key to `WIDGETS` in `src/scenarios/seeds.ts`. Add a placement to
   `DEFAULT_LAYOUT` if new workspaces should show it, then bump
   `ANALYTICS_TEMPLATE_GENERATOR_VERSION`.
2. Create `src/widgets/<Name>Widget.svelte`. It takes `WidgetProps` (`title`,
   `events`, `range`, `granularity`) and renders one chart.
3. Register it in `WIDGET_LOADERS` (`src/widgets/types.ts`) as
   `() => import('./<Name>Widget.svelte')`.

## Add a service

Follow `src/domain/services.ts`:

1. Add a capability in `src/domain/policy.ts`.
2. Add a zod schema in `src/domain/validation.ts`.
3. Write the method:
   - call `session.assert(…)` first;
   - then `parse(Schema, input)`;
   - then `environment.run('area.action', () => db.transaction('rw', …))`, writing an `activity` row in the same transaction.
4. Call it from a `@protoyard/ui` `Button`, or a grid or segment callback,
   that returns the promise, so pending feedback shows.

## Docs

- Agent spec: [AGENTS.md](AGENTS.md) and [docs/](docs/) (`pnpm protoyard spec analytics --write`).
- Kits: [analytics](../../packages/analytics/README.md), [analytics-ui](../../packages/analytics-ui/README.md), [charts-ui](../../packages/charts-ui/README.md).
