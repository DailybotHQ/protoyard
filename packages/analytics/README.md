# @protoyard/analytics

Framework-agnostic analytics engine for Protoyard prototypes
([ADR-021](../../docs/DECISIONS.md)): event and metric contracts, and (as the
PLAN_003 analytics tasks land) date ranges with comparison, bucketing,
aggregations, filters and segments, funnels, cohorts and deterministic
analytics generators. No Svelte; everything is plain TypeScript and zod,
tested in Node. The Svelte kit is [`@protoyard/analytics-ui`](../analytics-ui/README.md).

## Entry points

`sideEffects: false`; import a subpath to pull in only that module.

| Import | Contents today |
| --- | --- |
| `@protoyard/analytics` | `AnalyticsEventSchema` (id, lowercase `type`, `userId`, ISO `at`, primitive `properties`), `GranularitySchema` (`hour`/`day`/`week`/`month`), `MetricPoint` |
| `@protoyard/analytics/generators` | `ANALYTICS_GENERATOR_VERSION` |
| `@protoyard/analytics/funnel` | `FunnelStepSchema`, `FunnelDefinitionSchema` (2–12 steps, unique ids) |
| `@protoyard/analytics/cohort` | `RetentionIntervalSchema`, `RetentionPeriodsSchema` |

**Status:** scaffold (PLAN_003 `T-analytics-scaffold`). This table lists only
what exists. Computations and generators come with the following PLAN_003
analytics tasks.

## Rules

- "Now" always comes from the caller (the simulated clock), never `Date.now()`.
- Generators use only the scenario context (`ctx.rng`, `ctx.ids`, `ctx.time`,
  `ctx.scale`) and bump `ANALYTICS_GENERATOR_VERSION` when output changes.
- Bucketing is UTC. Money is integer cents.

## Tests

```bash
pnpm vitest run packages/analytics
pnpm --filter @protoyard/analytics typecheck
```
