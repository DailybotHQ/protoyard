<script lang="ts">
import { ArrowLeftRight, House, ReceiptText, UserRound, Users } from '@lucide/svelte';
import { createRouter, Router } from '@protoyard/renderer-svelte';
import { BottomNav, MobileAppShell } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { provideBank } from './lib/context.ts';
import { provideShellLayout } from './lib/shell-layout.svelte.ts';
import AccountDetail from './screens/AccountDetail.svelte';
import Activity from './screens/Activity.svelte';
import Home from './screens/Home.svelte';
import Payees from './screens/Payees.svelte';
import Profile from './screens/Profile.svelte';
import Transfer from './screens/Transfer.svelte';

const bank = provideBank();
const shellLayout = provideShellLayout();

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

<!--
  MobileAppShell fills the app viewport (h-app). Only <main> scrolls; BottomNav
  and Transfer's stickyFooter stay visible. Device frames supply presentation —
  no md: desktop-card chrome here. The phone-width cap is for wide windows only:
  inside a phone or tablet frame the app fills the screen (landscape too).
-->
<MobileAppShell mainId="main" class="mx-auto w-full max-w-md device-frame:max-w-none">
  {#snippet stickyFooter()}
    {#if shellLayout.footer}
      <div
        class="shrink-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md"
        data-shell-sticky-footer
      >
        {@render shellLayout.footer()}
      </div>
    {/if}
  {/snippet}
  {#snippet bottomNav()}
    <BottomNav {items} label="Main" fixed={false} />
  {/snippet}
  <Router {router} />
</MobileAppShell>
