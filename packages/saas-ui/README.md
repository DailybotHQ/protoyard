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
  provideSaas(runtime, { lazy: true });
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

| Path | Screen (scaffold) | Guard |
| --- | --- | --- |
| `/sign-in`, `/sign-up` | Sign in / up | guest-only |
| `/auth/magic`, `/auth/reset`, `/auth/verify` | Magic link, reset, verify | — |
| `/auth/mfa` | MFA challenge | `requireAuth` |
| `/oauth/consent` | Simulated provider consent | — |
| `/inbox` | Simulated inbox | `requireAuth` |
| `/onboarding` | Onboarding wizard | `requireAuth` |

Full interactive screens land in later PLAN_002 tasks; the scaffold ships
accessible placeholders so routes and guards are real today.

## Guards

| Helper | Behavior |
| --- | --- |
| `requireAuth(session)` | Signed-out → `/sign-in?next=…` |
| `requireOnboarded(session)` | Auth + `persona.onboardingComplete` |
| `requireCapability(session, cap)` | Auth + `session.can(cap)` |
| `requireGuest(session)` | Signed-in → `?next=` or home |
| `requireSaasApp(session)` | Alias of `requireOnboarded` for app shells |

## Checks

```bash
pnpm vitest run packages/saas-ui
pnpm --filter @protoyard/saas-ui typecheck
pnpm exec biome check packages/saas-ui
```
