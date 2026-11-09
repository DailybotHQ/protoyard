<script lang="ts">
import { LiveCounter } from '@protoyard/analytics-ui';
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Card } from '@protoyard/ui';
import { Box, Heading, Text } from 'texuli/typography';
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

<div class="live-grid grid items-start gap-6">
  <Card class="grid gap-3 p-5">
    <LiveCounter label="Active users" query={counter} />
    <Text size="xs" tone="muted">
      Advance simulated time in DevTools to watch it climb; the same scenario always moves it the same way.
    </Text>
  </Card>
  <Card class="p-5">
    <Heading level={2} size="sm">Latest events</Heading>
    {#if (latest.current ?? []).length === 0}
      <Text size="sm" tone="muted" class="mt-3">No events tracked yet.</Text>
    {:else}
      <ul class="mt-2">
        {#each latest.current ?? [] as event, index (event.id)}
          <li>
            <Box border={index === 0 ? 'none' : 'block-start'} radius="none" padding="none" class="flex items-center justify-between gap-3 py-2.5">
              <Text as="span" size="sm" truncate class="min-w-0">
                <Text as="span" size="sm" weight="medium">{EVENT_LABELS[event.type] ?? event.type}</Text>
                <Text as="span" size="sm" tone="muted">· {event.userId} · {String(event.properties.plan ?? '')} · {String(event.properties.platform ?? '')}</Text>
              </Text>
              <Text as="span" size="xs" tone="muted" class="shrink-0"><time datetime={event.at}>{fromNow(event.at, clock.now)}</time></Text>
            </Box>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
</div>

<style>
  @media (min-width: 64rem) {
    .live-grid {
      grid-template-columns: 20rem minmax(0, 1fr);
    }
  }
</style>
