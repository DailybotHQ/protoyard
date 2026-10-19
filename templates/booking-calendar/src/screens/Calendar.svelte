<script lang="ts">
import { Plus } from '@lucide/svelte';
import { can, liveQuery, runService, useClock } from '@protoyard/renderer-svelte';
import { Button, Select } from '@protoyard/ui';
import type { CalendarSeries } from '@protoyard/views/calendar';
import { type CalendarChange, type CalendarSlot, CalendarView } from '@protoyard/views-ui/calendar';
import BookingDetails from '../components/BookingDetails.svelte';
import BookingDialog from '../components/BookingDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import type { Booking } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useBooking } from '../lib/context.ts';

const { db, services } = useBooking();
const clock = useClock();

let resourceId = $state('all');
const resources = liveQuery(() => db.resources.toArray(), { initial: [] });
// Re-runs when bookings change (services, scenario loads, the timeline) and when the filter changes.
const bookings = liveQuery(
  () =>
    resourceId === 'all'
      ? db.bookings.toArray()
      : db.bookings.where('resourceId').equals(resourceId).toArray(),
  { initial: undefined, deps: () => resourceId }
);
const names = $derived(new Map((resources.current ?? []).map((r) => [r.id, r.name])));
/** Bookings as calendar series (never recurring: recurring blocks are stored as single bookings). */
const series = {
  get current(): CalendarSeries<Booking>[] | undefined {
    return bookings.current?.map((b) => ({ id: b.id, start: b.start, end: b.end, data: b }));
  },
  get loading() {
    return bookings.loading;
  },
  get error() {
    return bookings.error;
  },
};

let createOpen = $state(false);
let draft = $state<{ start: string; end: string; resourceId?: string } | null>(null);
let detailsOpen = $state(false);
let selected = $state<Booking | null>(null);
const canManage = $derived(can(CAPABILITIES.bookingsManage));

function create(slot: CalendarSlot) {
  const start = slot.allDay ? `${slot.date}T09:00:00.000Z` : slot.start;
  draft = {
    start,
    end: slot.allDay ? `${slot.date}T10:00:00.000Z` : slot.end,
    ...(resourceId !== 'all' ? { resourceId } : {}),
  };
  createOpen = true;
  // The form makes the booking; the calendar must not announce one yet.
  return false;
}

/** A drag or keyboard move: the service re-checks hours and overlaps; a refusal puts the event back. */
const move = (change: CalendarChange<Booking>) =>
  runService(
    () =>
      services.bookings.reschedule(change.occurrence.seriesId, {
        start: change.start,
        end: change.end,
      }),
    {
      success: 'Booking moved',
    }
  ).then((result) => {
    if (!result.ok) throw result.error;
  });

const titleOf = (b: Booking | undefined) =>
  b ? `${b.title}${resourceId === 'all' ? ` · ${names.get(b.resourceId) ?? ''}` : ''}` : 'Booking';
const toneOf = (b: Booking | undefined) =>
  !b
    ? 'neutral'
    : b.status === 'cancelled'
      ? 'neutral'
      : b.status === 'no-show'
        ? 'danger'
        : b.status === 'completed'
          ? 'success'
          : b.source === 'block'
            ? 'warning'
            : 'primary';
</script>

<PageHeader title="Calendar" description="Times are in UTC. Click an empty slot to book; drag or press Space on a booking to move it.">
  {#snippet actions()}
    <label class="grid gap-1 text-xs text-muted-foreground">
      Resource
      <Select
        aria-label="Resource"
        items={[{ value: 'all', label: 'All resources' }, ...(resources.current ?? []).map((r) => ({ value: r.id, label: r.name }))]}
        bind:value={resourceId}
      />
    </label>
    {#if canManage}
      <Button
        onclick={() => {
          const start = new Date(Math.ceil(clock.now.getTime() / 3_600_000) * 3_600_000 + 86_400_000).toISOString();
          draft = { start, end: new Date(Date.parse(start) + 3_600_000).toISOString(), ...(resourceId !== 'all' ? { resourceId } : {}) };
          createOpen = true;
        }}><Plus class="size-4" aria-hidden="true" />New booking</Button
      >
    {/if}
  {/snippet}
</PageHeader>

<CalendarView
  query={series}
  label="Bookings calendar"
  timeZone="UTC"
  getTitle={(o) => titleOf(o.data)}
  getTone={(o) => toneOf(o.data)}
  onChange={canManage ? move : undefined}
  onCreate={canManage ? create : undefined}
  onOpen={(o) => {
    selected = o.data ?? null;
    detailsOpen = true;
  }}
/>

<BookingDialog bind:open={createOpen} resources={resources.current ?? []} initial={draft} />
<BookingDetails bind:open={detailsOpen} booking={selected} resource={(resources.current ?? []).find((r) => r.id === selected?.resourceId)} />
