<script lang="ts">
import { Package, UserRound } from '@lucide/svelte';
import { avatarImage, can, liveQuery, navigate, usePrincipal } from '@protoyard/renderer-svelte';
import {
  Avatar,
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  Select,
} from '@protoyard/ui';
import OrderStatusBadge from '../components/OrderStatusBadge.svelte';
import PageHeader from '../components/PageHeader.svelte';
import { ORDER_STATUSES, type Order } from '../database/schema.ts';
import { ORDER_STATUS_LABELS } from '../domain/catalog.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useShop } from '../lib/context.ts';
import { formatDate, money } from '../lib/format.ts';

type Row = Order & { customerName: string; customerAvatar?: string };

const { db } = useShop();
const principal = usePrincipal();
const me = $derived(principal.current?.persona.id ?? '');
const staff = $derived(can(CAPABILITIES.ordersManage));

let scope = $state('mine');
let status = $state('');

const rows = liveQuery(
  async (): Promise<Row[]> => {
    const [orders, people] = await Promise.all([
      scope === 'all' && staff
        ? db.orders.toArray()
        : db.orders.where('customerId').equals(me).toArray(),
      db.table('py_personas').toArray() as Promise<{ id: string; name: string; avatar?: string }[]>,
    ]);
    const byId = new Map(people.map((p) => [p.id, p]));
    return orders.map((o) => ({
      ...o,
      customerName: byId.get(o.customerId)?.name ?? 'Unknown customer',
      customerAvatar: byId.get(o.customerId)?.avatar,
    }));
  },
  { initial: [], deps: () => [me, scope, staff] }
);
const filtered = $derived((rows.current ?? []).filter((o) => !status || o.status === status));

const columns: DataTableColumn<Row>[] = $derived([
  { key: 'number', header: 'Order', sortable: true, cell: numberCell },
  {
    key: 'placedAt',
    header: 'Placed',
    sortable: true,
    accessor: (o) => o.placedAt,
    cell: dateCell,
  },
  ...(scope === 'all'
    ? [
        {
          key: 'customerName',
          header: 'Customer',
          sortable: true,
          hideBelow: 'md' as const,
          cell: customerCell,
        },
      ]
    : []),
  { key: 'itemCount', header: 'Items', align: 'right' as const, hideBelow: 'sm' as const },
  { key: 'totalCents', header: 'Total', sortable: true, align: 'right' as const, cell: totalCell },
  { key: 'status', header: 'Status', sortable: true, cell: statusCell },
]);
</script>

{#snippet numberCell(order: Row)}<span class="font-mono font-medium">{order.number}</span>{/snippet}
{#snippet customerCell(order: Row)}
  <span class="flex items-center gap-2">
    <Avatar name={order.customerName} {...avatarImage(order.customerAvatar)} size="xs" decorative />
    {order.customerName}
  </span>
{/snippet}
{#snippet dateCell(order: Row)}{formatDate(order.placedAt)}{/snippet}
{#snippet totalCell(order: Row)}<span class="tabular-nums">{money(order.totalCents)}</span>{/snippet}
{#snippet statusCell(order: Row)}<OrderStatusBadge status={order.status} />{/snippet}

<PageHeader title={scope === 'all' ? 'All orders' : 'Your orders'} description={`${filtered.length} order${filtered.length === 1 ? '' : 's'}`} />

{#if !can(CAPABILITIES.ordersReadOwn)}
  <EmptyState icon={UserRound} title="Sign in to see orders" description="Guests have no order history. Switch to the customer persona in DevTools." />
{:else if rows.error}
  <ErrorState title="Could not load orders" message={String(rows.error)} />
{:else if !rows.loading && (rows.current?.length ?? 0) === 0 && scope === 'mine'}
  <EmptyState icon={Package} title="No orders yet" description="Orders you place show up here with their status.">
    {#snippet action()}
      <div class="flex flex-wrap justify-center gap-2">
        <Button href="#/">Start shopping</Button>
        {#if staff}<Button variant="outline" onclick={() => (scope = 'all')}>View all customers' orders</Button>{/if}
      </div>
    {/snippet}
  </EmptyState>
{:else}
  <DataTable
    {columns}
    rows={filtered}
    getRowId={(o) => o.id}
    searchKeys={['number', 'customerName']}
    searchPlaceholder="Search by order number…"
    pageSize={10}
    loading={rows.loading}
    onRowClick={(o) => navigate(`/orders/${o.id}`)}
    rowLabel={(o) => `Open order ${o.number}`}
    emptyTitle="No orders match"
    emptyDescription="Try another status."
    sort={{ key: 'placedAt', direction: 'desc' }}
    caption="Orders"
  >
    {#snippet filters()}
      {#if staff}
        <Select aria-label="Whose orders" class="w-44" items={[{ value: 'mine', label: 'My orders' }, { value: 'all', label: 'All customers' }]} bind:value={scope} />
      {/if}
      <Select
        aria-label="Filter by status"
        class="w-40"
        items={[{ value: '', label: 'Any status' }, ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))]}
        bind:value={status}
      />
    {/snippet}
  </DataTable>
{/if}
