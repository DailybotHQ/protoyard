<script lang="ts">
import { createRouter, getRuntime, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { applySaasScenarioSession, createBilling } from '@protoyard/saas';
import {
  InboxDrawer,
  provideSaas,
  requireSaasApp,
  saasRoutes,
  TrialBanner,
  WorkspaceSwitcher,
} from '@protoyard/saas-ui';
import { Button, Separator } from '@protoyard/ui';
import { onDestroy, onMount } from 'svelte';
import Dashboard from './screens/Dashboard.svelte';
import Projects from './screens/Projects.svelte';

const runtime = getRuntime();
const principal = usePrincipal(runtime);
const billing = createBilling(runtime, [
  {
    id: 'pro',
    name: 'Pro',
    unitAmountCents: 1900,
    currency: 'USD',
    interval: 'month',
    trialDays: 14,
  },
  {
    id: 'team',
    name: 'Team',
    unitAmountCents: 4900,
    currency: 'USD',
    interval: 'month',
    trialDays: 14,
  },
]);
provideSaas(runtime, { billing, homePath: '/app', onboardingPath: '/onboarding' });

const router = createRouter(
  [
    { path: '/', component: Dashboard, title: 'Welcome' },
    ...saasRoutes({
      session: runtime.session,
      homePath: '/app',
      onboardingPath: '/onboarding',
      lazy: true,
    }),
    {
      path: '/app',
      component: Dashboard,
      title: 'Workspace',
      guard: requireSaasApp(runtime.session, {
        signInPath: '/sign-in',
        onboardingPath: '/onboarding',
        homePath: '/app',
      }),
    },
    {
      path: '/projects',
      component: Projects,
      title: 'Projects',
      guard: requireSaasApp(runtime.session, {
        signInPath: '/sign-in',
        onboardingPath: '/onboarding',
        homePath: '/app',
      }),
    },
  ],
  {
    titleSuffix: runtime.manifest.name,
    revalidateOn: (refresh) => runtime.session.subscribe(refresh),
  }
);
const unsubscribeScenario = runtime.scenarios.subscribe(
  () => void applySaasScenarioSession(runtime)
);
onMount(() => void applySaasScenarioSession(runtime));
onDestroy(() => {
  router.destroy();
  unsubscribeScenario();
});

const signedIn = $derived(principal.current !== null);
</script>

<!-- The theme paints the page; this file only lays out design-system components. -->
<div class="min-h-dvh">
  {#if signedIn}<TrialBanner />{/if}
  <header>
    <nav class="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-3" aria-label="Main navigation">
      <Button href="#/" variant="ghost" class="mr-auto"><strong>Northstar</strong></Button>
      {#if signedIn}
        <WorkspaceSwitcher {runtime} />
        <Button href="#/app" variant="ghost">Workspace</Button>
        <Button href="#/projects" variant="ghost">Projects</Button>
        <Button href="#/inbox" variant="ghost">Inbox</Button>
        <Button href="#/billing/plans" variant="ghost">Plans</Button>
        <Button href="#/settings" variant="ghost">Settings</Button>
        <InboxDrawer />
      {:else}
        <Button href="#/sign-in" variant="outline">Sign in</Button>
        <Button href="#/sign-up">Create account</Button>
      {/if}
    </nav>
    <Separator />
  </header>
  <main id="main" class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <Router {router} />
  </main>
</div>
