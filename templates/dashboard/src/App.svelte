<script lang="ts">
import {
  ChartNoAxesColumn,
  LayoutDashboard,
  Settings as SettingsIcon,
  ShoppingCart,
  Users,
} from '@lucide/svelte';
import { createRouter, Router, useAppearance, usePrincipal } from '@protoyard/renderer-svelte';
import { LayoutHost, navFromSidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { ROLE_LABELS } from './domain/policy.ts';
import { provideDashboard } from './lib/context.ts';
import { routes } from './routes.ts';

const { runtime, settings } = provideDashboard();
const principal = usePrincipal();
const appearance = useAppearance();

/** Hash routes work on refresh and back/forward on any static host. Add screens here AND in `nav`. */
const router = createRouter(routes, { titleSuffix: runtime.manifest.name });
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
const layoutNav = $derived(
  navFromSidebar(nav, {
    brand: { label: workspaceName, icon: 'chart-column' },
    ...(principal.current
      ? {
          user: {
            name: principal.current.persona.name,
            detail: ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role ?? '',
          },
        }
      : {}),
  })
);
</script>

<LayoutHost layout={appearance.current.layout.value} nav={layoutNav} storageKey={runtime.manifest.storage.namespace}>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</LayoutHost>
