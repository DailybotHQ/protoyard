<script lang="ts">
import { ArrowLeftRight, House, ReceiptText, UserRound, Users } from '@lucide/svelte';
import { createRouter, Router } from '@protoyard/renderer-svelte';
import { BottomNav } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { provideBank } from './lib/context.ts';
import AccountDetail from './screens/AccountDetail.svelte';
import Activity from './screens/Activity.svelte';
import Home from './screens/Home.svelte';
import Payees from './screens/Payees.svelte';
import Profile from './screens/Profile.svelte';
import Transfer from './screens/Transfer.svelte';

const bank = provideBank();

const router = createRouter(
  [
    { path: '/', component: Home, title: 'Home' },
    { path: '/accounts/:id', component: AccountDetail, title: 'Account' },
    { path: '/activity', component: Activity, title: 'Activity' },
    { path: '/transfer', component: Transfer, title: 'Send money' },
    { path: '/payees', component: Payees, title: 'Payees' },
    { path: '/profile', component: Profile, title: 'Profile' },
  ],
  { titleSuffix: bank.runtime.manifest.name }
);
onDestroy(() => router.destroy());

const tabs = [
  { href: '/', label: 'Home', icon: House, exact: true },
  { href: '/activity', label: 'Activity', icon: ReceiptText },
  { href: '/transfer', label: 'Transfer', icon: ArrowLeftRight },
  { href: '/payees', label: 'Payees', icon: Users },
  { href: '/profile', label: 'Profile', icon: UserRound },
];
// Account pages live under Home in the navigation.
const items = $derived(
  tabs.map((tab) => ({
    label: tab.label,
    href: router.href(tab.href),
    icon: tab.icon,
    active: tab.exact
      ? router.isActive('/', true) || router.isActive('/accounts')
      : router.isActive(tab.href),
  }))
);
</script>

<div class="min-h-dvh bg-muted/40 md:py-6">
  <div
    class="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background md:min-h-[calc(100dvh-3rem)] md:overflow-hidden md:rounded-3xl md:border md:border-border md:shadow-xl"
  >
    <main id="main" class="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <Router {router} />
    </main>
  </div>
  <BottomNav {items} label="Main" />
</div>
