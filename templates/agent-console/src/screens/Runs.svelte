<script lang="ts">
import { History } from '@lucide/svelte';
import { getRuntime, liveQuery, navigate, useClock } from '@protoyard/renderer-svelte';
import { DataTable, type DataTableColumn, EmptyState, Select } from '@protoyard/ui';
import { Text } from 'texuli/typography';
import PageHeader from '../components/PageHeader.svelte';
import RunStatusBadge from '../components/RunStatusBadge.svelte';
import type { ConsoleDatabase, Run } from '../database/schema.ts';
import { formatCost } from '../domain/agents.ts';
import { timeAgo } from '../lib/format.ts';

const runtime = getRuntime<ConsoleDatabase>();
const clock = useClock();
const runs = liveQuery(() => runtime.db.runs.orderBy('createdAt').reverse().toArray(), {
  initial: [],
});
const agents = liveQuery(() => runtime.db.agents.toArray(), { initial: [] });

let agentFilter = $state('all');
let statusFilter = $state('all');
let sourceFilter = $state('all');
let search = $state('');

const agentName = (id: string) =>
  (agents.current ?? []).find((a) => a.id === id)?.name ?? 'Deleted agent';
const filtered = $derived(
  (runs.current ?? []).filter(
    (r) =>
      (agentFilter === 'all' || r.agentId === agentFilter) &&
      (statusFilter === 'all' || r.status === statusFilter) &&
      (sourceFilter === 'all' || r.source === sourceFilter)
  )
);
const failedSteps = (run: Run) => run.toolResults.filter((t) => t.status !== 'succeeded').length;

const columns: DataTableColumn<Run>[] = [
  { key: 'prompt', header: 'Prompt', cell: promptCell, sortable: true },
  {
    key: 'agent',
    header: 'Agent',
    accessor: (r) => agentName(r.agentId),
    sortable: true,
    hideBelow: 'md',
  },
  { key: 'status', header: 'Status', cell: statusCell, sortable: true },
  {
    key: 'tools',
    header: 'Tool calls',
    accessor: (r) => r.toolResults.length,
    align: 'right',
    hideBelow: 'lg',
  },
  {
    key: 'cost',
    header: 'Est. cost',
    accessor: (r) => r.costMicros,
    cell: costCell,
    align: 'right',
    sortable: true,
    hideBelow: 'md',
  },
  {
    key: 'createdAt',
    header: 'When',
    accessor: (r) => r.createdAt,
    cell: whenCell,
    sortable: true,
  },
];
</script>

{#snippet promptCell(run: Run)}
  <Text as="span" size="sm" weight="medium" lineClamp={1}>{run.prompt}</Text>
  {#if run.source === 'evaluation'}<Text as="span" size="xs" tone="muted">evaluation run</Text>{/if}
{/snippet}
{#snippet statusCell(run: Run)}
  <span class="inline-flex items-center gap-1.5"><RunStatusBadge status={run.status} />{#if failedSteps(run)}<Text as="span" size="xs" tone="destructive">{failedSteps(run)} not run</Text>{/if}</span>
{/snippet}
{#snippet costCell(run: Run)}{formatCost(run.costMicros)}{/snippet}
{#snippet whenCell(run: Run)}<Text as="span" size="sm" tone="muted">{timeAgo(run.createdAt, clock.now)}</Text>{/snippet}

<PageHeader title="Runs" description="Every playground and evaluation run with its full step trace." />

{#if !runs.loading && (runs.current?.length ?? 0) === 0}
  <EmptyState icon={History} title="No runs yet" description="Run an agent from its playground and the trace shows up here." />
{:else}
  <DataTable
    {columns}
    rows={filtered}
    getRowId={(r) => r.id}
    loading={runs.loading}
    bind:search
    searchKeys={['prompt', 'agent']}
    searchPlaceholder="Search prompts"
    sort={{ key: 'createdAt', direction: 'desc' }}
    onRowClick={(r) => navigate(`/runs/${r.id}`)}
    rowLabel={(r) => `Open trace for ${r.prompt}`}
    caption="Agent runs"
    emptyTitle="No runs match these filters"
  >
    {#snippet filters()}
      <Select aria-label="Agent" class="w-44" items={[{ value: 'all', label: 'All agents' }, ...(agents.current ?? []).map((a) => ({ value: a.id, label: a.name }))]} bind:value={agentFilter} />
      <Select aria-label="Status" class="w-36" items={[{ value: 'all', label: 'Any status' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'failed', label: 'Failed' }]} bind:value={statusFilter} />
      <Select aria-label="Source" class="w-36" items={[{ value: 'all', label: 'All sources' }, { value: 'playground', label: 'Playground' }, { value: 'evaluation', label: 'Evaluations' }]} bind:value={sourceFilter} />
    {/snippet}
  </DataTable>
{/if}
