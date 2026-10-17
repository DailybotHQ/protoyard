# Onboarding Wizard

A Protoyard starter for multi-step setup flows: **Profile → Workspace → Invite
teammates → Preferences → Done**. Each step validates with zod and shows
field-level errors; the wizard position and every answer are saved to
IndexedDB **after every step** (Next, Back, Skip, jumping from the stepper),
so a reload resumes exactly where the person left off. Optional steps can be
skipped, the last step summarizes everything, and finishing leads to a
post-onboarding home with a confirmed **Restart onboarding**.

```bash
pnpm protoyard new my-setup --template onboarding
pnpm protoyard dev my-setup
```

| Scenario | What you see |
| --- | --- |
| `not-started` | Signed up a minute ago: step 1, nothing saved yet |
| `half-complete` *(default)* | `actor.onboardingProgress: 0.5` → profile and workspace done, resumes at step 3 |
| `completed` | Finished a week ago: the post-onboarding home with pending invitations |
| `viewer` | A viewer at the Workspace step: they can review it but not change it, and cannot invite |

The wizard position is **derived from `scenario.actor.onboardingProgress`**
(0..1) by `stepsForProgress()` in `src/domain/steps.ts`: the progress times
the four answer steps, rounded, is the number of steps already done.

Answers are saved when a step is submitted; text typed into a step and not
submitted yet is not persisted. "Restart onboarding" moves back to step 1 and
keeps earlier answers as defaults; invitations already created stay pending
(revoke them from the home). Choosing a color mode in Preferences really
changes the theme (it is stored per persona by the runtime).

| Role | Profile & preferences | Workspace step | Invite step |
| --- | --- | --- | --- |
| owner / admin | edit | edit | invite |
| member | edit | read-only, continue | invite |
| viewer | edit | read-only, continue | blocked, continue |

## Layout

```text
protoyard.json               manifest (id, slug, scenarios, storage namespace + schemaVersion)
src/prototype.ts             definePrototype(): schema + policy + scenarios + generator + integrity rules
src/database/schema.ts       step ids + Dexie stores + row types (onboarding, workspaces, invitations)
src/domain/steps.ts          pure step logic: labels, next/previous, canVisit, progress mapping
src/domain/validation.ts     one zod schema per step + ValidationError + slugify
src/domain/services.ts       services: assert → validate → environment.run → one transaction per step
src/domain/policy.ts         roles → capabilities
src/scenarios/index.ts       scenarios composed from @protoyard/scenarios presets/fragments
src/scenarios/generators.ts  generate(ctx) → WorldSeed; wizard position from onboardingProgress
src/lib/context.ts           provideOnboarding()/useOnboarding(): services + live progress/workspace
src/screens/Onboarding.svelte  the wizard (Stepper + the current step, keyed on the stored step)
src/screens/Home.svelte      post-onboarding home (redirects to the wizard until finished)
src/steps/*.svelte           one component per step
src/components/*.svelte      header, step heading/footer, restart confirmation
tests/generators.test.ts     determinism, integrity, progress → step mapping
tests/services.test.ts       step persistence across reloads, resume, validation, roles, offline
```

## Add a step

1. Add its id to `STEP_IDS` in `src/database/schema.ts` (order = wizard order;
   add it to `OPTIONAL_STEPS` if it can be skipped) and an answer field to
   `OnboardingState`. Because rows change shape, add a schema version (below).
2. Add a label in `STEP_DETAILS` (`src/domain/steps.ts`) and a zod schema in
   `src/domain/validation.ts`.
3. Add a service next to `saveProfile` in `src/domain/services.ts`:
   `mutate('onboarding.<step>', (state, at) => settle({ ...state, <answer> }, '<step>', 'completed', at))`.
4. Create `src/steps/<Name>Step.svelte` (copy `ProfileStep.svelte`: a `<form id="step-…">`,
   `FormField`s, `runService(…)`, `isValidationError` → inline errors, `<StepFooter>`),
   and render it in `src/screens/Onboarding.svelte`.
5. Show the answer in `DoneStep.svelte` and, if useful, on `Home.svelte`.

## Add a table

1. In `src/database/schema.ts` add a **new** version — never edit version 1:
   `{ version: 2, stores: { teams: 'id, name' } }` and `teams: EntityTable<Team, 'id'>`
   in `OnboardingDatabase`. Add `upgrade(tx)` if existing rows need a new field
   (e.g. backfill an answer on `onboarding` rows).
2. Bump `storage.schemaVersion` in `protoyard.json` to `2`.
3. Return rows from the generator (`tables: { …, teams }`) and add integrity
   relations/timestamps in `src/prototype.ts`.

## Add a service

Every mutation: `session.assert(capability)` → `parse(Schema, input)` →
`environment.run('area.action', …)` → write inside `db.transaction('rw', …)`.
For wizard steps, `mutate()` already does the transaction and stores the new
position together with the answer. Grant new capabilities to roles in
`src/domain/policy.ts`; in components call services through
`runService(() => …, { success })`.

## Add a screen

Create `src/screens/Thing.svelte`, register `{ path: '/thing', component: Thing }`
in `src/App.svelte` and link with `<a href="#/thing">`. Read data with
`liveQuery(() => db.table.toArray(), { initial: [], deps: () => … })`.

## Add a scenario

Append to `src/scenarios/index.ts` and list its id in `protoyard.json → scenarios`.
Use `fragments.onboarding(progress)` to place the actor in the wizard:

```ts
presetScenario('six-month-new-member', fragments.onboarding(0.75), {
  id: 'member-almost-done',
  name: 'Member, almost done',
  seed: 55,
  referenceTime: REFERENCE_TIME,
  organization,
  actor: { id: 'user_0003', role: 'member' },
}),
```

Generators must use `ctx.rng`, `ctx.ids` and `ctx.time` — never `Math.random()`
or `Date.now()`. Bump `ONBOARDING_GENERATOR_VERSION` when the same seed would
produce a different world.

## Checks

```bash
pnpm vitest run prototypes/my-setup
pnpm --filter @prototype/my-setup typecheck
pnpm protoyard build my-setup
```
