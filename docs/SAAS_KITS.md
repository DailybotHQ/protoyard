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

### Invitation acceptance is currently service-only

`createInvitationServices` creates, resends, revokes and accepts invitation
tokens. The acceptance service can match an existing account or create a
persona and simulated account, then add the membership. It does not sign the
invitee in or bypass MFA.

The SaaS UI package does not yet provide an invitation-accept screen or route.
The service's default inbox action points to
`#/invites/accept?token=…`, while the `pendingInvite` scenario fragment uses
`#/invite?token=…`; neither path is currently registered by `saasRoutes`. Those
actions therefore do not complete acceptance when clicked. A prototype that
needs this journey must provide its own route and screen, read and validate the
token, call `createInvitationServices(runtime).accept({ tokenId })`, and show
service errors. It must handle sign-in separately after acceptance.

## Honest boundaries

| Experience | Simulated behavior | It does not provide |
| --- | --- | --- |
| Password sign-in and reset | Form validation, stored demo values, verification and lockout UX in browser storage. | Authentication, password hashing, an identity server or protection for credentials. |
| OAuth / SSO | Provider-shaped consent and deterministic outcomes inside the prototype. | Contact with Google, GitHub or another provider; a real OAuth/OIDC flow. |
| MFA | Codes derived from the simulated seed and clock, plus recovery-code UX. | A real authenticator, TOTP security or a second security factor. |
| Roles and permissions | Services enforce capabilities so role-specific product behavior can be demonstrated. | An authorization boundary; users can alter browser state and same-origin scripts can access it. |
| Inbox and invitations | Local messages and token-driven service operations. | Email delivery; the invitation acceptance UI is not yet included. |
| Checkout and billing | In-browser plan changes, checkout outcomes, subscriptions and invoices. | Payment processing, card collection or a charge. |

All account, token, MFA, inbox and billing rows are fictional prototype data in
IndexedDB. Browser users and same-origin scripts can read or change that data;
the browser can also clear it. Do not enter real credentials, personal data,
payment details or secrets. For the repository-wide threat model, see
[`SECURITY.md`](SECURITY.md).
