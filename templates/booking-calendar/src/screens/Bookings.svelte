<script lang="ts">
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Button, DataTable, type DataTableColumn } from '@protoyard/ui';
import BookingDetails from '../components/BookingDetails.svelte';
import PageHeader from '../components/PageHeader.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import type { Booking } from '../database/schema.ts';
import { useBooking } from '../lib/context.ts';
import { formatSpan, fromNow } from '../lib/format.ts';

const { db } = useBooking();
const clock = useClock();
const FILTERS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'cancelled', label: 'Cancelled' },
] as const;
let filter = $state<(typeof FILTERS)[number]['id']>('upcoming');

const data = liveQuery(
  async () => {
    const [bookings, resources] = await Promise.all([
      db.bookings.orderBy('start').toArray(),
      db.resources.toArray(),
    ]);
    return { bookings, names: new Map(resources.map((r) => [r.id, r.name])), resources };
  },
  { initial: undefined }
);
const rows = $derived.by(() => {
  const all = data.current?.bookings ?? [];
  const now = clock.now.getTime();
  if (filter === 'cancelled') return all.filter((b) => b.status === 'cancelled');
  if (filter === 'past')
    return all.filter((b) => b.status !== 'cancelled' && Date.parse(b.end) <= now).reverse();
  return all.filter((b) => b.status === 'confirmed' && Date.parse(b.end) > now);
});
let selected = $state<Booking | null>(null);
let open = $state(false);

const columns: DataTableColumn<Booking>[] = [
  { key: 'title', header: 'Booking', accessor: (b) => b.title, sortable: true },
  { key: 'when', header: 'When (UTC)', accessor: (b) => b.start, cell: whenCell, sortable: true },
  {
    key: 'resource',
    header: 'Resource',
    accessor: (b) => data.current?.names.get(b.resourceId) ?? b.resourceId,
    sortable: true,
    hideBelow: 'sm',
  },
  { key: 'customer', header: 'Customer', accessor: (b) => b.customerName, hideBelow: 'md' },
  { key: 'status', header: 'Status', accessor: (b) => b.status, cell: statusCell, sortable: true },
];
</script>

{#snippet whenCell(b: Booking)}
  <span class="tabular-nums">{formatSpan(b.start, b.end)}</span>
  <span class="block text-xs text-muted-foreground">{fromNow(b.start, clock.now)}</span>
{/snippet}
{#snippet statusCell(b: Booking)}<StatusBadge status={b.status} />{/snippet}

<PageHeader title="Bookings" description="Every booking. Ended bookings become completed or no-show as simulated time advances." />

<div class="mb-4 inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Show">
  {#each FILTERS as f (f.id)}
    <Button size="sm" variant={filter === f.id ? 'secondary' : 'ghost'} aria-pressed={filter === f.id} onclick={() => (filter = f.id)}>{f.label}</Button>
  {/each}
</div>

<DataTable
  caption="{FILTERS.find((f) => f.id === filter)?.label} bookings"
  {rows}
  {columns}
  getRowId={(b) => b.id}
  pageSize={15}
  loading={data.current === undefined}
  emptyTitle={filter === 'upcoming' ? 'Nothing booked ahead' : filter === 'past' ? 'No past bookings yet' : 'No cancellations'}
  onRowClick={(b) => {
    selected = b;
    open = true;
  }}
  rowLabel={(b) => `Open ${b.title}`}
/>

<BookingDetails bind:open booking={selected} resource={data.current?.resources.find((r) => r.id === selected?.resourceId)} />
