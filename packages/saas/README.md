# @protoyard/saas

The engine of Protoyard's simulated SaaS kits (ADR-018 in
[docs/DECISIONS.md](../../docs/DECISIONS.md)). This package is
framework-agnostic: it has no Svelte, and its only dependencies are
`@protoyard/core` and zod. Screens live in `@protoyard/saas-ui`.

> **Simulation, not security.** Accounts, "passwords", tokens and MFA seeds
> are plain values in the browser's IndexedDB, and any script on the same
> origin can read or change them. Nothing here authenticates anyone,
> contacts an OAuth provider or charges a card. Use fictional data only
> (`@example.com`).

## What ships today

The table layout, row schemas and integrity rules, plus:

- **Inbox** — `createInbox(runtime)`
- **Onboarding** — `createOnboarding(runtime, { steps })`
- **Workspaces** — `createWorkspaces(runtime)`

Sign-in, OAuth, magic links, MFA, invitations and billing services come in
later PLAN_002 tasks.

### Inbox (`createInbox`)

```ts
import { createInbox } from '@protoyard/saas';

const inbox = createInbox(runtime);
await inbox.deliver({
  recipient: 'ada@example.com',
  kind: 'magic-link',
  subject: 'Sign in to Acme',
  body: 'Use the button below (simulated).',
  action: { label: 'Sign in', href: '#/auth/magic?token=…' }, // hash routes only
});
const messages = await inbox.list({ recipient: 'ada@example.com', unreadOnly: true });
await inbox.markRead(messages[0]!.id);
```

- **Kinds:** `verify-email`, `magic-link`, `password-reset`, `invite`, `receipt`, `trial`, `notification`.
- **Body** is plain text (never `{@html}`). **Action** links must match `#/…`.
- **`deliver`** goes through `environment.run('inbox.deliver')` so offline writes nothing.
- **`write`** is the same validation + insert for use **inside** an outer Dexie transaction (auth flows that commit a token and a message together).
- **`list` / `get` / `markRead` / `archive`** are liveQuery-friendly async reads/writes (newest first).

### Workspaces (`createWorkspaces`)

```ts
import { createWorkspaces, WORKSPACE_CAPABILITIES } from '@protoyard/saas';

// Policy roles should grant workspaces:create / rename / leave (or `*`).
const workspaces = createWorkspaces(runtime);
const { organization } = await workspaces.create({ name: 'Acme Labs' });
await workspaces.switchTo(organization.id); // also happens automatically after create
await workspaces.rename(organization.id, { name: 'Acme Cloud' });
// Last owner cannot leave — transfer first via workspaces.transferOwnership(memberId)
await workspaces.leave(organization.id);
```

- Creates the organization + owner membership in **one** `runtime.identity.write` transaction, then `session.switchOrganization`.
- **`switchTo`** only allows organizations the persona already belongs to (control-state only, works offline).
- **`leave`** refuses when the actor is the last `owner`; after a successful leave, switches to another membership when the active org was left.
- **`transferOwnership`** delegates to `runtime.members.transferOwnership`.

| Table | Holds | Indexes |
| --- | --- | --- |
| `saas_accounts` | One sign-in account per persona: email, verified flag, simulated password, linked providers (`google`, `github`, `microsoft`, `apple`, `slack`), status, failed attempts | `id, &email, personaId` |
| `saas_sessions_log` | Sign-in, sign-up and sign-out attempts with method, provider, outcome and reason | `id, accountId, personaId, at` |
| `saas_tokens` | Single-use tokens: `verify-email`, `magic-link`, `password-reset`, `invite`, `oauth-state`, with expiry and consumption | `id, kind, email, accountId, expiresAt` |
| `saas_mfa` | Simulated authenticator enrollment (`totp-sim` seed, status, recovery codes) | `id, &accountId` |
| `saas_invitations` | Workspace invitations: email, role, inviter, status, expiry, who accepted | `id, organizationId, email, status, tokenId` |
| `saas_inbox` | The simulated mailbox: plain-text messages with an optional in-app action (`#/…` links only) | `id, recipient, personaId, kind, at` |
| `saas_subscriptions` | Plan, status, seats, per-seat price in integer cents, trial end, current period | `id, organizationId, status` |
| `saas_invoices` | Invoices with lines in integer cents (negative lines for credits) | `id, organizationId, subscriptionId, issuedAt` |
| `saas_onboarding` | One wizard row per persona: current step, completed and skipped steps, answers | `id, personaId, organizationId` |

Every table has a zod row schema (`SaasAccountSchema` and so on, also as
`SAAS_ROW_SCHEMAS[table]`) with defaults, so generators only write the
fields that matter. Money must be an integer, and inbox action links must be
in-app hash routes, so a snapshot can't inject an off-origin link.

## Opt a prototype in

```ts
// src/database/schema.ts: add the kit tables in a NEW version
export const versions = [
  { version: 1, stores: { projects: 'id, organizationId' } },
  { version: 2, stores: saasStores() },
];

// src/prototype.ts
import { mergeIntegrity, saasIntegrity, saasStores, saasTables } from '@protoyard/saas';

definePrototype({
  // …manifest (storage.schemaVersion: 2), scenarios, policy
  database: { versions },
  integrity: mergeIntegrity(myIntegrity, saasIntegrity()),
  generate(ctx) {
    const team = generateTeam(ctx);
    return {
      organizations: team.organizations,
      personas: team.personas,
      memberships: team.memberships,
      tables: { projects, ...saasTables({ saas_accounts: accounts }) },
    };
  },
});
```

- `saasStores(version = SAAS_SCHEMA_VERSION, { tables? })` returns the Dexie
  store strings. Pass `tables` to take only part of the kit (for example
  accounts and the inbox, without billing).
- `saasTables(rows, { tables? })` returns every selected table, filled with
  empty arrays and overlaid with your rows. Return it from `generate()`:
  integrity relations need their target tables in the seed even when a
  scenario has no rows for them.
- `saasIntegrity({ tables? })` returns foreign keys (to `py_personas`,
  `py_organizations` and other kit tables) and past-only timestamps. Relations
  to kit tables you didn't select are dropped. Future dates (`expiresAt`,
  `trialEndsAt`, `currentPeriodEnd`) are never checked as past timestamps.
- `mergeIntegrity(...rules)` combines your rules with the kit's.

Generators build these rows with `ctx.ids`, `ctx.rng`, `ctx.faker` and
`ctx.time` only, like every other generator. Bump your `generatorVersion`
when the output changes.

## Onboarding wizard engine

`createOnboarding(runtime, { steps, capability?, area?, tables? })` is the
persisted wizard from `templates/onboarding`, made generic. You declare the
answer steps, and the engine appends a final `done` step.

```ts
const onboarding = createOnboarding(runtime, {
  steps: [
    { id: 'profile', label: 'Profile', schema: ProfileSchema },
    { id: 'workspace', label: 'Workspace', schema: WorkspaceSchema,
      capability: 'workspace:update', effect: (answer, { at }) => db.workspaces.put(…) },
    { id: 'invite', label: 'Invite teammates', optional: true, schema: InvitesSchema },
  ],
  tables: ['workspaces'], // tables your step effects write
});
await onboarding.submit('profile', input); // validate → save answer + position → next step
await onboarding.skip('invite');           // optional steps only
await onboarding.goTo('profile');          // back / jump to a reached step
await onboarding.complete();               // needs every required step
await onboarding.restart();                // back to step 1, answers kept as defaults
```

- Each action calls `session.assert(capability)` (default
  `onboarding:progress`, plus the step's own `capability`), validates with the
  step's zod schema (`ValidationError.issues` per field, the shape
  `runService` shows inline), runs through `environment.run('<area>.<step>')`
  and writes the answer and the new position in **one transaction**. A reload
  resumes exactly where the person left off, and an offline failure writes
  nothing.
- `complete()` also sets the persona's `onboardingComplete` in the same
  transaction, then refreshes the session. `restart()` clears it again.
  Step effects are not undone.
- Rows live in `saas_onboarding`, one per persona, so add that table with
  `saasStores(1, { tables: ['saas_onboarding', …] })`.
- `createOnboardingFlow(steps)` is the pure logic (`next`, `canVisit`,
  `missingRequired`, `progressOf`, `stepsForProgress`, `freshState`). Use it in
  generators to place a scenario's actor from `actor.onboardingProgress`.

## Size

The schema module is about 2.2 KB gzip and `createOnboarding` with its
dependencies about 1.8 KB, minified with esbuild, with zod and
`@protoyard/core` external because every prototype already ships them. It
is tree-shakable (`sideEffects: false`).

## Checks

```bash
pnpm vitest run packages/saas
pnpm --filter @protoyard/saas typecheck
pnpm exec biome check packages/saas
```
