<script lang="ts">
import { Headset, LayoutDashboard, MessageSquare, Ticket, Users } from '@lucide/svelte';
import { createRouter, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header, Sidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import AppSearch from './components/AppSearch.svelte';
import NotificationsBell from './components/NotificationsBell.svelte';
import { nav, routes } from './generated/routes.ts';
import { provideCrudApp } from './lib/context.ts';

const { runtime } = provideCrudApp();
const principal = usePrincipal();

// Hand-written screens next to the generated routes (owned file: regeneration leaves it alone).
const router = createRouter(
  [
    {
      path: '/tickets/:id/workspace',
      title: 'Ticket',
      load: () => import('./screens/TicketWorkspace.svelte'),
    },
    ...routes,
  ],
  { titleSuffix: runtime.manifest.name }
);

const ICONS: Record<string, typeof Ticket> = {
  '/': LayoutDashboard,
  '/tickets': Ticket,
  '/customers': Users,
  '/replies': MessageSquare,
};
onDestroy(() => router.destroy());

const items = $derived(
  nav.map((item) => ({
    href: `#${item.path}`,
    label: item.path === '/' ? 'Dashboard' : item.label,
    icon: ICONS[item.path] ?? item.icon,
    active: router.isActive(item.path, 'exact' in item && item.exact),
  }))
);
</script>

<AppShell sidebarLabel="Main navigation">
  {#snippet sidebar()}
    <Sidebar {items} label="Sections" collapsible={false}>
      {#snippet header()}
        <a href="#/" class="flex min-w-0 items-center gap-2.5 rounded-md px-1">
          <span
            class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"
            aria-hidden="true"
          >
            <Headset class="size-4" />
          </span>
          <span class="truncate text-sm font-semibold">{runtime.manifest.name}</span>
        </a>
      {/snippet}
      {#snippet footer()}
        {#if principal.current}
          <div class="mb-8 flex items-center gap-3 rounded-lg border border-sidebar-border bg-surface p-3">
            <Avatar name={principal.current.persona.name} size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
              <p class="truncate text-xs text-muted-foreground">{principal.current.persona.title ?? ''}</p>
            </div>
            <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>
              {principal.current.role}
            </Badge>
          </div>
        {/if}
      {/snippet}
    </Sidebar>
  {/snippet}

  {#snippet header()}
    <Header class="border-b border-border" title={runtime.manifest.name} titleAs="p">
      {#snippet actions()}
        <div class="flex items-center gap-2">
          <AppSearch />
          <NotificationsBell />
        </div>
      {/snippet}
    </Header>
  {/snippet}

  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</AppShell>
