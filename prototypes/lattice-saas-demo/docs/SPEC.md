# Lattice: spec

## Problem

Small teams plan their initiatives across spreadsheets and chat, so nobody
sees which projects are moving, which are still being planned and what
finished. Lattice is a fictional team-planning SaaS: a project portfolio per
workspace (planning, active, complete) wrapped in the full SaaS journey a
real product needs around it: a public landing page, sign-up and sign-in,
email verification, magic links, password reset, simulated MFA, onboarding,
workspaces and members, invitations, an inbox, plans, checkout and a billing
portal.

It is the flagship for the SaaS kits (`@protoyard/saas` and
`@protoyard/saas-ui`, see [docs/SAAS_KITS.md](../../../docs/SAAS_KITS.md)),
built from the `b2b-saas` template. The project portfolio is this
prototype's own domain (`src/domain/projects.ts`); every other journey is a
kit screen backed by kit services.

## Users

All roles are simulated personas; see [PERMISSIONS.md](PERMISSIONS.md).

| User | Role | What they do |
| --- | --- | --- |
| Visitor evaluating the product | signed out (no role) | Reads the landing page, signs up, signs in, uses a magic link or resets a password |
| Team lead who created the workspace | `owner` | Everything (`*`): projects, members and roles, invitations, workspaces, billing, profile and security settings |
| Operations lead | `admin` | Everything (`*`), the same as `owner` in this policy |
| Teammate | `member` | Creates projects and changes their status, invites people, renames the workspace, moves through onboarding, signs out. Cannot delete projects, manage roles, create workspaces, change billing or edit profile, security or notification settings |
| Stakeholder | `viewer` | Reads the portfolio, moves through onboarding (without renaming the workspace or inviting) and signs out; every other write is blocked |

## Capabilities

- Create a project, move it between planning, active and complete, and delete it: [Create a project](FLOWS.md#create-a-project), [Change a project's status](FLOWS.md#change-a-projects-status), [Delete a project](FLOWS.md#delete-a-project).
- Sign up, open the new account's own inbox and confirm the email, and sign in with a password, a magic link or an MFA code; reset a password: [Sign up](FLOWS.md#sign-up), [Confirm an email address](FLOWS.md#confirm-an-email-address), [Sign in with a password](FLOWS.md#sign-in-with-a-password), [Complete an MFA challenge](FLOWS.md#complete-an-mfa-challenge), [Sign in with a magic link](FLOWS.md#sign-in-with-a-magic-link), [Reset a password](FLOWS.md#reset-a-password).
- Finish the onboarding wizard (profile, workspace name, teammates, color mode): [Complete onboarding](FLOWS.md#complete-onboarding).
- Switch between workspaces or create a new one: [Switch or create a workspace](FLOWS.md#switch-or-create-a-workspace).
- Invite teammates, accept an invitation, change roles and remove members: [Invite a teammate](FLOWS.md#invite-a-teammate), [Accept an invitation](FLOWS.md#accept-an-invitation), [Change a member's role or remove a member](FLOWS.md#change-a-members-role-or-remove-a-member).
- Read, archive and follow inbox messages: [Read the simulated inbox](FLOWS.md#read-the-simulated-inbox).
- Choose a plan, check out and cancel or resume the subscription: [Choose a plan and check out](FLOWS.md#choose-a-plan-and-check-out), [Cancel or resume the subscription](FLOWS.md#cancel-or-resume-the-subscription).
- Sign out from the header with any role: [Sign out](FLOWS.md#sign-out).
- Edit profile, password, MFA and notification preferences: [Edit profile settings](FLOWS.md#edit-profile-settings), [Change password, set up MFA or sign out from Security](FLOWS.md#change-password-set-up-mfa-or-sign-out-from-security), [Edit notification preferences](FLOWS.md#edit-notification-preferences).
- Sign in or sign up with a simulated provider ("Continue with Google, Microsoft or GitHub", labelled Simulated), approve or deny the in-app consent, and land a new account in onboarding: [Sign in or sign up with a simulated provider](FLOWS.md#sign-in-or-sign-up-with-a-simulated-provider).
- Read the overview and the portfolio (described in [SCREENS.md](SCREENS.md)).

## Non-goals

- No project detail, tasks, milestones, owners other than the creator, or
  due dates: a project is a name, a summary and a status. Name and summary
  cannot be edited after creation in the UI.
- No real identity: no password security, no email delivery, no OAuth
  provider, no real authenticator app.
- No payments: no card fields, no charge, no tax, no payment provider.
- No real provider sign-in: the "Continue with …" buttons start the kit's
  in-app OAuth simulation, never a provider. Apple and Slack are not
  offered (the kit supports them).
- No plan downgrade: the checkout screen calls `upgrade` or `checkout` only.
- No collaboration between people: everyone is a persona in one browser.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `mfa-enrolled` | MFA enrolled | Lifecycle | normal | 83007 | `{"saas":{"mfaEnrolled":true}}` | An owner account has simulated multi-factor authentication enabled. |
| `mid-onboarding` | Mid-onboarding workspace | Lifecycle | sparse | 83002 | `{"saas":{"oauthLinked":["google"]}}` | An invited workspace owner is halfway through setting up the team. |
| `multi-workspace-admin` | Multi-workspace admin | Lifecycle | normal | 83005 | `{"saas":{"workspaces":3}}` | An admin switches between three workspaces and manages a project portfolio. |
| `past-due` | Past-due billing | Lifecycle | normal | 83004 | `{"saas":{"pastDue":true}}` | An onboarded owner reviews a failed invoice and simulated billing portal. |
| `pending-invite` | Pending teammate invite | Lifecycle | normal | 83008 | `{"saas":{"pendingInvites":1}}` | An owner checks a workspace with a pending invitation and team activity. |
| `signed-out` | Signed-out visitor | Lifecycle | sparse | 83001 | `{"saas":{"oauthLinked":["google"],"signedOut":true}}` | A new team lead explores Lattice before starting a workspace. |
| `trial-ending` | Trial ending in two days | Lifecycle | sparse | 83003 | `{"saas":{"trialEndsInDays":2}}` | An onboarded owner reviews plans before the two-day trial expires. |
| `viewer` | Read-only project viewer | Lifecycle | normal | 83006 | — | A viewer can review the project portfolio without changing team data. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

Everything below is a simulation. See
[docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries) and the kit's
[honest boundaries](../../../docs/SAAS_KITS.md#honest-boundaries).

| Concern | What this prototype does |
| --- | --- |
| Data | Stored in IndexedDB in the visitor's browser (namespace `lattice-saas-demo`). Nothing is shared between visitors or devices; there is no sync, collaboration or backup. |
| Identity | Simulated sign-up, sign-in, magic links, password reset, email verification and MFA from the SaaS kit ([ADR-018](../../../docs/DECISIONS.md#adr-018--simulated-authentication-oauth-mfa-and-billing-kits)). The prototype boots signed out (`auth.signedOutByDefault`). Passwords are stored as typed in `saas_accounts.simulatedPassword` (every seeded persona uses `demo-password`; the scenario actor is `owner@example.com`). This is not authentication and protects nothing. Personas can also be switched in DevTools, which is part of `pnpm protoyard dev` but not of the static build (`build.includeDevtools: false`). |
| MFA | Six-digit codes derived from a stored seed and the simulated clock, shown on screen ("Simulated authenticator code"); recovery codes are stored in plain text. Not TOTP and not a second factor. |
| OAuth | "Continue with Google / Microsoft / GitHub" on sign-in and sign-up (neutral icon, a persistent "Simulated" label) opens a provider-shaped consent screen inside the app; no provider is contacted and the identities are fictional (`google.user@example.com`). |
| Email | The inbox is the `saas_inbox` table. Verification, magic-link, reset, invitation, receipt and trial messages are rows with an in-app `#/…` action; nothing is sent, and opening a link stands for owning the mailbox. A pending sign-up opens its own inbox from `#/inbox?account=<id>`; anyone with that id could, which is acceptable only because it is a simulation. |
| Permissions | Capabilities in `src/domain/policy.ts`, checked by `session.assert` in the project services and the kit services, and by route guards (signed in, onboarded). They shape the UX and make forbidden calls fail even from the browser console, but they are not authorization or security. |
| Payments | Plans, trials, checkout outcomes, subscriptions and invoices in integer cents (`Pro` 1900 and `Team` 4900 cents per seat per month in `LATTICE_PLANS`, `src/domain/plans.ts`, the single price source for the billing engine and the seeded subscriptions). The checkout screen always uses the `success` outcome; nobody is charged and no card data exists. |
| Network | No network calls. Mutations run through `environment.run` (`projects.create`, `auth.signUp`, `billing.checkout`, …), which can add latency, fail as offline or inject errors from DevTools. |
| Time | A simulated clock set to the scenario reference time (for example `2026-10-18T09:00:00.000Z` for `signed-out`). Token expiry, MFA codes, the trial banner and the trial countdown use it. Advancing time in DevTools applies `billingTimeline`: a trial whose end passes expires (subscription and organization `expired`, a "trial ended" inbox message). Nothing runs in the background. |
| People and workspaces | Generated, fictional data (`example.com` addresses; the workspace "Northstar Studio"). The generator is deterministic: the same seed, reference time and versions produce the same world. |

## Rebuild as a real app

The hand-off for building the production version. No vendor or framework is
chosen here. See
[docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

| Prototype piece | Real counterpart to design |
| --- | --- |
| `projects` in `src/database/schema.ts` ([DATA_MODEL.md](DATA_MODEL.md)) | A server table scoped by workspace (`organizationId`), with the same ids, status enum and indexes |
| The `saas_*` kit tables | Server tables for accounts, sessions, single-use tokens, MFA factors, invitations, notifications, subscriptions and invoices; most of them belong to an identity provider and a billing system rather than the app database |
| Schema v1 (no upgrades yet) | Server migrations from the same starting schema |
| `createProjectServices` (zod inputs, `session.assert` with the workspace, one transaction per write) | API endpoints or server actions with the same inputs, workspace scoping, checks and transaction boundaries ([FLOWS.md](FLOWS.md)) |
| `policy.roles` (no record-level rules) | Server-side authorization on every request, scoped to the workspace membership ([PERMISSIONS.md](PERMISSIONS.md)) |
| Simulated sign-up, sign-in, magic link, reset, verification and MFA | A real identity provider: hashed credentials, rate limiting and lockout, verified email delivery, real TOTP or passkeys, secure sessions and sign-out on every device |
| OAuth consent simulator | Real OAuth or OIDC integration with the chosen providers |
| `saas_inbox` messages | Transactional email (and in-app notifications) with real links |
| Invitations and `members.invite` | Invitation emails with signed, expiring tokens and server-side acceptance |
| `createBilling` plans, checkout, invoices, `billingTimeline` | A billing system: hosted checkout, card collection outside the app, webhooks that update subscription status, dunning for past-due invoices, scheduled trial expiry |
| `environment.run` failures (offline, timeout, server error) | The error, retry and offline states the real UI must keep |
| Scenarios and `generateB2bSaasWorld` | Seed data for staging, demo workspaces and test fixtures (signed out, mid-onboarding, trial ending, past due, several workspaces, viewer, MFA, pending invite) |
| Screens and flows ([SCREENS.md](SCREENS.md)) | The UI to keep; the listed empty, loading, error and denied states are the acceptance list |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.lattice-saas-demo` |
| slug | `lattice-saas-demo` |
| name | Lattice |
| version | 0.1.0 |
| platform | responsive |
| category | productivity |
| default scenario | `signed-out` |
| default theme | `violet` |
| storage namespace | `lattice-saas-demo` |
| schema version | 1 |
| generator version | 3 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
