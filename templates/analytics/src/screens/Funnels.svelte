<script lang="ts">
import { computeFunnel } from '@protoyard/analytics/funnel';
import { BreakdownSelect } from '@protoyard/analytics-ui/filters';
import { FunnelAnalysis } from '@protoyard/analytics-ui/funnel';
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Card, ErrorState } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import RangeBar from '../components/RangeBar.svelte';
import { ACTIVATION_FUNNEL, EVENT_PROPERTIES } from '../domain/catalog.ts';
import { eventsInRange } from '../domain/metrics.ts';
import { useAnalytics } from '../lib/context.ts';
import { resolveRange, sharedRange } from '../lib/range.svelte.ts';

const { db } = useAnalytics();
const clock = useClock();
const WINDOW_DAYS = 14;

let breakdown = $state<string | null>('properties.plan');
let selected = $state<string | null>(null);
const resolved = $derived(resolveRange(sharedRange.value, clock.now));
const events = liveQuery(() => eventsInRange(db, resolved.range), {
  initial: undefined,
  deps: () => [resolved.range.start, resolved.range.end],
});
const result = $derived(
  events.current
    ? computeFunnel(events.current, ACTIVATION_FUNNEL, {
        window: WINDOW_DAYS * 86_400_000,
        ...(breakdown ? { breakdown } : {}),
      })
    : null
);
const breakdownLabel = $derived(
  EVENT_PROPERTIES.find((p) => p.path === breakdown)?.label ?? 'Breakdown'
);
</script>

<PageHeader title="Funnels" description={`Activation: users who signed up in the range and took each next step within ${WINDOW_DAYS} days.`}>
  {#snippet actions()}<RangeBar now={clock.now} />{/snippet}
</PageHeader>

<Card class="p-5">
  <div class="mb-4">
    <BreakdownSelect
      properties={EVENT_PROPERTIES.filter((p) => p.path !== 'type')}
      value={breakdown}
      onchange={(path) => {
        breakdown = path;
        selected = null;
      }}
    />
  </div>
  {#if events.error}
    <ErrorState title="Could not load events" message={String(events.error)} />
  {:else if result}
    <FunnelAnalysis title="Activation funnel" {result} bind:selected {breakdownLabel} />
  {:else}
    <FunnelAnalysis title="Activation funnel" result={{ steps: [] }} loading />
  {/if}
</Card>
