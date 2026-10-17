<script lang="ts">
import { Plus } from '@lucide/svelte';
import { can, liveQuery, navigate, useClock } from '@protoyard/renderer-svelte';
import { Avatar, Button, DataTable, type DataTableColumn, Select } from '@protoyard/ui';
import DealDialog from '../components/DealDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import StageBadge from '../components/StageBadge.svelte';
import { DEAL_STAGES, type Deal } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { STAGE_LABELS } from '../domain/services.ts';
import { useCrm } from '../lib/context.ts';
import { formatDate, fromNow, money } from '../lib/format.ts';

type Row = Deal & { companyName: string; ownerName: string };

const { db, services } = useCrm();
const clock = useClock();

const rows = liveQuery(
  async (): Promise<Row[]> => {
    const [deals, companies, people] = await Promise.all([
      db.deals.toArray(),
      db.companies.toArray(),
      db.table('py_personas').toArray(),
    ]);
    const companyName = new Map(companies.map((c) => [c.id, c.name]));
    const personName = new Map(people.map((p) => [p.id as string, p.name as string]));
    return deals.map((d) => ({
      ...d,
      companyName: companyName.get(d.companyId) ?? '—',
      ownerName: personName.get(d.ownerId) ?? 'Unknown',
    }));
  },
  { initial: [] }
);

let stage = $state('open');
let owner = $state('all');
let createOpen = $state(false);

const filtered = $derived(
  (rows.current ?? []).filter(
    (d) =>
      (stage === 'all' ||
        (stage === 'open' ? d.stage !== 'won' && d.stage !== 'lost' : d.stage === stage)) &&
      (owner === 'all' || d.ownerId === owner)
  )
);
const owners = $derived(
  [...new Map((rows.current ?? []).map((d) => [d.ownerId, d.ownerName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }))
);

const columns: DataTableColumn<Row>[] = [
  { key: 'title', header: 'Deal', sortable: true, cell: titleCell },
  {
    key: 'stage',
    header: 'Stage',
    sortable: true,
    cell: stageCell,
    accessor: (d) => DEAL_STAGES.indexOf(d.stage),
  },
  { key: 'amount', header: 'Amount', sortable: true, align: 'right', cell: amountCell },
  { key: 'ownerName', header: 'Owner', sortable: true, cell: ownerCell, hideBelow: 'md' },
  { key: 'closeDate', header: 'Close date', sortable: true, cell: closeCell, hideBelow: 'lg' },
];
</script>

{#snippet titleCell(deal: Row)}
  <span class="block font-medium">{deal.title}</span>
  <span class="block text-xs text-muted-foreground">{deal.companyName}</span>
{/snippet}
{#snippet stageCell(deal: Row)}<StageBadge stage={deal.stage} />{/snippet}
{#snippet amountCell(deal: Row)}<span class="tabular-nums">{money(deal.amount)}</span>{/snippet}
{#snippet ownerCell(deal: Row)}
  <span class="flex items-center gap-2"><Avatar name={deal.ownerName} size="xs" decorative /> {deal.ownerName}</span>
{/snippet}
{#snippet closeCell(deal: Row)}
  <span title={formatDate(deal.closeDate)}>{fromNow(deal.closeDate, clock.now)}</span>
{/snippet}

<PageHeader title="Deals" description={`${filtered.length} of ${(rows.current ?? []).length} deals`}>
  {#snippet actions()}
    {#if can(CAPABILITIES.dealsCreate)}
      <Button onclick={() => (createOpen = true)} disabled={services.isPaywalled()}><Plus class="size-4" /> New deal</Button>
    {/if}
  {/snippet}
</PageHeader>

<DataTable
  {columns}
  rows={filtered}
  getRowId={(d) => d.id}
  searchKeys={['title', 'companyName', 'ownerName']}
  searchPlaceholder="Search deals or companies…"
  pageSize={15}
  loading={rows.loading}
  onRowClick={(d) => navigate(`/deals/${d.id}`)}
  rowLabel={(d) => `Open ${d.title}`}
  emptyTitle="No deals match"
  emptyDescription="Try another stage or owner filter."
  sort={{ key: 'amount', direction: 'desc' }}
  caption="Deals"
>
  {#snippet filters()}
    <Select
      aria-label="Filter by stage"
      class="w-40"
      items={[
        { value: 'open', label: 'Open deals' },
        { value: 'all', label: 'All stages' },
        ...DEAL_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
      ]}
      bind:value={stage}
    />
    <Select
      aria-label="Filter by owner"
      class="w-44"
      items={[{ value: 'all', label: 'All owners' }, ...owners]}
      bind:value={owner}
    />
  {/snippet}
</DataTable>

<DealDialog bind:open={createOpen} />
