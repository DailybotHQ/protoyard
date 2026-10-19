<script lang="ts">
import { Building2, LayoutDashboard, ScrollText, ShieldCheck, Users } from '@lucide/svelte';
import { avatarImage, can, createRouter, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, EmptyState, Header, Sidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import ImpersonationBanner from './components/ImpersonationBanner.svelte';
import { CAPABILITIES, ROLE_LABELS } from './domain/policy.ts';
import { provideAdmin } from './lib/context.ts';
import { routes } from './routes.ts';
import ImpersonatedView from './screens/ImpersonatedView.svelte';

const { runtime, impersonation } = provideAdmin();
const principal = usePrincipal();

/** Hash routes work on refresh and back/forward on any static host. Add screens here AND in `nav`. */
const router = createRouter(routes, { titleSuffix: runtime.manifest.name });
onDestroy(() => router.destroy());

const nav = $derived([
  { href: '#/', label: 'Overview', icon: LayoutDashboard, active: router.isActive('/', true) },
  { href: '#/tenants', label: 'Tenants', icon: Building2, active: router.isActive('/tenants') },
  { href: '#/users', label: 'Users', icon: Users, active: router.isActive('/users') },
  { href: '#/audit', label: 'Audit log', icon: ScrollText, active: router.isActive('/audit') },
]);
const staff = $derived(can(CAPABILITIES.read));
</script>

<ImpersonationBanner />

{#if impersonation.current}
  <ImpersonatedView />
{:else if !staff}
  <div class="mx-auto max-w-lg p-8">
    <EmptyState
      icon={ShieldCheck}
      title="No console access"
      description="This persona is not on the staff team. Switch to a staff persona in DevTools, or load a scenario."
    />
  </div>
{:else}
  <AppShell sidebarLabel="Main navigation">
    {#snippet sidebar()}
      <Sidebar items={nav} label="Sections" collapsible={false}>
        {#snippet header()}
          <a href="#/" class="flex min-w-0 items-center gap-2.5 rounded-md px-1">
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm" aria-hidden="true">
              <ShieldCheck class="size-4" />
            </span>
            <span class="truncate text-sm font-semibold">{principal.current?.organization?.name ?? 'Admin Console'}</span>
          </a>
        {/snippet}
        {#snippet footer()}
          {#if principal.current}
            <!-- Bottom margin keeps the card clear of the fixed "Prototype" badge. -->
            <div class="mb-8 flex items-center gap-3 rounded-lg border border-sidebar-border bg-surface p-3">
              <Avatar name={principal.current.persona.name} {...avatarImage(principal.current.persona.avatar)} size="sm" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
                <p class="truncate text-xs text-muted-foreground">{ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}</p>
              </div>
              <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>Staff</Badge>
            </div>
          {/if}
        {/snippet}
      </Sidebar>
    {/snippet}

    {#snippet header()}
      <Header class="lg:hidden" title="Admin Console" />
    {/snippet}

    <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
      <Router {router} />
    </div>
  </AppShell>
{/if}
