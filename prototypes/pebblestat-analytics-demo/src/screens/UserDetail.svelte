<script lang="ts">
import { ArrowLeft } from '@lucide/svelte';
import { avatarImage, Link, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Avatar, Badge, Card, DataTable, EmptyState, Skeleton } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import type { TrackedEvent } from '../database/schema.ts';
import { ACTIVATION_FUNNEL, EVENT_LABELS } from '../domain/catalog.ts';
import { countBy } from '../domain/metrics.ts';
import { useAnalytics } from '../lib/context.ts';
import { formatDate, fromNow } from '../lib/format.ts';

/** One tracked user: properties, activation progress, event mix and their event timeline. */
let { params }: { params: { id?: string } } = $props();

const { db } = useAnalytics();
const clock = useClock();
const id = $derived(params.id ?? '');
const data = liveQuery(
  async () => {
    const user = await db.users.get(id);
    const events = user ? await db.events.where('userId').equals(id).sortBy('at') : [];
    return { user, events: events.reverse() };
  },
  { initial: undefined, deps: () => id }
);
const types = $derived(new Set((data.current?.events ?? []).map((e) => e.type)));
const time = (iso: string) => new Date(iso).toISOString().slice(11, 16);
</script>

{#snippet whenCell(e: TrackedEvent)}
  <time datetime={e.at}>{formatDate(e.at)} {time(e.at)} UTC</time>
{/snippet}

<Link href="/users" class="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft class="size-4" aria-hidden="true" />All users</Link>

{#if data.current === undefined}
  <Skeleton class="h-72 rounded-xl" aria-hidden="true" />
{:else if !data.current.user}
  <EmptyState title="User not found" description="This user is not in the current scenario. Load another scenario or go back to all users." />
{:else}
  {@const user = data.current.user}
  {@const events = data.current.events}
  <PageHeader title={user.id} description={`First seen ${fromNow(user.createdAt, clock.now)} · ${events.length} events`}>
    {#snippet leading()}
      <Avatar name={user.id} {...avatarImage(user.avatar)} size="lg" decorative />
    {/snippet}
    {#snippet actions()}
      {#each Object.entries(user.properties) as [key, value] (key)}
        <Badge variant="outline">{key}: {String(value)}</Badge>
      {/each}
    {/snippet}
  </PageHeader>

  <div class="grid gap-6 lg:grid-cols-3">
    <Card class="p-5">
      <h2 class="text-sm font-semibold">Activation</h2>
      <ol class="mt-3 grid gap-2 text-sm">
        {#each ACTIVATION_FUNNEL as step, i (step.id)}
          {@const done = types.has(step.eventType)}
          <li class="flex items-center gap-2">
            <span class="grid size-5 place-items-center rounded-full text-xs {done ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}" aria-hidden="true">{i + 1}</span>
            <span class={done ? '' : 'text-muted-foreground'}>{step.label}</span>
            <span class="sr-only">{done ? '(done)' : '(not yet)'}</span>
          </li>
        {/each}
      </ol>
      <h2 class="mt-6 text-sm font-semibold">Event mix</h2>
      <ul class="mt-2 grid gap-1 text-sm">
        {#each countBy(events, 'type', 7) as g (g.key)}
          <li class="flex justify-between gap-2"><span>{g.label}</span><span class="tabular-nums text-muted-foreground">{g.count}</span></li>
        {/each}
      </ul>
    </Card>
    <div class="lg:col-span-2">
      <DataTable
        caption="Events of {user.id}, newest first"
        rows={events}
        getRowId={(e) => e.id}
        pageSize={15}
        columns={[
          { key: 'at', header: 'When', cell: whenCell, accessor: (e) => e.at, sortable: true },
          { key: 'type', header: 'Event', accessor: (e) => EVENT_LABELS[e.type] ?? e.type, sortable: true },
        ]}
        emptyTitle="No events yet"
      />
    </div>
  </div>
{/if}
