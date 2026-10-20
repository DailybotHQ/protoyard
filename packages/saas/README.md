# @protoyard/saas

The engine of Protoyard's simulated SaaS kits (ADR-018 in
[docs/DECISIONS.md](../../docs/DECISIONS.md)). This package is
framework-agnostic: it has no Svelte, and its only dependencies are
`@protoyard/core` and zod. Screens live in `@protoyard/saas-ui`.
See the [SaaS kits guide](../../docs/SAAS_KITS.md) for prototype integration,
scenario composition and honest behavior boundaries.

> **Simulation, not security.** Accounts, "passwords", tokens and MFA seeds
> are plain values in the browser's IndexedDB, and any script on the same
> origin can read or change them. Nothing here authenticates anyone,
> contacts an OAuth provider or charges a card. Use fictional data only
> (`@example.com`).

## What ships today

The table layout, row schemas and integrity rules, plus:

- **Inbox** — `createInbox(runtime)`
- **Email/password auth** — `createAuthServices(runtime, options)`
- **OAuth** — `createOAuthSimulator(runtime, providers)`
- **Onboarding** — `createOnboarding(runtime, { steps })`
- **Workspaces** — `createWorkspaces(runtime)`
- **Magic link** — `createMagicLinkServices(runtime)`
- **MFA (simulated TOTP + recovery)** — `createMfaServices(runtime)`
- **Password reset** — `createPasswordResetServices(runtime)`
- **Workspace invitations** — `createInvitationServices(runtime)`
- **Billing (plans, trial, checkout, invoices)** — `createBilling(runtime, plans)` + `billingTimeline`
- **Scenario fragments + world generator** — `saasFragments`, `generateSaasWorld(ctx, { team })`

### Magic link (`createMagicLinkServices`)

```ts
import { createMagicLinkServices, createMfaServices } from '@protoyard/saas';

const magic = createMagicLinkServices(runtime, { ttlMinutes: 15, productName: 'Acme' });
const { token, message } = await magic.issue({ email: 'ada@example.com' });
// message.action.href → #/auth/magic?token=…
const result = await magic.consume(token!.id);
if (result.status === 'mfa-required') {
  const mfa = createMfaServices(runtime);
  const row = await mfa.get(result.account.id);
  // result.challenge: a single-use challenge token minted with the first factor
  await mfa.completeChallenge(result.challenge.id, {
    code: mfa.authenticatorPanel(row!.seed).code, // simulated panel only
  });
}
```

- Single-use tokens; expiry follows the **simulated clock** (`commitAdvance` in tests).
- Delivers a plain-text inbox message with a hash-route action.
- Unknown emails return `{ delivered: false }` (no account oracle).

### MFA (`createMfaServices`)

```ts
const mfa = createMfaServices(runtime);
const { currentCode, recoveryCodes, mfa: row } = await mfa.enroll();
await mfa.confirmEnroll(currentCode);
// Panel: mfa.authenticatorPanel(row.seed) → { code, secondsRemaining, simulated: true }

const step = await mfa.signInWithPassword({ email, password });
if (step.status === 'mfa-required') {
  await mfa.completeChallenge(step.challenge.id, { code: mfa.authenticatorPanel(row.seed).code });
  // or { recoveryCode: recoveryCodes[0] }
}
```

- Codes are **deterministic** from the stored seed and a 30s window of `clock.now()` — not real TOTP.
- Active MFA blocks password, magic-link and OAuth sign-in until `completeChallenge`. A
  successful first factor mints a single-use `mfa-challenge` token (10 minutes on the
  simulated clock; `challengeTtlMinutes`); `completeChallenge(challengeId, proof)` derives
  the account from that token, so a bare account id, a used or an expired challenge is
  refused. The MFA screen takes `#/auth/mfa?challenge=…` and shows the simulated code only
  for that challenge's account (`describeChallenge`).
- `signInWithPassword` (what the kit's Sign in screen calls) counts failed attempts and
  locks at `lockoutThreshold`, and honors `requireVerifiedEmail`, exactly like `auth.signIn`.
- Wrong codes and bad recovery codes are logged (`wrong-code`, `bad-recovery`) even though
  the call fails.
- Recovery codes are single-use; `disable` requires a valid code or recovery code.

### Password reset (`createPasswordResetServices`)

```ts
const reset = createPasswordResetServices(runtime, { productName: 'Acme' });
const { token } = await reset.request({ email: 'ada@example.com' });
await reset.consume({ tokenId: token!.id, password: 'new simulated password' });
```

- Reset links are single-use and expire on the simulated clock (30 minutes by default).
- Unknown and disabled accounts return `{ delivered: false }` without writing a token or message.
- The new password is stored as a simulated value; this does not send email or provide security.

### Workspace invitations (`createInvitationServices`)

```ts
const invites = createInvitationServices(runtime, { productName: 'Acme' });
const { invitation, token } = await invites.create({ email: 'grace@example.com', role: 'member' });
await invites.resend(invitation.id); // invalidates the previous link
const accepted = await invites.accept({ tokenId: token.id });
// await invites.revoke(invitation.id) while it is pending
```

- Create, resend and revoke require `members:invite` under the actor's role **in the
  invitation's workspace** (`assertInOrg`), not in whichever workspace is active.
- Accepting refuses an existing account that is `disabled` or `locked` ("This account is not
  available.") and writes nothing.
- Accepting an unexpired link consumes it and creates one membership. Existing accounts are
  matched by email; a new invitee gets a persona and simulated account. Optional `name` and
  `password` fields supply the new account details.
- Accepting signs the invitee in and switches to the workspace, standing in
  for owning the mailbox (the result has `signedIn`). An account with an active
  simulated authenticator is not signed in: `requiresMfa` is true and it should
  go through sign-in. Pass `accept(input, { signIn: false })` to only join.
- `preview(tokenId)` returns `{ status: 'valid' | 'expired' | 'used' | 'revoked' | 'unknown', email,
  role, organizationName, inviterName, hasAccount }` without side effects, for the accept screen.
- Links use `#/invites/accept?token=…` (the `pendingInvite` scenario fragment too). `@protoyard/saas-ui`
  registers that route (and the `#/invite` alias) with a working accept screen.
- The inbox is local to the prototype. No email is sent.

### OAuth (`createOAuthSimulator`)

```ts
import { createOAuthSimulator } from '@protoyard/saas';

const oauth = createOAuthSimulator(runtime, {
  google: {
    identity: {
      subject: 'google_ada_001',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      emailShared: true,
    },
    outcome: 'success', // success, consent-denied, email-not-shared, provider-error
  },
});

const consent = await oauth.start('google', 'sign-in');
router.navigate(consent.route); // #/oauth/google/consent?state=… — stays in this app
const result = await oauth.approve(consent.state);
```

The simulator supports Google, GitHub, Microsoft, Apple and Slack. Supply
scenario-specific fictional identities (normally generated from `ctx.faker`)
through `providers`; default profiles also use `@example.com`. A matching
email without a matching provider returns an account-link prompt. After the
person signs in, start again with intent `link` to confirm linking. Consent
states are deterministic, expire after ten simulated minutes and are
single-use. No provider SDK, redirect or network request is used.

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
// rename and leave check the actor's role in the TARGET workspace, not the active one.
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

### Email/password auth (`createAuthServices`)

```ts
import { createAuthServices } from '@protoyard/saas';

const auth = createAuthServices(runtime, { productName: 'Acme', lockoutThreshold: 5 });
const { account, needsVerification } = await auth.signUp({
  name: 'Olivia Hart', email: 'olivia@example.com', password: 'sup3r-simulated',
  organizationName: 'Hart Studio',          // optional; default "<name>'s workspace"
});
await auth.verifyEmail(tokenId);              // from the verify-email message's action link
await auth.signIn({ email: 'olivia@example.com', password: 'sup3r-simulated' });
await auth.signOut();
```

- `signUp` creates the persona, the account, a workspace with the person as
  `owner` (`createOrganization: false` skips it), a `verify-email` token and
  its inbox message in **one** `runtime.identity.write` transaction. It signs
  in right away only with `requireVerifiedEmail: false`.
- `signIn` checks the stored simulated password. Unknown email, wrong
  password (with "N attempts left"), unverified email, and locked or disabled
  accounts come back as `ValidationError` issues for the form. The attempt is
  recorded first: failed-attempt counter, lockout at `lockoutThreshold`, and a
  `saas_sessions_log` row. A success resets the counter and calls
  `session.signIn`.
- Every action runs through `environment.run('auth.<action>')`, so DevTools
  latency, offline and failure toggles apply, and an offline attempt writes
  nothing.
- Emails must use example domains (`example.com`, `*.example`), and are
  lowercased.
- **The password is stored as typed.** That is deliberate: this is UX
  simulation, not security, and nothing here protects or transmits a real
  credential.
- Password reset clears failed attempts and unlocks a locked account. Disabled
  accounts remain unavailable.

### Billing (`createBilling`)

`createBilling(runtime, plans)` simulates plans, trials, checkout (`success`,
`declined`, `requires-action`), upgrade or downgrade with prorations in integer
cents, cancel and resume, and invoices. Add `billingTimeline(ctx)` to your
prototype's `timeline` so trials expire on `scenarios.advance()`. A declined
or unconfirmed **first** checkout (no subscription yet) records the attempt as
a `failed` or `open` invoice with `subscriptionId: null`. No subscription is
created and the organization is unchanged. No card data exists anywhere.

### Scenario fragments (`saasFragments`, `generateSaasWorld`)

Jump straight to any auth or billing state. Fragments only set knobs under
`scenario.generators.saas`, and they compose like any other fragment:

```ts
import { composeScenario, generateTeam, PRESETS } from '@protoyard/scenarios';
import { generateSaasWorld, saasFragments, saasScenarioIntegrity } from '@protoyard/saas';

const scenarios = [
  composeScenario(PRESETS['first-week'], { id: 'trial-ending', name: 'Trial ends soon' }, saasFragments.trialEnding(2)),
  composeScenario(PRESETS['active-month'], { id: 'past-due', name: 'Payment failed' }, saasFragments.pastDue()),
];

definePrototype({
  // …
  integrity: mergeIntegrity(myIntegrity, saasScenarioIntegrity()),
  generate(ctx) {
    const saas = generateSaasWorld(ctx, { team: generateTeam(ctx) });
    return { ...saas, tables: { ...myTables, ...saas.tables } };
  },
});
```

| Fragment | What the world contains |
| --- | --- |
| `signedOut()` | Knob only. Call `applySaasScenarioSession(runtime)` after boot and on scenario changes. It signs out once per load, and someone who signs in afterwards stays signed in. |
| `unverifiedEmail()` | The actor's email is unconfirmed, with a live verify-email token and its inbox message |
| `mfaEnrolled()` | An active simulated authenticator for the actor, with 8 recovery codes |
| `pendingInvite(n)` | `n` pending invitations to fictional people, each with a token and an invite message |
| `trialEnding(days)` | A trialing subscription ending `days` after the reference time, the org `trialing`, and a reminder when 3 days or fewer remain |
| `pastDue()` | Paid history whose last invoice failed, the subscription and org `past_due`, and a payment-failed message |
| `multiWorkspace(n)` | The actor belongs to `n` organizations (owner of the first extra, admin of the rest) |
| `oauthLinked(...providers)` | Those providers linked to the actor's account |

Every persona gets a verified account with the password `SAAS_DEMO_PASSWORD`
(`demo-password`, simulated). Subscriptions follow
`organization.subscription` (`free` has none, `pro`/`enterprise` get up to
three paid invoices, `expired` lapses). Rows come from `ctx.ids`, `ctx.rng`,
`ctx.faker` and `ctx.time` only, so the same seed rebuilds the same world.
Each pending invitation carries a seeded library `avatar` (`av-NNN`) that
skips the team's faces, and the persona created on acceptance keeps it; team
members without an avatar get one from the same pool (generator version 2).
Bump `SAAS_GENERATOR_VERSION` (and your `generatorVersion`) when the output
changes. Pass `tables` to generate only the kit tables you opted into.

| Table | Holds | Indexes |
| --- | --- | --- |
| `saas_accounts` | One sign-in account per persona: email, verified flag, simulated password, linked providers (`google`, `github`, `microsoft`, `apple`, `slack`), status, failed attempts | `id, &email, personaId` |
| `saas_sessions_log` | Sign-in, sign-up and sign-out attempts with method, provider, outcome and reason | `id, accountId, personaId, at` |
| `saas_tokens` | Single-use tokens: `verify-email`, `magic-link`, `password-reset`, `invite`, `oauth-state`, with expiry and consumption | `id, kind, email, accountId, expiresAt` |
| `saas_mfa` | Simulated authenticator enrollment (`totp-sim` seed, status, recovery codes) | `id, &accountId` |
| `saas_invitations` | Workspace invitations: email, role, inviter, status, expiry, who accepted, optional invitee `avatar` | `id, organizationId, email, status, tokenId` |
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
- A step with an `effect` runs it inside that same transaction, opened with
  `runtime.identity.write` over the identity tables plus `tables`. The effect
  receives `{ at, personaId, organizationId, identity }`; write personas,
  organizations or memberships through `identity` (the `IdentityOps` of
  `runtime.identity.write`). The effect's writes, the answer and the position
  commit together or not at all: if the effect throws (validation, a
  `session.assert`) or the environment fails, nothing is written. The session
  refreshes after the commit.
- `complete()` also sets the persona's `onboardingComplete` through
  `runtime.identity.write`, in the same transaction as the wizard row, and
  the session refreshes after the commit. `restart()` clears it again.
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

## Package output

The manifest keeps TypeScript source exports for workspace development. `pnpm build:packages --filter engine` creates the ESM and declaration files under `dist/` that the packed manifest exposes.
