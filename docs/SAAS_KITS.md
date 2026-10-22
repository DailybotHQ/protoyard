# SaaS kits

Protoyard's SaaS kits add realistic, browser-local product flows to a prototype:
accounts, sign-in, onboarding, workspaces, invitations, an inbox, billing and
their scenario data. They are simulation code for demos and UX exploration.
They do not provide backend services or security.

## Packages

| Package | Role |
| --- | --- |
| [`@protoyard/saas`](../packages/saas/README.md) | Framework-agnostic schemas, services, deterministic scenario fragments and generated SaaS rows. |
| [`@protoyard/saas-ui`](../packages/saas-ui/README.md) | Lazy Svelte screens, route definitions, guards and reusable SaaS UI components. |

An optional blueprint `archetype` block can declare `saas-onboarding`, its
workspace and member entity slots, onboarding screen route, scenario defaults,
and the `@protoyard/saas` / `@protoyard/saas-ui` entry points. This is
validated runtime metadata. Authentication, inbox and billing remain simulated
UX, never security or real provider behavior. See the
[`@protoyard/blueprint` archetype contract](../packages/blueprint/README.md#the-schema).
The blueprint integration test checks the public `saasRoutes` entry and verifies its
onboarding loader is dynamic and does not set an eager route component.

A quick starter, [`blueprints/quick/saas-onboarding.json`](../blueprints/quick/saas-onboarding.json),
declares that archetype for a fictional workspace signup: workspaces and teammates, a
create-workspace form and a team list, plus two validation tasks (create a workspace,
invite a teammate). Generated with the default seed it has 3 workspaces and 8 teammates
(a 5.5 KB world, 1.5 KB gzip). Its description states that sign-in, invitations and
plans are simulated, and the test refuses credential or provider fields.

The engine owns data and behavior; the UI package composes those services into
screens. A prototype can use the engine alone, the UI alone with compatible
services, or both. Keep domain changes in services instead of writing database
tables from components.

## Add the kits to a prototype

### 1. Add the SaaS stores and integrity rules

Add the stores in a new database schema version; do not replace a prototype's
existing stores or edit already shipped migrations. `saasStores` accepts a
table selection when a prototype only needs part of the kit. Include the
matching kit tables in generated worlds and merge `saasIntegrity` with the
prototype's rules.

```ts
import { mergeIntegrity, saasIntegrity, saasScenarioIntegrity, saasStores } from '@protoyard/saas';

const versions = [
  { version: 1, stores: { projects: 'id, organizationId' } },
  { version: 2, stores: { projects: 'id, organizationId', ...saasStores() } },
];

const integrity = mergeIntegrity(projectIntegrity, saasIntegrity(), saasScenarioIntegrity());
```

Set the manifest's `storage.schemaVersion` to the latest version. See
[`DATABASE.md`](DATABASE.md) for schema migrations, stores and integrity rules.

### 2. Generate a deterministic SaaS world and compose scenario fragments

`generateSaasWorld` builds accounts, tokens, memberships, invitations, inbox
messages and billing rows from the supplied team. Compose fragments with a
base scenario to select states such as signed out, MFA enrolled, pending
invitations, trial ending soon or past due.

```ts
import { saasFragments, generateSaasWorld } from '@protoyard/saas';
import type { GenerateContext } from '@protoyard/core';
import { composeScenario, generateTeam, PRESETS } from '@protoyard/scenarios';

const trialEnding = composeScenario(
  PRESETS['first-week'],
  { id: 'trial-ending', name: 'Trial ends soon' },
  saasFragments.trialEnding(2)
);

function generate(ctx: GenerateContext) {
  const world = generateSaasWorld(ctx, { team: generateTeam(ctx) });
  return { ...world, tables: { ...projectTables, ...world.tables } };
}
```

The full fragment list and composition details are in the
[`@protoyard/saas` scenario guide](../packages/saas/README.md#scenario-fragments-saasfragments-generatesaasworld).
Generation uses the scenario context's ids, random generator, faker and clock.
If generated output changes, bump the kit generator version and the prototype's
`generatorVersion`.

### 3. Mount the lazy screens and guard the app

In the root component's instance script, provide the runtime and optional
billing catalog, include the kit routes, then guard the prototype's application
route. The router should revalidate when the session changes.

```ts
import { createRouter } from '@protoyard/renderer-svelte';
import { requireSaasApp, saasRoutes, provideSaas } from '@protoyard/saas-ui';
import { createBilling } from '@protoyard/saas';

provideSaas(runtime, { billing: createBilling(runtime, plans) });

const routes = [
  ...saasRoutes({ session: runtime.session, lazy: true }),
  { path: '/app', component: Dashboard, guard: requireSaasApp(runtime.session) },
];

createRouter(routes, {
  revalidateOn: (refresh) => runtime.session.subscribe(refresh),
});
```

Kit screens load as separate chunks. Grant the capabilities used by the
prototype's services in its simulated policy, and use fictional `example.com`
addresses. The kit README documents routes, guards, screen configuration and
component APIs.

### Gate an action on an account

Mount the account-gate host once in the app shell, alongside the router and
inside the `provideSaas` context. It uses the adaptive overlay: a sheet in a
narrow host and a dialog in a wide host.

```svelte
<script lang="ts">
  import { AccountGate, getSaas } from '@protoyard/saas-ui';

  const { requireAccount } = getSaas();

  function saveDraft() {
    if (!requireAccount({ reason: 'Save this draft to your account.', next: '/drafts/new' })) {
      return;
    }
    // Continue through the prototype's service.
  }
</script>

<Router {router} />
<AccountGate />
```

`requireAccount` returns `true` for a signed-in visitor. For a guest it
opens the prompt and returns `false`, so the caller should stop that action.
The reason is shown in the prompt, and `next` must be an in-app route beginning
with one slash. Choosing **Create account** opens the configured sign-up path
with that destination attached. The gate resumes it when the simulated session
becomes signed in, including after the verification and sign-in steps. Choosing
**Keep browsing** clears the pending destination; navigating to another screen
closes the prompt.

The gate is only presentation behavior. It does not make an action secure:
services still check capabilities and validate every mutation, and this
simulation does not protect data from the browser user or same-origin scripts.

## What each kit provides

| Kit | What it does |
| --- | --- |
| Email and password | Simulated account creation, email verification, sign-in, sign-out, lockout and reset flows. |
| OAuth | In-app provider consent and account linking with fictional identities; no provider SDK or redirect. |
| Magic links and inbox | Single-use simulated tokens and local plain-text messages with in-app hash links. |
| MFA | A deterministic simulated authenticator code and recovery codes; no real TOTP device. |
| Onboarding | A persisted, resumable wizard whose default steps can update a profile, workspace, invitations and preferences. |
| Workspaces and members | Workspace creation and switching, member roles, invitation management and settings UI. |
| Billing | Plans, trials, simulated checkout outcomes, subscriptions and integer-cent invoices. No card fields or charge. |
| Scenario fragments | Reproducible states for signed-out, unverified, MFA, invitations, trial, past-due, multiple workspaces and linked providers. |

### Invitation acceptance

`createInvitationServices` creates, resends, revokes and accepts invitation
tokens, and `preview(tokenId)` reports a link's state (`valid`, `expired`,
`used`, `revoked` or `unknown`) without changing anything. Accepting matches
an existing account by email, or creates a persona and simulated account. It
then adds the membership with the invited role, signs the invitee in and
switches to that workspace. Opening the link stands in for owning the
mailbox. An account with an active simulated authenticator is never signed in
this way: it joins the workspace and is sent to sign in with its code. Pass
`{ signIn: false }` to only join.

### Invitation side effects

`create(input, sideEffect)` can also make domain writes as part of the
invitation, for example a seat reservation or an onboarding note. The side
effect runs after the invitation, its token and its inbox message exist, in
the same transaction. If it throws or rejects, all of it rolls back, and the
error reaches the caller:

```ts
const invites = createInvitationServices(runtime, { tables: ['seat_reservations'] });
const { invitation, effect } = await invites.create(
  { email: 'grace@example.com', role: 'member' },
  async (invitation, { table }) => {
    const seats = table<SeatReservation>('seat_reservations');
    if ((await seats.where('organizationId').equals(invitation.organizationId).count()) >= 5) {
      throw new ValidationError({ form: 'All seats are taken.' });
    }
    await seats.add({ id: `seat_${invitation.id}`, organizationId: invitation.organizationId });
    return 'reserved';
  }
);
```

- Declare the tables the side effect writes in `InvitationOptions.tables` for
  every call, or per call with `create(input, { sideEffect, tables })`.
  `context.table<T>(name)` returns typed access to a declared table only.
  Unknown names, the invitation's own `saas_*` tables and the identity `py_*`
  tables are refused before anything is written.
- The side effect receives the invitation plus `{ invitation, token, message, table }`.
  Whatever it returns comes back as `effect`.
- It runs only after the capability, input and membership checks pass. Inside
  it, await only table operations: a timer or a fetch would end the
  transaction early. Call it from a service, never from a component.

`saasRoutes` registers the accept screen at `#/invites/accept?token=…`, the
canonical form that service and scenario-fragment links use, and at the alias
`#/invite?token=…`. It has no guard: guests and signed-in people can both open
it, and the screen says so when someone else is signed in. Expired, used,
withdrawn and unknown links show their own error state instead of an accept
button.

## Honest boundaries

| Experience | Simulated behavior | It does not provide |
| --- | --- | --- |
| Password sign-in and reset | Form validation, stored demo values, verification and lockout UX in browser storage. | Authentication, password hashing, an identity server or protection for credentials. |
| OAuth / SSO | Provider-shaped consent and deterministic outcomes inside the prototype. | Contact with Google, GitHub or another provider; a real OAuth/OIDC flow. |
| MFA | Codes derived from the simulated seed and clock, plus recovery-code UX. | A real authenticator, TOTP security or a second security factor. |
| Roles and permissions | Services enforce capabilities so role-specific product behavior can be demonstrated. | An authorization boundary; users can alter browser state and same-origin scripts can access it. |
| Inbox and invitations | Local messages, invitation links and an accept screen that joins the workspace and signs the invitee in (refused for disabled or locked accounts). | Email delivery or proof that someone owns the address. |

The simulation still follows the kit's own rules consistently, so a demo never
shows a shortcut a real product would forbid. MFA (password, magic link and
OAuth) needs a single-use challenge from the first factor. Sign-in counts
failed attempts and locks. Workspace renames and invitation changes check the
actor's role **in the target workspace**. Destructive actions (remove member,
revoke invitation, cancel subscription) ask for confirmation. Every password
field says: "Simulation only — do not use a real password. What you type is
kept as plain text in this browser and in exported snapshots." These are
product behaviors, not security: anyone can edit browser storage.
| Checkout and billing | In-browser plan changes, checkout outcomes, subscriptions and invoices. | Payment processing, card collection or a charge. |

All account, token, MFA, inbox and billing rows are fictional prototype data in
IndexedDB. Browser users and same-origin scripts can read or change that data;
the browser can also clear it. Do not enter real credentials, personal data,
payment details or secrets. For the repository-wide threat model, see
[`SECURITY.md`](SECURITY.md).

## For agents

The distributable Protoyard skill routes kit choices through its `kits`
sub-skill ([`skills/protoyard/kits/SKILL.md`](../skills/protoyard/kits/SKILL.md))
and its catalog ([`skills/protoyard/references/kits.md`](../skills/protoyard/references/kits.md)),
which link back to this guide. Keep the catalog's entry for this kit in step
when its entry points or limits change.
