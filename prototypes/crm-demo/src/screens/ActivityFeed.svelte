<script lang="ts">
import { Link, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, Select } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import { useCrm } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';

const PAGE = 40;
const { db } = useCrm();
const clock = useClock();
let type = $state('all');
let limit = $state(PAGE);

const items = liveQuery(
  () => {
    const ordered = db.activities.orderBy('at').reverse();
    const filteredQuery = type === 'all' ? ordered : ordered.filter((a) => a.type === type);
    return filteredQuery.limit(limit + 1).toArray();
  },
  { initial: [], deps: () => [type, limit] }
);
const people = liveQuery(
  async () =>
    new Map((await db.table('py_personas').toArray()).map((p) => [p.id, p.name as string])),
  { initial: new Map() }
);
const visible = $derived((items.current ?? []).slice(0, limit));
const hasMore = $derived((items.current ?? []).length > limit);
</script>

<PageHeader title="Activity" description="Everything that happened in the workspace, newest first.">
  {#snippet actions()}
    <Select
      aria-label="Filter by type"
      class="w-40"
      items={[
        { value: 'all', label: 'All activity' },
        { value: 'stage-change', label: 'Stage changes' },
        { value: 'created', label: 'Created' },
        { value: 'note', label: 'Notes' },
        { value: 'call', label: 'Calls' },
        { value: 'email', label: 'Emails' },
        { value: 'meeting', label: 'Meetings' },
      ]}
      bind:value={type}
      onValueChange={() => (limit = PAGE)}
    />
  {/snippet}
</PageHeader>

{#if visible.length === 0 && !items.loading}
  <EmptyState title="No activity yet" description="Create a company or deal and it shows up here." />
{:else}
  <Card class="divide-y divide-border">
    {#each visible as item (item.id)}
      <div class="flex items-start justify-between gap-4 px-5 py-3 text-sm">
        <div class="min-w-0">
          <p><span class="font-medium">{people.current?.get(item.actorId) ?? 'Someone'}</span> <span class="text-muted-foreground">· {item.body}</span></p>
          {#if item.dealId}
            <Link href={`/deals/${item.dealId}`} class="text-xs text-primary hover:underline">Open deal</Link>
          {:else if item.companyId}
            <Link href={`/companies/${item.companyId}`} class="text-xs text-primary hover:underline">Open company</Link>
          {/if}
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Badge variant="outline">{item.type}</Badge>
          <time class="text-xs text-muted-foreground" datetime={item.at}>{fromNow(item.at, clock.now)}</time>
        </div>
      </div>
    {/each}
  </Card>
  {#if hasMore}
    <div class="mt-4 flex justify-center">
      <Button variant="outline" onclick={() => (limit += PAGE)}>Load more</Button>
    </div>
  {/if}
{/if}
