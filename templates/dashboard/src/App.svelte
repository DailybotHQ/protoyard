<script lang="ts">
import {
  ChartNoAxesColumn,
  LayoutDashboard,
  Settings as SettingsIcon,
  ShoppingCart,
  Users,
} from '@lucide/svelte';
import { createRouter, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header, Sidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { ROLE_LABELS } from './domain/policy.ts';
import { provideDashboard } from './lib/context.ts';
import CustomerDetail from './screens/CustomerDetail.svelte';
import Customers from './screens/Customers.svelte';
import Orders from './screens/Orders.svelte';
import Overview from './screens/Overview.svelte';
import Settings from './screens/Settings.svelte';

const { runtime, settings } = provideDashboard();
const principal = usePrincipal();

/** Hash routes work on refresh and back/forward on any static host. Add screens here AND in `nav`. */
const router = createRouter(
  [
    { path: '/', component: Overview, title: 'Overview' },
    { path: '/customers', component: Customers, title: 'Customers' },
    { path: '/customers/:id', component: CustomerDetail, title: 'Customer' },
    { path: '/orders', component: Orders, title: 'Orders' },
    { path: '/settings', component: Settings, title: 'Settings' },
  ],
  { titleSuffix: runtime.manifest.name }
);
onDestroy(() => router.destroy());

const nav = $derived([
  { href: '#/', label: 'Overview', icon: LayoutDashboard, active: router.isActive('/', true) },
  { href: '#/customers', label: 'Customers', icon: Users, active: router.isActive('/customers') },
  { href: '#/orders', label: 'Orders', icon: ShoppingCart, active: router.isActive('/orders') },
  {
    href: '#/settings',
    label: 'Settings',
    icon: SettingsIcon,
    active: router.isActive('/settings'),
  },
]);
const workspaceName = $derived(
  settings.current?.workspaceName ?? principal.current?.organization?.name ?? 'Workspace'
);
</script>

<AppShell sidebarLabel="Main navigation">
  {#snippet sidebar()}
    <Sidebar items={nav} label="Sections" collapsible={false}>
      {#snippet header()}
        <a href="#/" class="flex min-w-0 items-center gap-2.5 rounded-md px-1">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm" aria-hidden="true">
            <ChartNoAxesColumn class="size-4" />
          </span>
          <span class="truncate text-sm font-semibold">{workspaceName}</span>
        </a>
      {/snippet}
      {#snippet footer()}
        {#if principal.current}
          <!-- Bottom margin keeps the card clear of the fixed "Prototype" badge. -->
          <div class="mb-8 flex items-center gap-3 rounded-lg border border-sidebar-border bg-surface p-3">
            <Avatar name={principal.current.persona.name} size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
              <p class="truncate text-xs text-muted-foreground">{principal.current.persona.title}</p>
            </div>
            <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>
              {ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}
            </Badge>
          </div>
        {/if}
      {/snippet}
    </Sidebar>
  {/snippet}

  {#snippet header()}
    <Header class="lg:hidden" title={workspaceName} />
  {/snippet}

  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</AppShell>
