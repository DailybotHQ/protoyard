<script lang="ts">
import { LiveCounter } from '@protoyard/analytics-ui';
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Card } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import { EVENT_LABELS, LIVE_COUNTER } from '../domain/catalog.ts';
import { useAnalytics } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';

const { db } = useAnalytics();
const clock = useClock();

// Moves when simulated time advances (DevTools → Time): the timeline bumps the counter row.
const counter = liveQuery(async () => (await db.counters.get(LIVE_COUNTER))?.value ?? null, {
  initial: undefined,
});
const latest = liveQuery(() => db.events.orderBy('at').reverse().limit(12).toArray(), {
  initial: [],
});
</script>

<PageHeader title="Live" description="A counter that follows simulated time, and the latest tracked events." />

<div class="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
  <Card class="grid gap-3 p-5">
    <LiveCounter label="Active users" query={counter} />
    <p class="text-xs text-muted-foreground">
      Advance simulated time in DevTools to watch it climb; the same scenario always moves it the same way.
    </p>
  </Card>
  <Card class="p-5">
    <h2 class="text-sm font-semibold">Latest events</h2>
    {#if (latest.current ?? []).length === 0}
      <p class="mt-3 text-sm text-muted-foreground">No events tracked yet.</p>
    {:else}
      <ul class="mt-2 divide-y divide-border">
        {#each latest.current ?? [] as event (event.id)}
          <li class="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span class="min-w-0 truncate">
              <span class="font-medium">{EVENT_LABELS[event.type] ?? event.type}</span>
              <span class="text-muted-foreground">· {event.userId} · {String(event.properties.plan ?? '')} · {String(event.properties.platform ?? '')}</span>
            </span>
            <time class="shrink-0 text-xs text-muted-foreground" datetime={event.at}>{fromNow(event.at, clock.now)}</time>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
</div>
