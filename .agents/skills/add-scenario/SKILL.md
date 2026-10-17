---
name: add-scenario
description: Add a deterministic scenario to a Protoyard prototype by composing presets and fragments, wiring generator knobs and integrity rules, and proving determinism with tests.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
# === Documentation (ignored by harnesses, useful for humans) ===
tier: standard
intent: create
max-files: 5
---

# Skill: Add a scenario

## Goal

Add one reproducible world to a prototype (or template): same seed, reference
time and generator version always produce the same data, and every relation
is valid.

## When to use

- A product state needs to be demonstrable: a role, a lifecycle stage, a
  density, a billing state, a network condition.
- The `scenario-designer` agent is designing a full set.

## Inputs

- `slug` of the prototype, the scenario `id` (kebab-case), what it shows.

## Steps

1. **Read the current set.** `pnpm protoyard scenario list <slug>`, then
   `prototypes/<slug>/src/scenarios/index.ts` and `generators.ts`.
2. **Compose, don't copy.** Build from the shared presets and single-axis
   fragments in `packages/scenarios/src/presets.ts`:
   ```ts
   import { composeScenario, fragments, presetScenario } from '@protoyard/scenarios/presets';

   const repWeek = presetScenario('first-week', shared, fragments.role('rep'), {
     id: 'rep-first-week',
     name: 'Sales rep, first week',
     group: 'Roles',
     description: 'A rep who joined five days ago, seeing a mature pipeline.',
     generators: { crm: { companies: 18, dealsPerCompany: [1, 3], winRate: 0.5 } },
   });
   ```
   Derive variants from an existing world with
   `composeScenario(base, fragment…)` or declare `extends: '<id>'` (resolved
   against the prototype's scenarios, then the presets). Working example:
   `templates/task-manager/src/scenarios/index.ts`. Fragments cover density,
   activity, role, tenure, organization age and size, account age,
   onboarding, subscription, network, feature flags, appearance and tags.
3. **Fix the seed and reference time** for the prototype (a shared
   `REFERENCE_TIME` constant), so presets' defaults do not leak in.
4. **Knobs.** Domain-specific parameters live under
   `generators.<prototype>` and have a typed interface beside the scenarios
   (for example `CrmGeneratorOptions` in
   `prototypes/crm-demo/src/scenarios/index.ts`). The generator reads them
   with defaults and scales counts with `ctx.scale(n)` for `density`.
5. **Generator changes** (only if the new state needs new data): use only
   `ctx.rng`, `ctx.faker`, `ctx.ids.next()` and `ctx.time`. Create the
   actor persona with the scenario's `actor.id` and its membership with
   `actor.role`. Keep timestamps between organization creation and
   `referenceTime`. Bump the generator version constant (for example
   `CRM_GENERATOR_VERSION`) if existing seeds can now produce different data.
6. **Integrity.** If you added tables or foreign keys, extend
   `integrity.relations` and `integrity.timestamps` in `src/prototype.ts`.
7. **Register** the id in `prototypes/<slug>/protoyard.json` → `scenarios`.
8. **Test** in `prototypes/<slug>/tests/generators.test.ts` with `contextFor`
   from `tests/support/generate-context.ts`: the new scenario is
   deterministic (two runs `toEqual`), a different seed differs, its defining
   property holds (role, emptiness, density), and the existing all-scenarios
   integrity loop still passes.

## Validation

```bash
pnpm vitest run prototypes/<slug>/tests/generators.test.ts
pnpm protoyard scenario validate <slug>      # runs every generator + integrity (executes local code)
pnpm protoyard validate <slug>               # scenario ids match protoyard.json
```

## Notes

- Never `Math.random()`, `Date.now()` or argument-less `new Date()`.
- Timeline events depend only on the day and stable ids; transitions resolve
  in `applyEvent` (see `prototypes/crm-demo/src/scenarios/generators.ts`).
- A scenario is a load, not an override: manual tweaks belong in DevTools
  overrides or snapshots (ADR-007 in `docs/DECISIONS.md`).
- Fictional data only (`EXAMPLE_EMAIL_DOMAINS` from `@protoyard/scenarios`).
