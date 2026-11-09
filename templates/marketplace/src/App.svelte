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
import { Avatar, Button } from '@protoyard/ui';
import { onDestroy, onMount } from 'svelte';
import { Box, Text } from 'texuli/typography';
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

<div class="min-h-dvh">
  {#if signedIn}<TrialBanner />{/if}
  <Box as="header" surface="default" border="block-end" radius="none" padding="none" class="sticky top-0 z-30 pt-safe">
    <nav class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3" aria-label="Main navigation">
      <a class="mr-auto flex items-center gap-2" href="#/"><Avatar name="F" tone="primary" shape="square" size="sm" decorative /><Text as="span" weight="semibold">Fieldmarket</Text></a>
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
  </Box>
  <main id="main" class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <Router {router} />
  </main>
  <Box as="footer" border="block-start" radius="none" padding="none" class="px-4 py-6">
    <Text size="xs" tone="muted" align="center">
      Simulated marketplace · Checkout and payouts are demonstrations; no real money moves.
    </Text>
  </Box>
</div>
