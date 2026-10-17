<script lang="ts">
import {
  ChartColumn,
  DollarSign,
  FolderKanban,
  House,
  Settings,
  TrendingUp,
  Users,
} from '@lucide/svelte';
import {
  AppShell,
  Avatar,
  Badge,
  type BadgeVariant,
  Button,
  CardGrid,
  DataTable,
  type DataTableColumn,
  DetailPanel,
  Dialog,
  EmptyState,
  FormField,
  Header,
  Input,
  Select,
  Sidebar,
  type SidebarSection,
  StatCard,
  toast,
} from '@protoyard/ui';
import { interceptDemoNav } from './nav.ts';

interface Deal {
  id: string;
  company: string;
  owner: string;
  stage: 'Lead' | 'Proposal' | 'Won' | 'Lost';
  value: number;
}

const COMPANIES = [
  'Northwind',
  'Contoso',
  'Fabrikam',
  'Globex',
  'Initech',
  'Umbrella',
  'Hooli',
  'Vandelay',
  'Stark Labs',
  'Wayne Tools',
  'Acme Rail',
  'Soylent',
];
const OWNERS = ['Ana Lee', 'Omar Diaz', 'Kai Moreno'];
const STAGES: Deal['stage'][] = ['Lead', 'Proposal', 'Won', 'Proposal', 'Lead', 'Lost'];
let deals = $state<Deal[]>(
  COMPANIES.map((company, index) => ({
    id: `d-${index + 1}`,
    company,
    owner: OWNERS[index % OWNERS.length] ?? 'Ana Lee',
    stage: STAGES[index % STAGES.length] ?? 'Lead',
    value: ((index * 7919) % 45) * 1000 + 5000,
  }))
);

const stageTone: Record<Deal['stage'], BadgeVariant> = {
  Lead: 'secondary',
  Proposal: 'info',
  Won: 'success',
  Lost: 'destructive',
};

let current = $state('#demo/dash/overview');
let sidebarOpen = $state(false);
let selectedId = $state<string | null>(null);
let panelOpen = $state(false);
let newOpen = $state(false);
let newCompany = $state('');
let newValue = $state('');
let newTouched = $state(false);

const selected = $derived(deals.find((deal) => deal.id === selectedId));
const pipeline = $derived(
  deals
    .filter((d) => d.stage === 'Lead' || d.stage === 'Proposal')
    .reduce((sum, d) => sum + d.value, 0)
);
const won = $derived(deals.filter((d) => d.stage === 'Won'));
const winRate = $derived(
  Math.round(
    (won.length /
      Math.max(1, deals.filter((d) => d.stage === 'Won' || d.stage === 'Lost').length)) *
      100
  )
);
const money = (value: number): string => `$${value.toLocaleString('en-US')}`;
const newErrors = $derived({
  company: newCompany.trim() ? undefined : 'Company is required.',
  value: Number(newValue) > 0 ? undefined : 'Enter a positive amount.',
});

const nav = [
  { label: 'Overview', href: '#demo/dash/overview', icon: House },
  { label: 'Deals', href: '#demo/dash/deals', icon: FolderKanban, badge: 12 },
  { label: 'Reports', href: '#demo/dash/reports', icon: ChartColumn },
  { label: 'Team', href: '#demo/dash/team', icon: Users },
  { label: 'Settings', href: '#demo/dash/settings', icon: Settings },
];
const sections: SidebarSection[] = $derived([
  { items: nav.map((item) => ({ ...item, active: item.href === current })) },
]);
const pageTitle = $derived(nav.find((item) => item.href === current)?.label ?? 'Overview');
const showsDeals = $derived(current === '#demo/dash/overview' || current === '#demo/dash/deals');

const columns: DataTableColumn<Deal>[] = [
  { key: 'company', header: 'Company', sortable: true },
  { key: 'owner', header: 'Owner', sortable: true, hideBelow: 'md' },
  { key: 'stage', header: 'Stage', sortable: true, cell: stageCell },
  { key: 'value', header: 'Value', sortable: true, align: 'right', cell: valueCell },
];

function createDeal(event: SubmitEvent): void {
  event.preventDefault();
  newTouched = true;
  if (newErrors.company || newErrors.value) return;
  deals.unshift({
    id: `d-${deals.length + 1}`,
    company: newCompany.trim(),
    owner: 'Jordan Example',
    stage: 'Lead',
    value: Math.round(Number(newValue)),
  });
  toast.success('Deal created', {
    description: `${newCompany.trim()} · ${money(Number(newValue))}`,
  });
  newOpen = false;
}
</script>

{#snippet stageCell(deal: Deal)}<Badge variant={stageTone[deal.stage]}>{deal.stage}</Badge>{/snippet}
{#snippet valueCell(deal: Deal)}<span class="tabular-nums">{money(deal.value)}</span>{/snippet}

<div class="relative h-[560px] overflow-hidden rounded-xl border border-border">
  <AppShell
    bind:sidebarOpen
    mainId="pattern-dashboard-main"
    sidebarLabel="Dashboard navigation"
    class="h-full min-h-0 [&>div:first-of-type]:h-full"
    mainClass="overflow-y-auto"
  >
    {#snippet sidebar()}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="flex h-full w-full" onclick={(event) => interceptDemoNav(event, (href) => (current = href))}>
        <Sidebar {sections} label="Dashboard">
          {#snippet header({ collapsed })}
            <span class="flex items-center gap-2 font-heading font-semibold">
              <span class="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden="true">
                <TrendingUp class="size-4" />
              </span>
              {#if !collapsed}Pipeline{/if}
            </span>
          {/snippet}
          {#snippet footer({ collapsed })}
            <div class="flex items-center gap-2 px-2 py-1 text-sm">
              <Avatar name="Jordan Example" size="sm" decorative />
              {#if !collapsed}<span class="truncate">Jordan Example</span>{/if}
            </div>
          {/snippet}
        </Sidebar>
      </div>
    {/snippet}
    {#snippet header()}
      <Header title={pageTitle} description="Q3 · Sales team">
        {#snippet actions()}
          <Dialog
            bind:open={newOpen}
            title="New deal"
            size="sm"
            onOpenChange={(open) => {
              if (open) {
                newCompany = '';
                newValue = '';
                newTouched = false;
              }
            }}
          >
            {#snippet trigger({ props })}<Button {...props} size="sm">New deal</Button>{/snippet}
            <form id="pattern-dashboard-new" class="grid gap-3 py-1" novalidate onsubmit={createDeal}>
              <FormField label="Company" required error={newTouched ? newErrors.company : undefined}>
                {#snippet children({ props })}<Input {...props} bind:value={newCompany} />{/snippet}
              </FormField>
              <FormField label="Value (USD)" required error={newTouched ? newErrors.value : undefined}>
                {#snippet children({ props })}
                  <Input {...props} type="number" min="1" inputmode="numeric" bind:value={newValue} />
                {/snippet}
              </FormField>
            </form>
            {#snippet footer()}
              <Button variant="outline" onclick={() => (newOpen = false)}>Cancel</Button>
              <Button type="submit" form="pattern-dashboard-new">Create</Button>
            {/snippet}
          </Dialog>
        {/snippet}
      </Header>
    {/snippet}

    <div class="grid gap-5 p-4 sm:p-6">
      {#if showsDeals}
        {#if current === '#demo/dash/overview'}
          <CardGrid minItemWidth="11rem">
            <StatCard label="Open pipeline" value={money(pipeline)} delta="+6%" trend="up" icon={DollarSign} />
            <StatCard label="Deals won" value={won.length} delta={2} icon={TrendingUp} hint="this quarter" />
            <StatCard label="Win rate" value={`${winRate}%`} delta="-3%" trend="down" />
          </CardGrid>
        {/if}
        <DataTable
          {columns}
          rows={deals}
          getRowId={(deal) => deal.id}
          searchKeys={['company', 'owner']}
          pageSize={5}
          caption="Deals"
          onRowClick={(deal) => {
            selectedId = deal.id;
            panelOpen = true;
          }}
          rowLabel={(deal) => `Open ${deal.company}`}
        />
      {:else}
        <EmptyState title={`${pageTitle} is empty in this demo`} description="Overview and Deals have live data.">
          {#snippet action()}
            <Button variant="outline" onclick={() => (current = '#demo/dash/overview')}>Back to overview</Button>
          {/snippet}
        </EmptyState>
      {/if}
    </div>
  </AppShell>
</div>

<DetailPanel
  bind:open={panelOpen}
  title={selected?.company ?? 'Deal'}
  description={selected ? `${money(selected.value)} · owned by ${selected.owner}` : undefined}
>
  {#if selected}
    {@const deal = selected}
    <div class="grid gap-1.5">
      <label for="pattern-dashboard-stage" class="text-sm font-medium">Stage</label>
      <Select
        id="pattern-dashboard-stage"
        bind:value={() => deal.stage, (value) => (deal.stage = value as Deal['stage'])}
        items={(['Lead', 'Proposal', 'Won', 'Lost'] as const).map((stage) => ({ value: stage, label: stage }))}
      />
      <p class="text-xs text-muted-foreground">Changes update the table and stats immediately.</p>
    </div>
  {/if}
  {#snippet footer()}
    <Button onclick={() => (panelOpen = false)}>Done</Button>
  {/snippet}
</DetailPanel>
