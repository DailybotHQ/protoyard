<script lang="ts">
import { createRouter, getRuntime, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { applySaasScenarioSession, createBilling } from '@protoyard/saas';
import {
  InboxDrawer,
  provideSaas,
  requireAuth,
  saasRoutes,
  TrialBanner,
  WorkspaceSwitcher,
} from '@protoyard/saas-ui';
import { Button } from '@protoyard/ui';
import { onDestroy, onMount } from 'svelte';
import Checkout from './screens/Checkout.svelte';
import Marketplace from './screens/Marketplace.svelte';
import Orders from './screens/Orders.svelte';
import SellerConsole from './screens/SellerConsole.svelte';

const runtime = getRuntime();
const principal = usePrincipal(runtime);
const billing = createBilling(runtime, [
  {
    id: 'starter',
    name: 'Starter',
    unitAmountCents: 0,
    currency: 'USD',
    interval: 'month',
    trialDays: 14,
  },
  {
    id: 'studio',
    name: 'Studio',
    unitAmountCents: 1200,
    currency: 'USD',
    interval: 'month',
    trialDays: 14,
  },
]);
provideSaas(runtime, { billing, homePath: '/', onboardingPath: '/onboarding' });

const router = createRouter(
  [
    { path: '/', component: Marketplace, title: 'Marketplace' },
    ...saasRoutes({ session: runtime.session, homePath: '/', lazy: true }),
    {
      path: '/seller/onboarding',
      title: 'Become a seller',
      guard: requireAuth(runtime.session),
      load: () => import('./screens/SellerOnboarding.svelte'),
    },
    {
      path: '/seller',
      component: SellerConsole,
      title: 'Seller studio',
      guard: requireAuth(runtime.session),
    },
    {
      path: '/checkout/:id',
      component: Checkout,
      title: 'Checkout',
      guard: requireAuth(runtime.session),
    },
    { path: '/orders', component: Orders, title: 'Orders', guard: requireAuth(runtime.session) },
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
  <header class="sticky top-0 z-30 border-b border-border bg-background/90 pt-safe backdrop-blur">
    <nav class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3" aria-label="Main navigation">
      <a class="mr-auto flex items-center gap-2 font-semibold" href="#/"><span class="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true">F</span>Fieldmarket</a>
      <a href="#/">Discover</a>
      {#if signedIn}
        <WorkspaceSwitcher {runtime} />
        <a href="#/seller">Seller studio</a>
        <a href="#/orders">Orders</a>
        <a href="#/billing/plans">Plans</a>
        <a href="#/settings">Settings</a>
        <InboxDrawer />
      {:else}
        <Button href="#/sign-in" variant="outline">Sign in</Button>
        <Button href="#/sign-up">Join Fieldmarket</Button>
      {/if}
    </nav>
  </header>
  <main id="main" class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <Router {router} />
  </main>
  <footer class="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
    Simulated marketplace · Checkout and payouts are demonstrations; no real money moves.
  </footer>
</div>
