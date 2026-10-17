<script lang="ts">
import {
  Activity,
  Building2,
  ChartNoAxesColumn,
  Handshake,
  KanbanSquare,
  Settings,
  Users,
} from '@lucide/svelte';
import { createRouter, Link, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { ROLE_LABELS } from './domain/policy.ts';
import { provideCrm } from './lib/context.ts';
import ActivityFeed from './screens/ActivityFeed.svelte';
import Companies from './screens/Companies.svelte';
import CompanyDetail from './screens/CompanyDetail.svelte';
import Contacts from './screens/Contacts.svelte';
import Dashboard from './screens/Dashboard.svelte';
import DealDetail from './screens/DealDetail.svelte';
import Deals from './screens/Deals.svelte';
import Pipeline from './screens/Pipeline.svelte';
import Team from './screens/Team.svelte';

const crm = provideCrm();
const principal = usePrincipal();

const router = createRouter(
  [
    { path: '/', component: Dashboard, title: 'Dashboard' },
    { path: '/pipeline', component: Pipeline, title: 'Pipeline' },
    { path: '/deals', component: Deals, title: 'Deals' },
    { path: '/deals/:id', component: DealDetail, title: 'Deal' },
    { path: '/companies', component: Companies, title: 'Companies' },
    { path: '/companies/:id', component: CompanyDetail, title: 'Company' },
    { path: '/contacts', component: Contacts, title: 'Contacts' },
    { path: '/activity', component: ActivityFeed, title: 'Activity' },
    { path: '/team', component: Team, title: 'Team & settings' },
  ],
  { titleSuffix: crm.runtime.manifest.name }
);
onDestroy(() => router.destroy());

const nav = [
  { href: '/', label: 'Dashboard', icon: ChartNoAxesColumn, exact: true },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/deals', label: 'Deals', icon: Handshake },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/team', label: 'Team & settings', icon: Settings },
];

const org = $derived(principal.current?.organization);
const plan = $derived(org?.billingStatus === 'expired' ? 'expired' : (org?.plan ?? 'free'));
</script>

<AppShell sidebarLabel="Main navigation">
  {#snippet sidebar()}
    <div class="flex h-full flex-col gap-6 p-4">
      <a href="#/" class="flex items-center gap-2.5 px-2 pt-1">
        <span
          class="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"
          aria-hidden="true"
        >
          <ChartNoAxesColumn class="size-4" />
        </span>
        <span class="leading-tight">
          <span class="block text-sm font-semibold text-sidebar-foreground">Pipeline</span>
          <span class="block text-xs text-muted-foreground">{org?.name ?? 'CRM'}</span>
        </span>
      </a>

      <nav aria-label="Sections">
        <ul class="flex flex-col gap-0.5">
          {#each nav as item (item.href)}
            <li>
              <Link
                href={item.href}
                {router}
                exact={item.exact}
                class="group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                activeClass="bg-primary/10 font-semibold !text-foreground"
              >
                <item.icon class="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          {/each}
        </ul>
      </nav>

      {#if principal.current}
        <div class="mt-auto rounded-lg border border-sidebar-border bg-surface p-3">
          <div class="flex items-center gap-3">
            <Avatar name={principal.current.persona.name} size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
              <p class="truncate text-xs text-muted-foreground">
                {ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}
              </p>
            </div>
          </div>
          <div class="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Plan</span>
            <Badge variant={plan === 'expired' ? 'destructive' : plan === 'pro' ? 'default' : 'secondary'}>
              {plan}
            </Badge>
          </div>
        </div>
      {/if}
    </div>
  {/snippet}

  <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</AppShell>
