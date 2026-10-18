<script lang="ts">
import { Bot, ChartNoAxesColumn, FlaskConical, History } from '@lucide/svelte';
import { createRouter, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import SidebarNav from './components/SidebarNav.svelte';
import { ROLE_LABELS } from './domain/policy.ts';
import AgentDetail from './screens/AgentDetail.svelte';
import Agents from './screens/Agents.svelte';
import DatasetDetail from './screens/DatasetDetail.svelte';
import Evaluations from './screens/Evaluations.svelte';
import RunDetail from './screens/RunDetail.svelte';
import Runs from './screens/Runs.svelte';
import Usage from './screens/Usage.svelte';

const principal = usePrincipal();

/** Hash routes work on refresh and back/forward on any static host. */
const router = createRouter(
  [
    { path: '/', component: Agents, title: 'Agents' },
    { path: '/agents/:id', component: AgentDetail, title: 'Agent' },
    { path: '/runs', component: Runs, title: 'Runs' },
    { path: '/runs/:id', component: RunDetail, title: 'Run trace' },
    { path: '/evaluations', component: Evaluations, title: 'Evaluations' },
    { path: '/datasets/:id', component: DatasetDetail, title: 'Dataset' },
    { path: '/usage', component: Usage, title: 'Usage' },
  ],
  { titleSuffix: 'Agent Console' }
);
onDestroy(() => router.destroy());

const nav = [
  { href: '/', label: 'Agents', icon: Bot, exact: true },
  { href: '/runs', label: 'Runs', icon: History },
  { href: '/evaluations', label: 'Evaluations', icon: FlaskConical },
  { href: '/usage', label: 'Usage & cost', icon: ChartNoAxesColumn },
];
const org = $derived(principal.current?.organization);
</script>

<AppShell sidebarLabel="Main navigation">
  {#snippet header()}
    <Header title={org?.name ?? 'Agent Console'} titleAs="p" class="lg:hidden">
      {#snippet actions()}
        {#if principal.current}<Avatar name={principal.current.persona.name} size="sm" />{/if}
      {/snippet}
    </Header>
  {/snippet}
  {#snippet sidebar()}
    <div class="flex h-full flex-col gap-6 p-4">
      <a href="#/" class="flex items-center gap-2.5 px-2 pt-1">
        <span class="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm" aria-hidden="true">
          <Bot class="size-4" />
        </span>
        <span class="leading-tight">
          <span class="block text-sm font-semibold text-sidebar-foreground">Agent Console</span>
          <span class="block text-xs text-muted-foreground">{org?.name ?? 'Workspace'}</span>
        </span>
      </a>
      <SidebarNav {router} items={nav} />
      <!-- Bottom padding keeps the persona card clear of the floating demo badge. -->
      <div class="mt-auto space-y-3 pb-10">
        <p class="rounded-lg border border-dashed border-sidebar-border px-3 py-2 text-xs text-muted-foreground">
          Agents, models and tools are <strong>simulated</strong>: no model provider is called.
        </p>
        {#if principal.current}
          <div class="flex items-center gap-3 rounded-lg border border-sidebar-border bg-surface p-3">
            <Avatar name={principal.current.persona.name} size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
              <p class="truncate text-xs text-muted-foreground">{principal.current.persona.title ?? ''}</p>
            </div>
            <Badge variant="secondary">{ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}</Badge>
          </div>
        {/if}
      </div>
    </div>
  {/snippet}

  <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</AppShell>
