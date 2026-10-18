# @protoyard/saas-ui

Svelte 5 screens and route helpers for Protoyard's **simulated** SaaS kits
(ADR-018). The engine stays in `@protoyard/saas` (no Svelte); this package is
the drop-in UI layer on `@protoyard/ui` and `@protoyard/renderer-svelte`.

> **Simulation, not security.** Guards and screens only shape the prototype UX.
> Any script on the same origin can change the session.

## Install

```json
{
  "dependencies": {
    "@protoyard/saas-ui": "workspace:*",
    "@protoyard/saas": "workspace:*",
    "@protoyard/ui": "workspace:*",
    "@protoyard/renderer-svelte": "workspace:*"
  }
}
```

```css
@import 'tailwindcss';
@import '@protoyard/themes/base.css';
@import '@protoyard/ui/styles.css';
@import '@protoyard/saas-ui/styles.css';
```

## Context

```svelte
<script lang="ts">
  import { provideRuntime } from '@protoyard/renderer-svelte';
  import { provideSaas } from '@protoyard/saas-ui';

  let { runtime } = $props();
  provideRuntime(runtime);
  provideSaas(runtime, { lazy: true, billing: createBilling(runtime, catalog) });
</script>
```

## Routes (lazy by default)

```ts
import { createRouter } from '@protoyard/renderer-svelte';
import { requireSaasApp, saasRoutes } from '@protoyard/saas-ui';

const routes = [
  ...saasRoutes({ session: runtime.session, lazy: true }),
  {
    path: '/',
    component: Home,
    guard: requireSaasApp(runtime.session),
  },
];

createRouter(routes, {
  revalidateOn: (refresh) => runtime.session.subscribe(refresh),
});
```

Each kit screen uses router `load: () => import(...)` so it is its own chunk.
Guards stay in the main bundle (&lt; 1 KB). Initial JS gains **0 KB** of screen
UI until a kit route opens.

| Path | Screen | Guard |
| --- | --- | --- |
| `/sign-in`, `/sign-up` | Sign in / up | guest-only |
| `/auth/magic`, `/auth/reset`, `/auth/verify` | Magic link, reset, verify | — |
| `/auth/mfa` | MFA challenge (pre-session) | — |
| `/oauth/:provider/consent` | Simulated provider consent | — |
| `/oauth/:provider/link` | Confirm and continue an account link | — |
| `/inbox` | Simulated inbox with read, archive and action links | `requireAuth` |
| `/onboarding` | Onboarding wizard | `requireAuth` |
| `/billing/plans` | Pricing cards (integer cents) | `requireAuth` |
| `/billing/checkout` | Simulated checkout — no card, no charge; outcome picker only when `billingShowOutcomePicker` | `requireAuth` |
| `/billing/portal` | Current plan, seats, invoices, cancel/resume | `requireAuth` |


Mount `TrialBanner` in the app shell to show remaining trial days from the simulated clock. Use the exported `InboxDrawer` on a signed-out screen to open the simulated
mailbox without changing routes. Pass a fictional `recipient` when no signed-in
persona supplies one. `InboxBadge` is available for headers and displays the
unread count. Inbox messages are plain text and action links stay in the
prototype's hash routes.
| `/inbox` | Simulated inbox | `requireAuth` |
| `/onboarding` | Onboarding wizard (**working**, see below) | `requireAuth` |

Sign-in, sign-up, magic-link, MFA, reset and email-verification routes are
working simulated flows. Password sign-in checks MFA before opening a session;
magic links consume the inbox token and route MFA-enrolled accounts to the
challenge. OAuth consent uses the in-app provider simulator and never contacts
an external provider. It displays requested scopes, supports deny and approve,
and asks for confirmation before linking a matching existing account.

Render `SsoButtons` on a sign-in or sign-up screen to start the simulated
provider flow. It accepts an optional provider list, `sign-in` / `sign-up` /
`link` intent, and per-provider scenario overrides:

```svelte
<script lang="ts">
  import { SsoButtons } from '@protoyard/saas-ui';
</script>

<SsoButtons providers={['google', 'github']} intent="sign-in" />
```

## Onboarding wizard

`/onboarding` renders `OnboardingWizard`: `@protoyard/ui` `Wizard` on the
`@protoyard/saas` engine (`createOnboarding`), rows in `saas_onboarding`. Add
the table with `saasStores(1, { tables: ['saas_onboarding', …] })` and grant
`onboarding:progress` in your policy.

- **Persisted:** Next saves the answer and the position in one transaction; Back
  and **Skip for now** (optional steps) are saved too. A reload resumes at the
  stored step, with earlier answers filled in.
- **Real changes:** the default steps apply their answers before saving:
  - *Profile* updates the persona's name and title (`runtime.identity`).
  - *Workspace* renames the organization (`workspaces:rename`). Without that
    capability the field is read-only and the person just continues.
  - *Invite teammates* adds members through `runtime.members.invite`
    (`members:invite`). Addresses must be fictional (`@example.com`).
  - *Preferences* sets the persona's color mode.
- **Finish** marks the persona `onboardingComplete` and goes to `?next=` or the
  kit's home path (or calls `onComplete`). The finished view lists the answers and
  offers **Restart onboarding** behind a confirmation dialog. Restarting keeps the
  answers as defaults; people already invited stay in the workspace.
- **Progress:** a progress bar (`flow.progressOf`) plus the Wizard stepper.
- Field errors from zod show inline under each field. Errors from `apply` keep
  the person on the step.

Configure it by passing your own steps, and render any step yourself with a snippet:

```svelte
<script lang="ts">
  import { defaultOnboardingSteps, OnboardingWizard, type OnboardingUiStep } from '@protoyard/saas-ui';
  import { z } from 'zod';

  const steps: OnboardingUiStep[] = [
    ...defaultOnboardingSteps().slice(0, 2),
    { id: 'goal', label: 'Your goal', schema: z.object({ goal: z.enum(['ship', 'learn']) }) },
  ];
</script>

{#snippet goal({ values, issues, setValue })}
  <!-- your own controls; call setValue('goal', 'ship') -->
{/snippet}

<OnboardingWizard {steps} snippets={{ goal }} />
```

A step without a snippet renders its `fields` (`text`, `emails`, `select`).
`defaults`, `readOnly`/`readOnlyNote` and `apply` are optional. The screen is
its own lazy chunk through the `/onboarding` route.

## Guards

| Helper | Behavior |
| --- | --- |
| `requireAuth(session)` | Signed-out → `/sign-in?next=…` |
| `requireOnboarded(session)` | Auth + `persona.onboardingComplete` |
| `requireCapability(session, cap)` | Auth + `session.can(cap)` |
| `requireGuest(session)` | Signed-in → `?next=` or home |
| `requireSaasApp(session)` | Alias of `requireOnboarded` for app shells |

## Workspace switcher

```svelte
<script lang="ts">
  import { WorkspaceSwitcher } from '@protoyard/saas-ui';
  let { runtime } = $props();
</script>

<WorkspaceSwitcher {runtime} />
```

Dropdown (Bits UI) lists the signed-in persona's organizations, marks the
active one, switches via `createWorkspaces(runtime).switchTo`, and opens a
create dialog that calls `workspaces.create` (owner membership + switch).
Requires the prototype policy to grant `workspaces:create` (or `*`).

## Checks

```bash
pnpm vitest run packages/saas-ui
pnpm --filter @protoyard/saas-ui typecheck
pnpm exec biome check packages/saas-ui
```
