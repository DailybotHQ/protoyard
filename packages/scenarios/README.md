# @protoyard/scenarios

The scenario engine: a seeded generator SDK, reusable presets, identity helpers, referential
integrity checks and timeline helpers. Domain-free: it never assumes `deals` or `tasks` exist.

## Generator SDK

```ts
import { createGenerateContext, generateTeam, GENERATOR_SDK_VERSION } from '@protoyard/scenarios';

export function generate(ctx: GenerateContext): WorldSeed {
  const team = generateTeam(ctx); // org + actor + members + memberships
  const deals = Array.from({ length: ctx.scale(40) }, () => ({
    id: ctx.ids.next('deal'), // deal_0001…
    ownerId: ctx.rng.pick(team.personas).id,
    amount: ctx.rng.int(500, 50_000),
    title: ctx.faker.commerce.productName(),
    createdAt: ctx.time.daysAgo(ctx.rng.int(0, 30)).toISOString(),
  }));
  return { ...team, tables: { deals } };
}
```

`createGenerateContext(scenario)` returns the core `GenerateContext`:

- `rng`: `createRng(seed)`. Never use `Math.random()`.
- `faker`: a **new** `Faker({ locale: [en, base] })`, seeded and with its reference date set
  to `scenario.referenceTime`. The global faker is never used.
- `ids`: `createIdFactory()`. `time`: `createTimeHelpers(referenceTime)`.
- `scale(base)`: density factor (empty 0, sparse 0.25, normal 1, dense 4, massive 25), rounded,
  at least 1 when `base > 0` and density ≠ empty.

Same scenario, seed, reference time and `GENERATOR_SDK_VERSION` give a deep-equal world. Bump
`GENERATOR_SDK_VERSION` whenever helper output can change. The runtime records it in
`ActiveScenarioInfo.generatorVersion`.

## Identity: `generateTeam(ctx, options?)`

It always creates the scenario actor (`scenario.actor.id`) with the scenario role, onboarding
state and `joinedAt = referenceTime − joinedDaysAgo`. The organization is created exactly
`ageDays` ago, so actor tenure is independent from organization age. The actor is clamped so
it never predates the organization. Other members join between the organization's creation
and now. Names are deterministic, emails are unique on `example.com`/`example.org`, and avatar
colors come from a fixed palette. Every persona gets a library `avatar` (`av-NNN` from
`@protoyard/avatars`) dealt from a seeded pool on its own fork (`protoyard:avatars:team`): no face
repeats until all 175 are used, and the same seed gives the same faces. Pass `actor: { avatar }` to
choose the actor's face. Plan and billing status follow `organization.subscription`.

The library's seeded pickers (`createAvatarPool`, `assignAvatars`, `pickAvatar`, `isAvatarId`,
`AVATAR_IDS`) are re-exported here, so generators that already depend on this package (blueprint
worlds) deal faces without another dependency.

Options: `size`, `roles` (weights `{ member: 6, viewer: 1 }` or a cycled list), `titles`,
`organization` / `actor` field overrides, `emailDomain`. It uses a forked rng, so team size
never shifts the rest of your generator's random stream.

## Presets and composition

```ts
import { PRESETS, fragments, composeScenario, resolveScenarios } from '@protoyard/scenarios';
// or: import { PRESETS } from '@protoyard/scenarios/presets';

// In src/scenarios/index.ts: extend a preset by id…
{ id: 'active-month', extends: 'active-month', name: 'Active month', seed: 42, referenceTime: '…' }
// …or compose in code:
composeScenario(PRESETS['first-week'], { id: 'rep-week' }, fragments.role('member'), fragments.network('slow'));
```

| Preset id | What it models |
| --- | --- |
| `brand-new-signup` | empty, onboarding not started |
| `onboarding-in-progress` | onboarding progress 0.5 |
| `first-week` | 7 days, sparse |
| `active-month` | day-30 active user, small team |
| `six-month-new-member` | org 180 days old, actor joined today (member) |
| `power-user-year-one` | 365 days, dense, intense activity |
| `dormant-account` | activity `dormant`, tag `stale` |
| `read-only-viewer` | role `viewer` |
| `workspace-admin` / `workspace-owner` | role `admin` / `owner` |
| `subscription-free` / `subscription-pro` / `subscription-expired` | billing states |
| `offline` / `slow-network` | environment network conditions |
| `large-organization` | massive density, 250 people, enterprise |

Presets carry a fixed seed and reference time so they validate on their own; prototypes
override both. Fragments (`fragments.density`, `.activity`, `.role`, `.tenure`,
`.organizationAge`, `.organizationSize`, `.accountAge`, `.onboarding`, `.subscription`,
`.network`, `.featureFlags`, `.appearance`, `.tags`) each describe one axis.

`composeScenario` deep-merges (objects merge, arrays and scalars are replaced, `undefined`
never overwrites) and validates with `ScenarioSchema`. `resolveScenarios(inputs, PRESETS)`
resolves `extends` against the prototype's other scenarios first, then presets. A scenario
may extend the preset that shares its id. Cycles, unknown parents and duplicate ids throw a
`ScenarioDefinitionError` that names the ids involved.

## Integrity: `validateWorld(seed, rules)`

```ts
validateWorld(world, {
  relations: { deals: { companyId: 'companies', ownerId: 'py_personas' } }, // null allowed, arrays per item
  timestamps: { deals: ['createdAt'] }, // ≥ org creation, ≤ referenceTime
  referenceTime: scenario.referenceTime,
}); // → IntegrityViolation[]
```

Built-in checks always run: unique ids per table, memberships referencing existing
personas/organizations, nobody joining before their organization existed, and no identity
dated after the reference time. The runtime runs this on every load using
`definition.integrity` and throws `WorldIntegrityError` on violations.

## Timeline: `dailyEvents`, named sources and local zones

```ts
timeline: (ctx) =>
  dailyEvents(ctx, {
    perDay: ({ rng }) => rng.int(0, 3),
    make: ({ rng, at }) => ({ type: 'deal.created', payload: { amount: rng.int(100, 900) } }),
  }),
```

Everything about a day is derived from scenario seed + day, never from the requested window:
the count, the instants (inside `hours`, default 8–18 UTC) and the per-slot rng. Advancing 7
days at once or 1 day seven times yields the same events with the same
`evt:<scenario>:<YYYY-MM-DD>:<n>` ids. Window bounds are `(from, to]`. Return `null` from
`make` to leave a slot empty.

### Named sources

Kits register collectors under a stable id so several packages can feed
`scenarios.advance()` without one shared timeline function:

```ts
import {
  localTimeToUtc,
  registerTimelineSource,
  timelineFromSources,
} from '@protoyard/scenarios';

registerTimelineSource({
  id: 'billing',
  collect: async (ctx) => {
    const at = localTimeToUtc('2026-10-14', '09:00', 'America/New_York');
    if (at <= ctx.from || at > ctx.to) return [];
    return [
      {
        id: 'evt:invoice-due:2026-10-14',
        type: 'billing.invoice.due',
        at: at.toISOString(),
        payload: { invoiceId: 'inv_1' },
        source: 'timeline',
      },
    ];
  },
  apply: {
    'billing.invoice.due': async (event, ctx) => {
      /* idempotent puts */
      void event;
      void ctx;
    },
  },
});

const { timeline, applyEvent } = timelineFromSources();
```

`collectTimelineEvents` merges every source, sorts by `at` then `id`, rejects
duplicate ids, and caps output (10,000 events per source and 50,000 total by
default). Event types in `apply` are exclusive across sources.
`clearTimelineSources()` is for tests.

### Local time zones

Always pass an explicit IANA zone (`UTC`, `Europe/Madrid`, …). Helpers never
read the host zone. `localTimeToUtc(day, hhmm, timeZone)` maps a civil day and
wall time to a UTC `Date` (DST gaps move forward; folds take the earlier
instant). `localDayOf(at, timeZone)` returns the civil `YYYY-MM-DD`.
`localDayBounds(day, timeZone)` yields a 23-, 24- or 25-hour day on DST edges.

Full reference: [docs/SCENARIOS.md](../../docs/SCENARIOS.md#named-timeline-sources).

## Series, schedules, events and geo

Deterministic data for charts, calendars, feeds and maps. Every value comes from scenario id +
seed + its own key and date (or index), never from the requested window, and nothing reads
`Math.random()` or the wall clock (a test greps the sources).

```ts
import { eventStream, geoPoints, scenarioSeriesOptions, schedule, timeSeries } from '@protoyard/scenarios';

timeSeries({ ctx, key: 'revenue', months: 12, base: 1_250_000, trend: 'growth', seasonality: 'annual' });
timeSeries({ ctx, key: 'visits', base: 300, ...scenarioSeriesOptions(ctx) }); // days, seasonality, spikes from the scenario
eventStream({ ctx, days: 14, ratePerDay: 6, kinds: { 'ticket.created': 5, 'ticket.solved': 3 } });
schedule({ ctx, resources: ['room-a'], recurring: [{ label: 'Stand-up', every: 'daily', startMinute: 540, durationMinutes: 15 }] });
geoPoints({ ctx, region: 'metro-grid', count: 200, key: 'stores' });
```

- `timeSeries` ends at the bucket containing `to` (default the reference time); `base` is the
  level there, so more history adds older points only.
- `schedule` never overlaps slots of one resource; occupancy defaults to the scenario's
  `generators.schedule.occupancy` (the `busy-week` preset sets 0.9), else 0.5.
- `geoPoints` uses fictional regions (`GEO_REGIONS`) placed in open ocean. Each point has an
  index-keyed random stream, so increasing `count` preserves existing points; `key` separates
  collections in one scenario. Coordinates are clamped to the region bounds and rounded to five
  decimals; they never identify real addresses.
- `eventStream` delegates to `dailyEvents`, so event ids remain stable when the requested window
  changes. `kinds` supplies relative event weights; optional seasonality and burstiness adjust
  the daily counts.
- `quarter-of-history`, `launch-spike` and `busy-week` are opt-in presets. The `history`,
  `seasonality`, `spike` and `occupancy` fragments set the corresponding `generators.series` or
  `generators.schedule` knobs read by these helpers.

Full reference: [docs/SCENARIOS.md](../../docs/SCENARIOS.md#series-schedules-events-and-geo).

## Package output

The manifest keeps TypeScript source exports for workspace development. `pnpm build:packages --filter engine` creates the ESM and declaration files under `dist/` that the packed manifest exposes.
