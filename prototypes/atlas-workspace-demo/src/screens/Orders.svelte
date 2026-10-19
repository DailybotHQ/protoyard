<script lang="ts">
import { Plus, SearchX, ShoppingCart } from '@lucide/svelte';
import { can, Link, liveQuery, useClock } from '@protoyard/renderer-svelte';
import {
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  Select,
} from '@protoyard/ui';
import OrderDialog from '../components/OrderDialog.svelte';
import OrderStatusMenu from '../components/OrderStatusMenu.svelte';
import PageHeader from '../components/PageHeader.svelte';
import { ORDER_STATUSES, type Order } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { ORDER_STATUS_LABELS } from '../domain/services.ts';
import { useDashboard } from '../lib/context.ts';
import { fromNow, money, plural } from '../lib/format.ts';

type Row = Order & { customerName: string };

const { db, settings } = useDashboard();
const clock = useClock();
const rows = liveQuery(
  async (): Promise<Row[]> => {
    const [orders, customers] = await Promise.all([db.orders.toArray(), db.customers.toArray()]);
    const names = new Map(customers.map((c) => [c.id, c.name]));
    return orders.map((o) => ({ ...o, customerName: names.get(o.customerId) ?? 'Unknown' }));
  },
  { initial: [] }
);
const customerCount = liveQuery(() => db.customers.count(), { initial: 0 });

let status = $state('all');
let createOpen = $state(false);
const currency = $derived(settings.current?.currency ?? 'USD');
const filtered = $derived(
  (rows.current ?? []).filter((o) => status === 'all' || o.status === status)
);
const total = $derived(filtered.reduce((s, o) => s + o.amountCents, 0));

const columns: DataTableColumn<Row>[] = [
  { key: 'reference', header: 'Order', sortable: true, cell: referenceCell },
  { key: 'customerName', header: 'Customer', sortable: true, cell: customerCell },
  { key: 'description', header: 'Description', hideBelow: 'lg' },
  { key: 'amountCents', header: 'Amount', sortable: true, align: 'right', cell: amountCell },
  { key: 'status', header: 'Status', sortable: true, cell: statusCell },
  { key: 'createdAt', header: 'Created', sortable: true, hideBelow: 'md', cell: createdCell },
];
</script>

{#snippet referenceCell(o: Row)}<span class="font-medium tabular-nums">{o.reference}</span>{/snippet}
{#snippet customerCell(o: Row)}
  <Link href={`/customers/${o.customerId}`} class="font-medium text-primary hover:underline">{o.customerName}</Link>
{/snippet}
{#snippet amountCell(o: Row)}<span class="tabular-nums">{money(o.amountCents, currency)}</span>{/snippet}
{#snippet statusCell(o: Row)}<OrderStatusMenu order={o} />{/snippet}
{#snippet createdCell(o: Row)}
  <time class="text-muted-foreground" datetime={o.createdAt}>{fromNow(o.createdAt, clock.now)}</time>
{/snippet}

<PageHeader
  title="Orders"
  description={`${plural(filtered.length, 'order')} · ${money(total, currency)}${status === 'all' ? '' : ` ${ORDER_STATUS_LABELS[status as Order['status']].toLowerCase()}`}`}
>
  {#snippet actions()}
    {#if can(CAPABILITIES.ordersCreate)}
      <Button onclick={() => (createOpen = true)} disabled={!customerCount.loading && customerCount.current === 0}>
        <Plus class="size-4" aria-hidden="true" />New order
      </Button>
    {/if}
  {/snippet}
</PageHeader>

{#if rows.error}
  <ErrorState title="Could not load orders" message={String(rows.error)} />
{:else}
  <DataTable
    {columns}
    rows={filtered}
    getRowId={(o) => o.id}
    searchKeys={['reference', 'customerName', 'description']}
    searchPlaceholder="Search order, customer, description…"
    pageSize={15}
    loading={rows.loading}
    sort={{ key: 'createdAt', direction: 'desc' }}
    caption="Orders"
  >
    {#snippet empty({ query })}
      <EmptyState
        size="sm"
        icon={query || status !== 'all' ? SearchX : ShoppingCart}
        title={query ? `No orders match “${query.trim()}”` : status === 'all' ? 'No orders yet' : 'No orders with this status'}
        description={customerCount.current === 0
          ? 'Orders belong to customers. Add a customer first.'
          : query || status !== 'all'
            ? 'Try another search or status.'
            : 'Create an order from here or from a customer page.'}
      />
    {/snippet}
    {#snippet filters()}
      <Select
        aria-label="Filter by status"
        class="w-full sm:w-44"
        items={[{ value: 'all', label: 'All statuses' }, ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))]}
        bind:value={status}
      />
    {/snippet}
  </DataTable>
{/if}

<OrderDialog bind:open={createOpen} />
