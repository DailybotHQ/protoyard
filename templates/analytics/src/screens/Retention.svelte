<script lang="ts">
import { computeRetention } from '@protoyard/analytics/cohort';
import { CohortTable } from '@protoyard/analytics-ui/cohort';
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Button, Card, ErrorState, Skeleton } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import { eventsInRange } from '../domain/metrics.ts';
import { useAnalytics } from '../lib/context.ts';

const { db } = useAnalytics();
const clock = useClock();

const INTERVALS = {
  week: { label: 'Weekly', periods: 8, days: 7 * 9 },
  day: { label: 'Daily', periods: 14, days: 15 },
} as const;
let interval = $state<keyof typeof INTERVALS>('week');
let mode = $state<'bounded' | 'unbounded'>('bounded');

const spec = $derived(INTERVALS[interval]);
const events = liveQuery(
  () => {
    const end = clock.now.getTime();
    return eventsInRange(db, { start: end - spec.days * 86_400_000, end: end + 1 });
  },
  { initial: undefined, deps: () => [interval, clock.now.getTime()] }
);
const result = $derived(
  events.current
    ? computeRetention(events.current, {
        cohortEvent: 'signup',
        interval,
        periods: spec.periods,
        now: clock.now.getTime(),
        mode,
      })
    : null
);
</script>

<PageHeader title="Retention" description="Of the users who signed up in each cohort, the share that came back in each later period.">
  {#snippet actions()}
    <div class="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Cohort size">
      {#each Object.entries(INTERVALS) as [id, option] (id)}
        <Button size="sm" variant={interval === id ? 'secondary' : 'ghost'} aria-pressed={interval === id} onclick={() => (interval = id as keyof typeof INTERVALS)}>{option.label}</Button>
      {/each}
    </div>
    <div class="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Counting">
      <Button size="sm" variant={mode === 'bounded' ? 'secondary' : 'ghost'} aria-pressed={mode === 'bounded'} onclick={() => (mode = 'bounded')}>Active in period</Button>
      <Button size="sm" variant={mode === 'unbounded' ? 'secondary' : 'ghost'} aria-pressed={mode === 'unbounded'} onclick={() => (mode = 'unbounded')}>Not yet churned</Button>
    </div>
  {/snippet}
</PageHeader>

<Card class="p-5">
  {#if events.error}
    <ErrorState title="Could not load events" message={String(events.error)} />
  {:else if result}
    <CohortTable title="{spec.label} retention" {result} description="Cells marked with an asterisk are still in progress at the simulated now." />
  {:else}
    <Skeleton class="h-72 rounded-lg" aria-hidden="true" />
  {/if}
</Card>
