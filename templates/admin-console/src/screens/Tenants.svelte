<script lang="ts">
import { Building2, SearchX } from '@lucide/svelte';
import { liveQuery, navigate } from '@protoyard/renderer-svelte';
import { DataTable, type DataTableColumn, EmptyState, ErrorState, Select } from '@protoyard/ui';
import { Text } from 'texuli/typography';
import PageHeader from '../components/PageHeader.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import { PLANS, TENANT_STATUSES } from '../database/schema.ts';
import { useAdmin } from '../lib/context.ts';
import { formatDate, plural, usd } from '../lib/format.ts';
import { type TenantRow, tenantRows } from '../lib/queries.ts';

const { db } = useAdmin();
const rows = liveQuery(() => tenantRows(db), { initial: [] });

let status = $state('all');
let plan = $state('all');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const filtered = $derived(
  (rows.current ?? []).filter(
    (t) => (status === 'all' || t.status === status) && (plan === 'all' || t.plan === plan)
  )
);
const filtering = $derived(status !== 'all' || plan !== 'all');

const columns: DataTableColumn<TenantRow>[] = [
  { key: 'name', header: 'Tenant', sortable: true, cell: nameCell },
  { key: 'status', header: 'Status', sortable: true, cell: statusCell },
  {
    key: 'plan',
    header: 'Plan',
    sortable: true,
    hideBelow: 'md',
    accessor: (t) => capitalize(t.plan),
  },
  { key: 'people', header: 'People', sortable: true, align: 'right', hideBelow: 'sm' },
  { key: 'mrrCents', header: 'MRR', sortable: true, align: 'right', cell: mrrCell },
  { key: 'region', header: 'Region', sortable: true, hideBelow: 'lg' },
  {
    key: 'createdAt',
    header: 'Customer since',
    sortable: true,
    hideBelow: 'lg',
    accessor: (t) => formatDate(t.createdAt),
  },
];
</script>

{#snippet nameCell(t: TenantRow)}
  <span class="min-w-0">
    <Text as="span" size="sm" weight="medium" truncate class="block">{t.name}</Text>
    <Text as="span" size="xs" tone="muted" truncate class="block">{t.domain}</Text>
  </span>
{/snippet}
{#snippet statusCell(t: TenantRow)}<StatusBadge status={t.status} />{/snippet}
{#snippet mrrCell(t: TenantRow)}<Text as="span" size="sm" tabular>{usd(t.mrrCents)}</Text>{/snippet}

<PageHeader
  title="Tenants"
  description={filtering
    ? `${plural(filtered.length, 'tenant')} match the filters · ${(rows.current ?? []).length} total`
    : plural((rows.current ?? []).length, 'tenant')}
/>

{#if rows.error}
  <ErrorState title="Could not load tenants" message={String(rows.error)} />
{:else}
  <DataTable
    {columns}
    rows={filtered}
    getRowId={(t) => t.id}
    searchKeys={['name', 'domain', 'region']}
    searchPlaceholder="Search name, domain, region…"
    pageSize={12}
    loading={rows.loading}
    onRowClick={(t) => navigate(`/tenants/${t.id}`)}
    rowLabel={(t) => `Open ${t.name}`}
    sort={{ key: 'createdAt', direction: 'desc' }}
    caption="Tenants"
  >
    {#snippet empty({ query })}
      <EmptyState
        size="sm"
        icon={query || filtering ? SearchX : Building2}
        title={query ? `No tenants match “${query.trim()}”` : filtering ? 'No tenants match these filters' : 'No tenants yet'}
        description={query || filtering ? 'Try another search, status or plan.' : 'Tenants appear here as customers sign up.'}
      />
    {/snippet}
    {#snippet filters()}
      <Select
        aria-label="Filter by status"
        class="w-full sm:w-40"
        items={[{ value: 'all', label: 'All statuses' }, ...TENANT_STATUSES.map((s) => ({ value: s, label: capitalize(s) }))]}
        bind:value={status}
      />
      <Select
        aria-label="Filter by plan"
        class="w-full sm:w-40"
        items={[{ value: 'all', label: 'All plans' }, ...PLANS.map((p) => ({ value: p, label: capitalize(p) }))]}
        bind:value={plan}
      />
    {/snippet}
  </DataTable>
{/if}
