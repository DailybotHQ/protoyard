<script lang="ts">
import type { FilterGroup } from '@protoyard/analytics';
import { BreakdownSelect, FilterBuilder, SegmentPicker } from '@protoyard/analytics-ui/filters';
import { LineChart } from '@protoyard/charts-ui/cartesian';
import { can, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Button, Card, ErrorState, Select } from '@protoyard/ui';
import { Box, Text } from 'texuli/typography';
import PageHeader from '../components/PageHeader.svelte';
import RangeBar from '../components/RangeBar.svelte';
import { EVENT_TYPES } from '../database/schema.ts';
import { EVENT_LABELS, EVENT_PROPERTIES } from '../domain/catalog.ts';
import { applyFilter, eventsInRange, eventsOfType, trendSeries } from '../domain/metrics.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useAnalytics } from '../lib/context.ts';
import { resolveRange, sharedRange } from '../lib/range.svelte.ts';

const { db, services } = useAnalytics();
const clock = useClock();

const EMPTY: FilterGroup = { combinator: 'and', conditions: [] };
let eventType = $state('all');
let measure = $state<'events' | 'users'>('events');
let breakdown = $state<string | null>(null);
let filter = $state<FilterGroup>(EMPTY);
let activeSegment = $state<string | null>(null);

const resolved = $derived(resolveRange(sharedRange.value, clock.now));
// One event type uses the [type+at] index; "all events" scans the at index.
const events = liveQuery(
  () =>
    eventType === 'all'
      ? eventsInRange(db, resolved.range)
      : eventsOfType(db, eventType, resolved.range),
  { initial: undefined, deps: () => [eventType, resolved.range.start, resolved.range.end] }
);
const segments = liveQuery(() => db.segments.orderBy('name').toArray(), { initial: [] });

const filtered = $derived(events.current ? applyFilter(events.current, filter) : undefined);
const series = $derived(
  filtered
    ? trendSeries(filtered, {
        range: resolved.range,
        granularity: resolved.granularity,
        breakdown,
        measure,
      })
    : []
);
const title = $derived(
  `${measure === 'users' ? 'Unique users' : 'Events'}${eventType === 'all' ? '' : `: ${EVENT_LABELS[eventType] ?? eventType}`}`
);
const typeItems = [
  { value: 'all', label: 'All events' },
  ...EVENT_TYPES.map((t) => ({ value: t, label: EVENT_LABELS[t] ?? t })),
];
</script>

<PageHeader title="Trends" description="How often things happen, filtered and broken down by event properties.">
  {#snippet actions()}<RangeBar now={clock.now} />{/snippet}
</PageHeader>

<div class="trends-grid grid gap-6">
  <Card class="p-5">
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <Text as="label" size="xs" tone="muted" class="grid gap-1">
        Event
        <Select items={typeItems} bind:value={eventType} aria-label="Event" />
      </Text>
      <Box border="default" radius="md" padding="none" class="inline-flex p-0.5" role="group" aria-label="Measure">
        <Button size="sm" variant={measure === 'events' ? 'secondary' : 'ghost'} aria-pressed={measure === 'events'} onclick={() => (measure = 'events')}>Events</Button>
        <Button size="sm" variant={measure === 'users' ? 'secondary' : 'ghost'} aria-pressed={measure === 'users'} onclick={() => (measure = 'users')}>Unique users</Button>
      </Box>
      <BreakdownSelect properties={EVENT_PROPERTIES.filter((p) => p.path !== 'type' || eventType === 'all')} value={breakdown} onchange={(path) => (breakdown = path)} />
    </div>
    {#if events.error}
      <ErrorState title="Could not load events" message={String(events.error)} />
    {:else}
      <LineChart {title} {series} xKind="time" loading={filtered === undefined} height={300} emptyMessage="No matching events in this period" />
    {/if}
  </Card>

  <Card class="grid content-start gap-4 p-5">
    <SegmentPicker
      segments={segments.current ?? []}
      activeId={activeSegment}
      properties={EVENT_PROPERTIES}
      {filter}
      onapply={(segment) => {
        activeSegment = segment?.id ?? null;
        filter = segment ? segment.filter : EMPTY;
      }}
      onsave={can(CAPABILITIES.segmentsCreate)
        ? async (input) => {
            const saved = await services.segments.create(input);
            activeSegment = saved.id;
          }
        : undefined}
    />
    <FilterBuilder
      value={filter}
      properties={EVENT_PROPERTIES}
      onchange={(next) => {
        filter = next;
        activeSegment = null;
      }}
    />
  </Card>
</div>

<style>
  @media (min-width: 64rem) {
    .trends-grid {
      grid-template-columns: minmax(0, 1fr) 20rem;
    }
  }
</style>
