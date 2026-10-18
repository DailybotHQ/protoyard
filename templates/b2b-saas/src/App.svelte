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
import { Button } from '@protoyard/ui';
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

<div class="min-h-dvh bg-background text-foreground">
  {#if signedIn}<TrialBanner />{/if}
  <header class="border-b border-border bg-surface">
    <nav class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3" aria-label="Main navigation">
      <a class="mr-auto font-semibold" href="#/">Northstar</a>
      {#if signedIn}
        <WorkspaceSwitcher {runtime} />
        <a href="#/app">Workspace</a>
        <a href="#/projects">Projects</a>
        <a href="#/inbox">Inbox</a>
        <a href="#/billing/plans">Plans</a>
        <a href="#/settings">Settings</a>
        <InboxDrawer />
      {:else}
        <Button href="#/sign-in" variant="outline">Sign in</Button>
        <Button href="#/sign-up">Create account</Button>
      {/if}
    </nav>
  </header>
  <main id="main" class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <Router {router} />
  </main>
</div>
