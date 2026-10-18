# B2B SaaS Workspace: spec

## Problem

TODO: the product problem in two or three sentences.

The `b2b-saas` template you started from: A complete simulated SaaS starter with sign-in, SSO, onboarding, workspaces, billing, settings, inbox, and project management.

## Users

TODO: who uses it, mapped to the roles in [PERMISSIONS.md](PERMISSIONS.md).

## Capabilities

TODO: what a user can do, one line each, linked to [FLOWS.md](FLOWS.md).

## Non-goals

TODO: what this prototype deliberately does not do.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Active workspace | Lifecycle | normal | 83002 | `{"saas":{"workspaces":2}}` | An onboarded owner with multiple workspaces and active projects. |
| `mfa-enrolled` | MFA enrolled | Lifecycle | normal | 83006 | `{"saas":{"mfaEnrolled":true}}` | An owner account has simulated MFA enabled for sign-in walkthroughs. |
| `past-due` | Past-due billing | Lifecycle | normal | 83004 | `{"saas":{"pastDue":true}}` | An onboarded owner explores a failed invoice and plan portal. |
| `pending-invites` | Pending invitations | Lifecycle | normal | 83005 | `{"saas":{"pendingInvites":2}}` | A team owner reviews two invitations in the workspace and inbox. |
| `signed-out` | Signed-out visitor | Lifecycle | sparse | 83001 | `{"saas":{"oauthLinked":["google"],"signedOut":true}}` | A new owner starts signed out and can try the simulated Google SSO flow. |
| `trial-ending` | Trial ending soon | Lifecycle | sparse | 83003 | `{"saas":{"trialEndsInDays":3}}` | An onboarded owner sees a three-day trial reminder and billing options. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.b2b-saas` |
| slug | `b2b-saas` |
| name | B2B SaaS Workspace |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `signed-out` |
| default theme | `violet` |
| storage namespace | `template-b2b-saas` |
| schema version | 1 |
| generator version | 1 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
