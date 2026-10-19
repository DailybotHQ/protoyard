<script lang="ts">
import { BellRing, CircleDot } from '@lucide/svelte';
import { LiveCounter } from '@protoyard/analytics-ui';
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Badge, Card } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import { EVENT_LABELS, LIVE_COUNTER } from '../domain/catalog.ts';
import { useAnalytics } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';
import { currentProject } from '../lib/project.svelte.ts';

const { db } = useAnalytics();
const clock = useClock();
// What was already there when the screen opened; later items are marked as new.
const openedAt = clock.now.toISOString();

// Moves when simulated time advances (DevTools → Time): the timeline bumps the counter row.
const counter = liveQuery(async () => (await db.counters.get(LIVE_COUNTER))?.value ?? null, {
  initial: undefined,
});

type StreamItem =
  | { kind: 'event'; id: string; at: string; title: string; detail: string }
  | { kind: 'check'; id: string; at: string; title: string; detail: string; fired: boolean };

// The latest tracked events and the alert checks that simulated time ran, newest first.
const stream = liveQuery(
  async () => {
    const projectId = currentProject.id;
    const [events, checks, alerts] = await Promise.all([
      db.events
        .orderBy('at')
        .reverse()
        .filter((e) => e.projectId === projectId)
        .limit(15)
        .toArray(),
      db.alertChecks
        .orderBy('at')
        .reverse()
        .filter((c) => c.projectId === projectId)
        .limit(10)
        .toArray(),
      db.alerts.where('projectId').equals(projectId).toArray(),
    ]);
    const names = new Map(alerts.map((a) => [a.id, a.name]));
    const items: StreamItem[] = [
      ...events.map((e) => ({
        kind: 'event' as const,
        id: e.id,
        at: e.at,
        title: EVENT_LABELS[e.type] ?? e.type,
        detail: `${e.userId} · ${String(e.properties.plan ?? '')} · ${String(e.properties.platform ?? '')}`,
      })),
      ...checks.map((c) => ({
        kind: 'check' as const,
        id: c.id,
        at: c.at,
        title: `${names.get(c.alertId) ?? 'Alert'} ${c.fired ? 'fired' : 'checked'}`,
        detail: `Daily count ${c.value.toLocaleString('en-US')}`,
        fired: c.fired,
      })),
    ];
    return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 20);
  },
  { initial: [], deps: () => currentProject.id }
);
const fresh = $derived((stream.current ?? []).filter((i) => i.at > openedAt).length);
</script>

<PageHeader title="Live" description="A counter and a stream that follow simulated time. Advance time in DevTools to watch them move." />

<div class="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
  <Card class="grid gap-3 p-5">
    <LiveCounter label="Active users" query={counter} />
    <p class="text-xs text-muted-foreground">The same scenario always moves it the same way: time is simulated and deterministic.</p>
  </Card>
  <Card class="p-5">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold">Stream</h2>
      <span class="text-xs text-muted-foreground" aria-live="polite">{fresh ? `${fresh} new since you opened this page` : ''}</span>
    </div>
    {#if (stream.current ?? []).length === 0}
      <p class="mt-3 text-sm text-muted-foreground">Nothing tracked yet.</p>
    {:else}
      <ul class="mt-2 divide-y divide-border">
        {#each stream.current ?? [] as item (item.id)}
          <li class="flex items-center justify-between gap-3 py-2.5 text-sm" data-stream-kind={item.kind}>
            <span class="flex min-w-0 items-center gap-2">
              {#if item.kind === 'check'}
                <BellRing class="size-4 shrink-0 {item.fired ? 'text-destructive' : 'text-muted-foreground'}" aria-hidden="true" />
              {:else}
                <CircleDot class="size-4 shrink-0 text-primary" aria-hidden="true" />
              {/if}
              <span class="min-w-0 truncate">
                <span class="font-medium">{item.title}</span>
                <span class="text-muted-foreground">· {item.detail}</span>
              </span>
            </span>
            <span class="flex shrink-0 items-center gap-2">
              {#if item.at > openedAt}<Badge variant="secondary">New</Badge>{/if}
              <time class="text-xs text-muted-foreground" datetime={item.at}>{fromNow(item.at, clock.now)}</time>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
</div>
