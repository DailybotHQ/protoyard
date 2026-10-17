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
colors come from a fixed palette. Plan and billing status follow `organization.subscription`.

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

## Timeline: `dailyEvents(ctx, { perDay, make, hours? })`

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
