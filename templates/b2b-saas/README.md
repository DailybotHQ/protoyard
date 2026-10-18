# B2B SaaS template

A signed-out-by-default starter for a simulated SaaS product. It combines the
SaaS kit's auth, simulated Google SSO, onboarding, workspace switching,
billing, profile settings, and inbox with a small projects domain.

## Start a prototype

```bash
pnpm protoyard new my-saas --template b2b-saas
pnpm protoyard dev my-saas
```

The default `signed-out` scenario opens a welcome page. Sign up with a fictional
`@example.com` address, or use the Google SSO button. Kit screens are lazy
routes, so they are split from the initial application bundle.

## Scenarios

- `signed-out` — public landing page, simulated Google sign-in and sign-up.
- `active` — onboarded workspace with multiple workspaces.
- `trial-ending` — a trial with three days remaining.
- `past-due` — a failed invoice and simulated billing portal.
- `pending-invites` — two pending workspace invitations.
- `mfa-enrolled` — account with simulated multi-factor authentication.

The projects screen demonstrates service-backed create and status updates. Its
records are scoped to the current workspace and stored in IndexedDB. Authentication,
SSO, email, billing, and permissions are simulations; no external provider,
message delivery, or payment is contacted.

## Extend it

Start with `src/database/schema.ts`, then define capabilities in
`src/domain/policy.ts`, add validated service operations under
`src/domain/`, and compose new deterministic scenarios in `src/scenarios/`.
Domain mutations use session assertions, Zod parsing, environment simulation,
and Dexie transactions.
