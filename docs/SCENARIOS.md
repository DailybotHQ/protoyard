# Scenarios, personas, time and environment

A scenario answers one question: *what does this app look like for this
person, in this organization, after this much time, with these permissions,
this much data and these conditions?* This page covers how scenarios are
defined and generated, how personas and permissions work, and how time,
environment, links and snapshots fit around them.

API references: [packages/scenarios/README.md](../packages/scenarios/README.md)
(generator SDK, presets, integrity, timeline) and
[packages/runtime/README.md](../packages/runtime/README.md) (controllers).
Design decisions: ADR-006, 007, 008, 010 and 011 in
[DECISIONS.md](DECISIONS.md).

## The axes

Every axis is independent. A sales rep who joined last week can belong to an
organization that is a year old.

| Axis | Field | Values |
| --- | --- | --- |
| Organization age, size, plan, flags | `organization` | `ageDays`, `size`, `subscription` (`free`, `trial`, `pro`, `enterprise`, `expired`), `featureFlags`, `name`, `type`, `id` |
| Actor (who you are) | `actor` | `id` (persona to start as), `role`, `joinedDaysAgo`, `onboardingComplete`, `onboardingProgress` (0–1), `locale` |
| Data volume | `density` | `empty`, `sparse`, `normal`, `dense`, `massive` |
| Activity | `activity.level` | `none`, `low`, `normal`, `intense`, `dormant`, `reactivated` |
| Conditions | `environment` | `network`, `latencyMs`, `failureMode`, `failureRate`, `failureScope`, `subscription`, `featureFlags` |
| Look | `appearance` | `themeId`, `mode`, `reducedMotion`, `viewport`, `shell`, `device`, `orientation` |
| Prototype knobs | `generators` | Anything; passed untouched to your generator |

The platform never decides what "dense" means. Each generator interprets
`density` and `activity` for its own domain (deals, messages, transactions).

## `ScenarioSchema`

Defined in `packages/core/src/scenario.ts`. Fields and defaults:

| Field | Required | Default | Notes |
| --- | --- | --- | --- |
| `id` | yes | | kebab-case; must also be listed in `protoyard.json → scenarios` |
| `name` | yes | | Shown in DevTools and the gallery |
| `seed` | yes | | Non-negative integer |
| `referenceTime` | yes | | ISO 8601 instant: "now" for the seeded world |
| `version` | | `1` | Bump when the definition changes meaningfully |
| `description` | | `''` | |
| `group` | | `'General'` | Groups scenarios in DevTools (`Lifecycle`, `Roles`, `Billing`, `Conditions`…) |
| `extends` | | | A preset id or another scenario of this prototype |
| `organization` | | `{ id: 'org_0001', ageDays: 0, size: 1, subscription: 'free', featureFlags: {} }` | |
| `actor` | | `{ id: 'user_0001', role: 'owner', joinedDaysAgo: 0, onboardingComplete: true, locale: 'en-US' }` | The generator must create this persona |
| `density` | | `'normal'` | |
| `activity` | | `{ level: 'normal' }` | |
| `environment` | | `{}` | A partial patch, never a full state (see [Environment](#environment)) |
| `appearance` | | `{}` | |
| `generators` | | `{}` | |
| `tags` | | `[]` | |

Scenarios live in `src/scenarios/index.ts`. `defineScenario()` is an identity
helper for type inference. From `prototypes/crm-demo/src/scenarios/index.ts`:

```ts
const growingTeam = defineScenario({
  id: 'growing-team',
  name: 'Growing team, day 30',
  description:
    'A 12-person startup one month into using the CRM: a healthy pipeline, recent activity and an owner who set everything up.',
  group: 'Lifecycle',
  seed: 4218,
  referenceTime: REFERENCE_TIME,
  organization: { id: 'org_0001', name: 'Northwind Labs', ageDays: 30, size: 12, subscription: 'pro' },
  actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 30, onboardingComplete: true },
  density: 'normal',
  activity: { level: 'normal' },
  generators: { crm: { companies: 18, dealsPerCompany: [1, 3], winRate: 0.55 } },
  tags: ['default'],
});
```

Variations reuse a base with a spread. Same seed and organization, a
different actor:

```ts
defineScenario({
  ...growingTeam,
  id: 'viewer-view',
  name: 'Read-only viewer',
  description: 'A finance stakeholder with view access: every create, edit and delete is blocked.',
  group: 'Roles',
  actor: { id: 'user_0004', role: 'viewer', joinedDaysAgo: 12, onboardingComplete: true },
}),
```

`pnpm protoyard scenario list <slug> --details` prints what the runtime will
see:

```text
ID              NAME                             GROUP       DENSITY  SEED  VERSION
new-company     Brand-new signup                 Lifecycle   empty    1     1
growing-team *  Growing team, day 30             Lifecycle   normal   4218  1
…
```

## Presets, fragments and `extends`

`@protoyard/scenarios` ships domain-free building blocks.

| Preset id | Models |
| --- | --- |
| `brand-new-signup` | Empty workspace, onboarding not started |
| `onboarding-in-progress` | Onboarding halfway (progress 0.5) |
| `first-week` | 7 days in, sparse data |
| `active-month` | Day-30 active user, small team |
| `six-month-new-member` | 180-day-old organization, actor invited today as `member` |
| `power-user-year-one` | 365 days, dense data, intense activity |
| `dormant-account` | Activity `dormant` |
| `read-only-viewer` | Role `viewer` |
| `workspace-admin` / `workspace-owner` | Role `admin` / `owner` |
| `subscription-free` / `subscription-pro` / `subscription-expired` | Billing states |
| `offline` / `slow-network` | Network conditions |
| `large-organization` | 250 people, massive density, enterprise plan |

Fragments each describe one axis: `fragments.density`, `.activity`, `.role`,
`.tenure`, `.organizationAge`, `.organizationSize`, `.accountAge`,
`.onboarding`, `.subscription`, `.network`, `.featureFlags`, `.appearance`,
`.tags`.

Two ways to use them:

```ts
// 1. In src/scenarios/index.ts: extend by id. The runtime resolves `extends`
//    against this prototype's other scenarios first, then the presets.
{ id: 'first-week', extends: 'first-week', name: 'First week', seed: 303,
  referenceTime: '2026-10-16T09:00:00.000Z' }

// 2. In code: compose and validate.
import { composeScenario, fragments, PRESETS } from '@protoyard/scenarios';
composeScenario(PRESETS['first-week'], { id: 'rep-week' }, fragments.role('member'), fragments.network('slow'));
```

Merging rules: objects merge key by key, arrays and scalars are replaced,
`undefined` never overwrites. A scenario may extend the preset that shares
its id. Cycles, unknown parents and duplicate ids throw a
`ScenarioDefinitionError` naming the ids. Presets carry their own seed and
reference time (`2026-03-02T09:00:00.000Z`), so override both to anchor the
world where your prototype needs it.

## The generator

`generate(ctx)` in `src/scenarios/generators.ts` returns a `WorldSeed`:

```ts
interface WorldSeed {
  organizations: Organization[];
  personas: Persona[];
  memberships: Membership[];
  tables: Record<string, Row[]>;   // your domain tables, by name
  events?: DomainEvent[];          // history, stored in py_events with source 'seed'
}
```

It receives a `GenerateContext` built only from the scenario:

| `ctx.` | What it is |
| --- | --- |
| `scenario` | The resolved, validated scenario (seed already applied) |
| `rng` | Seeded PRNG (mulberry32): `next`, `int`, `float`, `chance`, `pick`, `weighted`, `shuffle`, `sample`, `fork(label)` |
| `faker` | A private Faker instance seeded with the scenario seed, reference date set to `referenceTime` |
| `ids` | Deterministic ids: `ids.next('deal')` → `deal_0001`, `deal_0002`… |
| `time` | Anchored at `referenceTime`: `now` (a `Date`), `daysAgo(days, jitterHours?)`, `hoursAgo`, `daysFromNow`, `between(from, to, rng.next)`, `iso` |
| `scale(base)` | "How many" for the density: `empty` 0, `sparse` 0.25×, `normal` 1×, `dense` 4×, `massive` 25×; rounded, at least 1 unless `empty` |

From `templates/blank/src/scenarios/generators.ts`:

```ts
export function generateBlankWorld(ctx: GenerateContext): WorldSeed {
  const world = identities(ctx);
  const requested = Number(ctx.scenario.generators.notes ?? ctx.scale(12));
  // …
  const notes: Note[] = ctx.rng.sample(NOTE_TOPICS, count).map(([title, body], i) => {
    const created = ctx.time.daysAgo(ctx.rng.int(1, ageDays), ctx.rng.int(0, 8));
    // …
    return { id: ctx.ids.next('note'), title, body, authorId, pinned: ctx.rng.chance(0.25),
             createdAt: ctx.time.iso(created), updatedAt: ctx.time.iso(updated) };
  });
  return { ...world, tables: { notes } };
}
```

`generateTeam(ctx, options?)` from `@protoyard/scenarios` builds an
organization, the scenario actor and teammates with memberships, if you do
not need a fixed cast. See its section in the package README.

Faker is the largest dependency, so the runtime loads it lazily with
`createGenerateContextAsync()` only when a world is generated (first seed,
load, reset, advance). Normal page opens never download it. Tests and Node
scripts can use the synchronous `createGenerateContext(scenario)`.

### Determinism rules

The same scenario, seed, reference time and generator versions must produce a
deep-equal world on every machine.

| Do | Never |
| --- | --- |
| `ctx.rng`, `ctx.rng.fork('label')` | `Math.random()` |
| `ctx.time.*` | `Date.now()`, `new Date()` without an argument |
| `ctx.faker` | The global `faker` export from `@faker-js/faker` |
| `ctx.ids.next(prefix)` | `crypto.randomUUID()`, `createRuntimeId()` |
| Iterate in a stable order (sort ids) | Depend on object key order from external data or on `Set` order of runtime values |
| `rng.fork(label)` for independent streams | Let one optional loop shift every random value after it |

`fork(label)` derives a child stream from the parent's seed and the label, so
adding teammates does not change the deals generated after them.

### Generator versions

Two versions are recorded with every load (`ActiveScenarioInfo`) and shown in
DevTools:

| Version | Where | Bump when |
| --- | --- | --- |
| `generatorVersion` | `GENERATOR_SDK_VERSION` in `@protoyard/scenarios` (currently `1`) | SDK helper output changes (faker upgrade, density mapping) |
| `prototypeGeneratorVersion` | `generatorVersion` in your `definePrototype()` (CRM: `CRM_GENERATOR_VERSION = 2`) | Your generator would produce a different world for the same seed |

Protoyard promises reproducibility for the same versions, not identical output
across generator changes. The version makes the change explicit.

## Integrity rules

Declare referential integrity in `definePrototype({ integrity })`. The runtime
checks it on every scenario load and, by default, refuses to load a broken
world (`WorldIntegrityError`), so a generator bug fails at authoring time.
From `prototypes/crm-demo/src/prototype.ts`:

```ts
integrity: {
  relations: {
    companies: { ownerId: 'py_personas' },
    contacts: { companyId: 'companies', ownerId: 'py_personas' },
    deals: { companyId: 'companies', contactId: 'contacts', ownerId: 'py_personas' },
    activities: { dealId: 'deals', companyId: 'companies', contactId: 'contacts', actorId: 'py_personas' },
  },
  timestamps: {
    companies: ['createdAt'],
    contacts: ['createdAt'],
    deals: ['createdAt'],
    activities: ['at'],
  },
},
```

| Rule | Meaning |
| --- | --- |
| `relations[table][column] = 'otherTable'` | Every non-null value must be an `id` in `otherTable` (array values are checked per item). Reserved tables are allowed. |
| `timestamps[table] = [columns]` | Each value lies between the organization's creation and `referenceTime` |
| Always checked | Unique string ids per table, memberships point to existing personas and organizations, nobody joins before their organization exists, no identity dated after `referenceTime`, every generated table is declared in the schema |

Check every scenario from the terminal (this runs the prototype's code in
Node):

```text
$ pnpm protoyard scenario validate crm-demo -s rep-view
✓ rep-view                 2078 rows · 11 ms
```

The runtime option `validation: 'throw' | 'warn' | 'off'` (default `throw`)
exists for tests and debugging.

## Personas, roles and policy

**This is a simulation of user experience, not security.** Everything runs
in the browser, and anyone with the browser console can change it.

| Concept | Stored in | Notes |
| --- | --- | --- |
| Organization | `py_organizations` | `plan`, `billingStatus`, `featureFlags`, `createdAt` |
| Persona | `py_personas` | A person you can act as: name, title, `joinedAt`, `preferences`, `summary` (shown in the switcher) |
| Membership | `py_memberships` | Persona × organization × `role`, plus optional extra `capabilities` |

A policy maps roles to capability strings. From
`prototypes/crm-demo/src/domain/policy.ts`:

```ts
export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*', `-${CAPABILITIES.billingManage}`],
    rep: PIPELINE,
    viewer: READ,
  },
  rules: {
    // Admins and owners pass through `*`; reps are limited to their own deals.
    [CAPABILITIES.dealsUpdate]: (principal, deal) =>
      principal.role !== 'rep' || ownsDeal(principal.persona.id, deal),
    [CAPABILITIES.dealsDelete]: (principal, deal) =>
      principal.role !== 'rep' || ownsDeal(principal.persona.id, deal),
  },
});
```

| Rule | Effect |
| --- | --- |
| `'*'` | Grants every capability |
| `'-capability'` | A denial. Always wins, even over `*` (`admin` above cannot manage billing). |
| `membership.capabilities` | Added to the role's list for that one membership; `-x` entries deny |
| `rules[capability]` | Runs after the capability check, with the principal and the record you pass |
| Custom roles | Any string (`rep`). `owner`, `admin`, `member`, `viewer` are only a convention. |
| No `policy` | `DEFAULT_POLICY` applies: `owner: ['*']`, `admin: ['*', '-billing:manage']`, `member: ['records:read', 'records:create', 'records:update', 'records:delete:own']`, `viewer: ['records:read']` |

Enforce in two places:

- **Services** call `session.assert(capability, record?)`. It throws
  `PermissionDeniedError` (message ends with "Simulated policy — not real
  security"). See [DATABASE.md](DATABASE.md#services-the-only-way-the-ui-writes).
- **UI** uses `can(capability, record?)` from `@protoyard/renderer-svelte` to
  hide or disable controls. This is a convenience; the service check is what
  makes the rule hold.

### Session switching

| Action | API | Persists | Touches records |
| --- | --- | --- | --- |
| Switch persona | `session.switchActor(personaId)` (DevTools → Personas) | Yes, in the control DB | No |
| Switch organization | `session.switchOrganization(id)` | Yes | No |
| Try another role | `overrides.set({ role })` (DevTools role override) | Yes, as an override | No |
| Load a scenario | `scenarios.load(id)` | Resets actor to the scenario actor and clears overrides | Yes, rebuilds the world |

The capabilities a principal ends up with are visible in DevTools →
Personas.

## Scenarios, overrides and snapshots

Three operations, never mixed up (ADR-007):

| | Operation | API | Effect |
| --- | --- | --- | --- |
| A | Load a scenario | `scenarios.load(id, { seed?, snapshotFirst? })`, `scenarios.reset()` | Destructive, scoped to this prototype. Generate → integrity check → clear and insert in **one** transaction → record scenario, seed and versions → clock to `referenceTime`, overrides cleared, actor = scenario actor. |
| B | Override | `overrides.set()`, `session.switchActor()`, `theme.*`, `environment.set()` | Non-destructive. Stored in the control DB. Domain rows are never written. |
| C | Snapshot | `snapshots.save / restore / exportJson / importJson` | Captures or restores the actual world after edits: records and session together |

`ensureSeeded()` (run on every boot) seeds only when this browser has never
loaded a scenario. Reopening a prototype never resets your edits.

Every effective value reports its source, highest first:

| Source | Set by | Cleared by |
| --- | --- | --- |
| `override` | DevTools toggles, link `theme`/`mode`, `overrides.set()` | DevTools **Reset N**, `overrides.clear()`, a scenario load |
| `preference` | The active persona's saved choice (`theme.setPreference()`), or `persona.preferences` from the generator | Changing it again |
| `scenario` | The loaded scenario's `appearance` / `environment` | Loading another scenario |
| `default` | `protoyard.json` (`defaultTheme`, `defaultMode`, `preview.viewport`) or the platform default | |

Preferences apply to appearance only (theme, mode, reduced motion). The
environment resolves as defaults → scenario → overrides.

## Time

The prototype reads "now" from `runtime.clock`, never from `Date.now()`.

| Instant | Meaning |
| --- | --- |
| Reference | `scenario.referenceTime`: time zero of the seeded world |
| Committed | Reference + every committed advance |
| UI time (`clock.now()`) | Committed + preview offset |

Two different operations:

| | Preview | Advance |
| --- | --- | --- |
| API | `clock.setTime(date)`, `clock.preview({ days: 7 })`, `clock.clearPreview()` | `scenarios.advance({ days: 1 })` |
| DevTools | Time → ±1/7/30 days, or an exact instant | Time → Advance 1 day / 7 days |
| Changes records | Never | Yes, through the prototype's timeline |
| Use it to see | Due dates, "3 days ago" labels, trial countdowns | A world where things kept happening |

### Timeline: idempotent advance

`definePrototype({ timeline, applyEvent })` is optional. Without a timeline,
`advance()` only moves committed time and DevTools says so.

`advance(duration)`:

1. Calls `timeline(ctx)` with the window `(committed, committed + duration]`.
   `ctx` is a fresh `GenerateContext` for the active scenario plus `from`,
   `to` and a read-only `read(table)`.
2. Skips events whose `id` is already in `py_events`.
3. Applies the new ones in time order with `applyEvent(event, { put, get, remove })`,
   inside one transaction, and stores them in `py_events`.
4. Commits the clock and a checkpoint. Returns `{ applied, skipped }`.

The contract: advancing 7 × 1 day must equal 1 × 7 days, and replaying a
window must apply nothing twice. Event ids make the second part work
(`eventId(scenarioId, at, n)` → `evt:<scenario>:<YYYY-MM-DD>:<n>`). The first
part is your job: **the events for a day must not depend on the current
state.**

The CRM demo learned this the hard way. Its first timeline filtered deals by
their *current* stage and decided the target stage when generating the event.
After advancing one day, some deals had moved, so day 2 picked from a
different list: seven single-day advances produced different events than one
seven-day advance. The fix (`prototypes/crm-demo/src/scenarios/generators.ts`):

- Generate from stable inputs only: every deal id, sorted, and an rng forked
  per day (`ctx.rng.fork('crm-day-<n>')`).
- Put the *intent* in the payload (`advance: boolean`, `closeAs`), not the
  result.
- Resolve it against the current record in `applyEvent`, and skip records
  that are gone or closed. Never resurrect data.

```ts
export async function applyCrmEvent(event: DomainEvent, ctx: EventApplyContext): Promise<void> {
  if (event.type !== 'crm.follow-up') return;
  const payload = event.payload as FollowUpPayload;
  const deal = (await ctx.get('deals', payload.dealId)) as unknown as Deal | undefined;
  // Deleted or already closed deals get no follow-ups — never resurrect data.
  if (!deal || !OPEN_STAGES.includes(deal.stage)) return;
  await ctx.put('activities', { id: `activity_${event.id}`, /* … */ });
  if (!payload.advance) return;
  const next = OPEN_STAGES[OPEN_STAGES.indexOf(deal.stage) + 1] ?? payload.closeAs;
  await ctx.put('deals', { ...(deal as unknown as Row), stage: next, /* … */ });
}
```

Other rules:

- `ctx.rng` is recreated from the scenario seed on every `advance()` call.
  Key randomness on the day (`ctx.rng.fork(label)` or `dayRng(ctx, isoDay)`),
  never on how many values were drawn before.
- Derive record ids from the event id (`activity_${event.id}`), so a replay
  writes the same rows.
- `applyEvent` runs inside an IndexedDB transaction: await only `ctx` calls.
- `dailyEvents(ctx, { perDay, make, hours? })` from `@protoyard/scenarios`
  implements the window-independent pattern for you (count, instants and a
  per-slot rng derived from seed + day).

## Environment

`runtime.environment` simulates conditions for service calls. It only
affects work wrapped in `environment.run(name, fn)`. It does **not**
intercept `fetch` or any other browser networking (ADR-011).

| Field | Values | Effect inside `run()` |
| --- | --- | --- |
| `network` | `online`, `slow`, `offline` | `slow` adds 1200 ms; `offline` throws `SimulatedServiceError('offline')` |
| `latencyMs` | 0–30000 | Added to every call |
| `failureMode` | `none`, `timeout`, `server-error`, `permission-denied`, `rate-limited` | Throws `SimulatedServiceError` with that code |
| `failureRate` | 0–1 (default 1) | Share of calls that fail |
| `failureScope` | Operation-name prefixes | Empty = every operation; `['agents.']` = only those |
| `subscription`, `featureFlags` | | Read by your code (`runtime.environmentState()`, `environment.isFeatureEnabled(flag)`) |

Failures are reproducible: whether call *n* of an operation fails is derived
from the operation name and the call count, not from `Math.random()`.

Name operations `<area>.<action>` (`deals.create`, `agents.atlas`) so scopes
can target them. The AI chat demo's partial outage
(`prototypes/ai-chat-demo/src/scenarios/index.ts`) breaks only agent calls
while chat keeps working:

```ts
environment: { failureMode: 'server-error', failureRate: 1, failureScope: ['agents.'] },
```

Scenario `environment`, overrides and snapshots all store a **patch**
(`EnvironmentPatchSchema`), never a full state. `{ latencyMs: 250 }` changes
latency and nothing else. The effective state is defaults → scenario
environment (plus the scenario organization's subscription and flags) →
overrides. DevTools → Env writes overrides, so clearing them restores the
scenario's conditions.

`runService()` in the renderer turns `SimulatedServiceError` into a toast
("You are offline", "Server error"…). Show honest states: a failed save must
not look saved.

## Reproducible links

A link carries scenario coordinates, never data:

```text
http://localhost:5173/?scenario=rep-view&actor=user_0003&seed=42&theme=ocean&mode=dark&devtools=0#/pipeline
```

| Param | Accepted | Behavior |
| --- | --- | --- |
| `scenario` | kebab-case id | First visit in this browser: seeds that scenario (an unknown id falls back to the default scenario). Existing world that differs: **nothing is replaced**; a "Load linked scenario" prompt appears (with "snapshot first" ticked), or explains that the id is unknown. |
| `seed` | 1–10 digits | Used with `scenario` (first seed or the prompt) |
| `actor` | `[A-Za-z0-9_-]{1,64}` | Switches to that persona if it exists; ignored otherwise |
| `theme` | kebab-case id | Applied as a visible, clearable override if the theme exists |
| `mode` | `light`, `dark`, `system` | Applied as an override |
| `devtools` | `0` or `1` | `0` hides the panel (presentation mode). DevTools can only appear if the build includes them. |

Invalid values are ignored, not reported. DevTools → Scenario → **Copy link**
builds a link with `scenario`, plus `actor` and `seed` only when they differ
from the scenario's defaults. Share → presentation link adds `devtools=0`.

Edits are never in a URL. To share a world with edits, share a snapshot.

### Sandboxed worlds

Add `?sandbox=<name>` to any prototype URL to run it in a disposable world
with its own databases (`protoyard.<namespace>~<name>.{data,control}`). The
default world and other sandboxes are never touched. That means two iframes,
for example `?sandbox=a&scenario=new-company` and
`?sandbox=b&scenario=enterprise-scale`, can compare scenarios side by side on
one origin.

A sandbox follows its link's scenario directly, without the "replace your
edits?" prompt, and keeps your edits across plain reloads. Discard it from
DevTools or with `runtime.discardSandbox()`. `listProtoyardDatabases(namespace)`
in `@protoyard/database` lists the sandboxes left over for cleanup. Sandbox
names must match `[a-z0-9][a-z0-9-]{0,23}`; anything else is ignored and the
default world opens.

**Compare scenarios side by side.** Open a prototype in the gallery and choose
**Compare scenarios** (`/p/<slug>/compare/?a=<id>&b=<id>`). Each frame loads
the same build with `?sandbox=compare-<a|b|c>`, so it gets its own database
pair (`protoyard.<namespace>~<sandbox>.*`). Edits never reach other frames or
the prototype's normal data. **Reset sandboxes** re-seeds every frame from its
scenario by moving to fresh names (`compare-a-1`, `compare-a-2`, …).

Limits: the old sandbox databases stay in the browser until you clear them
(DevTools → Data → *Clear other sandboxes*, or `listProtoyardDatabases`). In
the local dev gallery, frames point at a running dev server (start it from
the page or with `pnpm protoyard dev <slug>`). A static gallery without
embedded builds only shows the commands.

## Snapshots

A snapshot is the actual current world: every domain and reserved table,
plus the scenario, seed, actor, organization, clock, overrides, effective
environment and appearance. It reproduces edits no generator could.

| Action | DevTools → Snaps | API |
| --- | --- | --- |
| Save (name + notes) | Save | `snapshots.save({ name, notes })` |
| Restore | Restore | `snapshots.restore(id)` |
| Download | Download / Export current world | `snapshots.exportJson(id?)` |
| Import | Choose file → preview → Import or Import & restore | `previewImport(text)`, `importJson(text, { restore })` |

Restoring writes all records in **one** transaction (a failure leaves the
current data untouched), then restores the scenario, actor, organization,
clock and overrides. A running clock resumes from the current time.

### File format

`<slug>-<name>-<YYYY-MM-DD>.protoyard.json`, for example
`crm-demo-before-demo-2026-10-17.protoyard.json`:

```json
{
  "format": "protoyard.snapshot",
  "formatVersion": 1,
  "id": "snap_u…",
  "name": "Before demo",
  "notes": "",
  "prototypeId": "example.crm",
  "prototypeVersion": "0.1.0",
  "schemaVersion": 2,
  "scenarioId": "growing-team", "scenarioVersion": 1, "seed": 4218,
  "referenceTime": "2026-10-16T10:00:00-05:00",
  "createdAt": "…",
  "actorId": "user_0001", "organizationId": "org_0001",
  "clock": { "referenceTime": "…", "committedOffsetMs": 0, "previewOffsetMs": 0, "running": false },
  "environment": { "network": "online", "…": "…" },
  "overrides": {},
  "appearance": { "themeId": "violet", "mode": "system" },
  "tables": [{ "name": "deals", "rows": [] }],
  "stats": { "deals": 0 }
}
```

### Import validation

Snapshot files are data: they are validated with `SnapshotSchema` and never
executed.

| Case | Result |
| --- | --- |
| Larger than 25 MB | Rejected |
| Not JSON, or not the schema | Rejected with the first problem (`path — message`) |
| Different `prototypeId` | Rejected: "This snapshot belongs to "x", not "y". Nothing was changed." |
| `schemaVersion` newer than the prototype | Rejected: update the prototype first |
| `schemaVersion` older | Accepted with a warning. Rows are restored as they are; no migration runs on them, so make sure old rows still read correctly. |
| Unknown tables | Skipped, with a warning |
| Scenario no longer exists | Records restored without an active scenario, with a note |

Importing the same file twice creates two stored snapshots (each import gets a
fresh id).

### Sharing snapshots

- Files work across origins: export from `localhost`, import into a
  published build of the same prototype. Only the `prototypeId` (the
  manifest `id`) and schema version must fit.
- Commit shared snapshots as
  `prototypes/<slug>/snapshots/<name>.protoyard.json`.
  `pnpm protoyard snapshot list <slug>` validates them.
- Snapshots saved in DevTools live in that browser's control database and
  count against its storage quota.

## Write your own scenario

A walkthrough on a prototype created from the blank template
(`pnpm protoyard new my-idea --template blank`). Goal: the "active" world on a
slow network.

**1. Add the scenario** to `src/scenarios/index.ts`. `extends: 'active'`
reuses the organization, actor, density and data knobs of the existing
scenario. The `ScenarioInput` type still requires `seed` and `referenceTime`
on every entry, so repeat them; the same seed gives the same world:

```ts
{
  id: 'busy-week',
  extends: 'active',
  name: 'Active owner on a slow network',
  description: 'The "active" world, but every save takes ~1.5 s.',
  group: 'Conditions',
  seed: 202,
  referenceTime,
  environment: { network: 'slow', latencyMs: 300 },
  tags: ['conditions'],
},
```

**2. List the id** in `protoyard.json`:

```json
"scenarios": ["empty", "active", "viewer", "busy-week"]
```

`definePrototype()` throws at startup if a scenario is missing from this
list.

**3. Teach the generator any new knob** (optional). This scenario needs
none. If you add `generators: { notes: 30 }`, read it in
`generators.ts` with a fallback (`ctx.scenario.generators.notes ?? ctx.scale(12)`).

**4. Validate:**

```bash
pnpm protoyard validate my-idea                # ids match, schema version, types
pnpm protoyard scenario validate my-idea -s busy-week
```

**5. Load it:** DevTools → Scenario → *Active owner on a slow network* →
load, or open `?scenario=busy-week` in a fresh browser profile. Create a note
and watch the 1.5 s save (300 ms + 1200 ms for `slow`).

**6. Test it.** Generators should be deterministic and integrity-clean for
every scenario. The template's test (`tests/blank.test.ts`) loops over
`definition.scenarios` with `parseScenario(input)`, which does **not** resolve
`extends`: with `busy-week` added it fails on the missing `seed`. Resolve the
list the way the runtime does instead:

```ts
import { createGenerateContext, PRESETS, resolveScenarios, validateWorld } from '@protoyard/scenarios';

for (const s of resolveScenarios(definition.scenarios, PRESETS)) {
  const a = generateBlankWorld(createGenerateContext(s));
  const b = generateBlankWorld(createGenerateContext(s));
  expect(a).toEqual(b);
  expect(validateWorld(a, { ...definition.integrity, referenceTime: s.referenceTime })).toEqual([]);
}
```

Run `pnpm vitest run prototypes/my-idea`.

A checklist for a good scenario:

- [ ] The id says the situation (`trial-expired`, not `scenario-4`).
- [ ] The description says what to look at ("new records are paywalled").
- [ ] The actor persona exists in the generated world.
- [ ] It changes one or two axes from a sibling, so differences are easy to
      read.
- [ ] Empty, loading and error states are reachable through some scenario.
