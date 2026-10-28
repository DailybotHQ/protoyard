<script lang="ts">
import { SearchX, UserPlus, Users } from '@lucide/svelte';
import { avatarImage, can, liveQuery, navigate, useClock } from '@protoyard/renderer-svelte';
import {
  Avatar,
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  Select,
} from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import CustomerDialog from '../components/CustomerDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import { CUSTOMER_STATUSES, type Customer, PLANS } from '../database/schema.ts';
import { customerTotals } from '../domain/metrics.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useDashboard } from '../lib/context.ts';
import { fromNow, money, plural } from '../lib/format.ts';

type Row = Customer & { orders: number; value: number };

const { db, settings } = useDashboard();
const clock = useClock();
const rows = liveQuery(
  async (): Promise<Row[]> => {
    const [customers, orders] = await Promise.all([db.customers.toArray(), db.orders.toArray()]);
    const totals = customerTotals(orders);
    return customers.map((c) => ({ ...c, ...(totals.get(c.id) ?? { orders: 0, value: 0 }) }));
  },
  { initial: [] }
);

let status = $state('all');
let plan = $state('all');
let createOpen = $state(false);
const currency = $derived(settings.current?.currency ?? 'USD');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const filtered = $derived(
  (rows.current ?? []).filter(
    (c) => (status === 'all' || c.status === status) && (plan === 'all' || c.plan === plan)
  )
);
const filtering = $derived(status !== 'all' || plan !== 'all');

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Customer', sortable: true, cell: nameCell },
  { key: 'company', header: 'Company', sortable: true, hideBelow: 'md' },
  {
    key: 'plan',
    header: 'Plan',
    sortable: true,
    hideBelow: 'lg',
    accessor: (c) => capitalize(c.plan),
  },
  { key: 'status', header: 'Status', sortable: true, cell: statusCell },
  { key: 'orders', header: 'Orders', sortable: true, align: 'right', hideBelow: 'sm' },
  { key: 'value', header: 'Lifetime value', sortable: true, align: 'right', cell: valueCell },
  { key: 'createdAt', header: 'Added', sortable: true, hideBelow: 'lg', cell: addedCell },
];
</script>

{#snippet nameCell(c: Row)}
  <span class="flex items-center gap-3">
    <Avatar name={c.name} {...avatarImage(c.avatar)} size="sm" decorative />
    <span class="min-w-0">
      <span class="block truncate font-medium">{c.name}</span>
      <span class="block truncate text-xs text-muted-foreground">{c.email}</span>
    </span>
  </span>
{/snippet}
{#snippet statusCell(c: Row)}<StatusBadge status={c.status} />{/snippet}
{#snippet valueCell(c: Row)}<span class="tabular-nums">{money(c.value, currency)}</span>{/snippet}
{#snippet addedCell(c: Row)}
  <time class="text-muted-foreground" datetime={c.createdAt}>{fromNow(c.createdAt, clock.now)}</time>
{/snippet}

<PageHeader
  title="Customers"
  description={filtering
    ? `${plural(filtered.length, 'customer')} match the filters · ${(rows.current ?? []).length} total`
    : plural((rows.current ?? []).length, 'customer')}
>
  {#snippet actions()}
    {#if can(CAPABILITIES.customersCreate)}
      <Button onclick={() => (createOpen = true)}><LucideIcon icon={UserPlus} class="size-4" />New customer</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if rows.error}
  <ErrorState title="Could not load customers" message={String(rows.error)} />
{:else}
  <DataTable
    {columns}
    rows={filtered}
    getRowId={(c) => c.id}
    searchKeys={['name', 'email', 'company', 'country']}
    searchPlaceholder="Search name, email, company…"
    pageSize={12}
    loading={rows.loading}
    onRowClick={(c) => navigate(`/customers/${c.id}`)}
    rowLabel={(c) => `Open ${c.name}`}
    sort={{ key: 'createdAt', direction: 'desc' }}
    caption="Customers"
  >
    {#snippet empty({ query })}
      <EmptyState
        size="sm"
        icon={query || filtering ? SearchX : Users}
        title={query ? `No customers match “${query.trim()}”` : filtering ? 'No customers match these filters' : 'No customers yet'}
        description={query || filtering
          ? 'Try another search, status or plan.'
          : can(CAPABILITIES.customersCreate)
            ? 'Use “New customer” to add the first one.'
            : 'Customers added by your team will appear here.'}
      />
    {/snippet}
    {#snippet filters()}
      <Select
        aria-label="Filter by status"
        class="w-full sm:w-40"
        items={[{ value: 'all', label: 'All statuses' }, ...CUSTOMER_STATUSES.map((s) => ({ value: s, label: capitalize(s) }))]}
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

<CustomerDialog bind:open={createOpen} />
