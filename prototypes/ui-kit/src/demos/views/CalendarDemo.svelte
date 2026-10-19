<script lang="ts">
import type { CalendarSeries } from '@protoyard/views/calendar';
import { defaultPeople, generateCalendarEvents, viewsFragments } from '@protoyard/views/scenarios';
import { type CalendarChange, type CalendarSlot, CalendarView } from '@protoyard/views-ui/calendar';
import { onMount } from 'svelte';
import { createViewDemoContext } from './scenario.ts';

const today = '2026-03-02';
let series = $state<CalendarSeries<unknown>[]>([]);
const query = $derived({ current: series, loading: false, error: null });
let anchor = $state(today as `${number}-${number}-${number}`);
let view = $state<'week' | 'month' | 'day' | 'agenda'>('week');
let notice = $state('Choose a calendar view or move an event.');
onMount(() => {
  void createViewDemoContext('calendar', viewsFragments.calendar('typical')).then((ctx) => {
    series = generateCalendarEvents(ctx, { people: defaultPeople(ctx) });
  });
});
async function change(change: CalendarChange<unknown>) {
  await Promise.resolve();
  const removed = new Set(change.writes.delete);
  const updated = new Map(change.writes.put.map((item) => [item.id, item]));
  series = [
    ...series.filter((item) => !removed.has(item.id) && !updated.has(item.id)),
    ...updated.values(),
  ];
  notice = 'Calendar change saved locally.';
}
async function create(slot: CalendarSlot) {
  await Promise.resolve();
  series = [
    ...series,
    {
      id: `event-${series.length + 1}`,
      start: slot.start,
      end: slot.end,
      allDay: slot.allDay,
      timeZone: 'UTC',
      data: { title: 'New local event', ownerId: 'person_01', kind: 'meeting' },
    },
  ];
  notice = 'Added a local calendar event.';
}
</script>
<div class="space-y-2"><p class="text-sm text-muted-foreground" aria-live="polite">{notice}</p><CalendarView {query} {anchor} bind:view timeZone="UTC" now={new Date(`${today}T12:00:00Z`)} getTitle={(event) => (event.data as { title?: string } | undefined)?.title ?? 'Untitled'} onChange={change} onCreate={create} /></div>
