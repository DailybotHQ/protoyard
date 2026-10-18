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

The table layout, row schemas and integrity rules. The services that read
and write these tables (sign-in, OAuth, magic links, MFA, invitations,
workspaces, billing, onboarding) come in later PLAN_002 tasks and are not in
this package yet.

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

## Size

The whole module is about 2.2 KB gzip, minified with esbuild, with zod and
`@protoyard/core` external because every prototype already ships them. It
is tree-shakable (`sideEffects: false`).

## Checks

```bash
pnpm vitest run packages/saas
pnpm --filter @protoyard/saas typecheck
pnpm exec biome check packages/saas
```
