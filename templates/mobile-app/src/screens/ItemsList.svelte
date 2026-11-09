<script lang="ts">
import { ListTodo } from '@lucide/svelte';
import { can, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Button, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { ListItem } from 'texuli/list-item';
import { Box, Text } from 'texuli/typography';
import Page from '../components/Page.svelte';
import Segmented from '../components/Segmented.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import type { ItemStatus } from '../database/schema.ts';
import { sortItems } from '../domain/items.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useApp } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';

const { db } = useApp();
const clock = useClock();

// Re-runs automatically whenever `items` changes (edits, scenario loads, snapshot restores).
const items = liveQuery(() => db.items.toArray());

let filter = $state<ItemStatus | 'all'>('all');
const all = $derived(sortItems(items.current ?? []));
const visible = $derived(filter === 'all' ? all : all.filter((item) => item.status === filter));
const count = (status: ItemStatus) => all.filter((item) => item.status === status).length;
const canCreate = $derived(can(CAPABILITIES.create));
</script>

<Page title="Items" subtitle={items.loading ? undefined : `${all.length} total`}>
  {#snippet actions()}
    {#if canCreate}
      <Button size="icon" variant="ghost" href="#/items/new" aria-label="New item">
        <Icon icon="plus" aria-hidden="true" />
      </Button>
    {/if}
  {/snippet}

  {#if items.error}
    <ErrorState message="Items could not be read from this browser's storage." />
  {:else if items.loading}
    <div class="flex flex-col gap-3">
      {#each [1, 2, 3, 4] as n (n)}<Skeleton class="h-16" />{/each}
    </div>
  {:else if all.length === 0}
    <EmptyState
      icon={ListTodo}
      title="Nothing here yet"
      description={canCreate
        ? 'Add your first item — it is saved in this browser and survives reloads.'
        : 'The owner has not added anything yet.'}
    >
      {#snippet action()}
        {#if canCreate}<Button href="#/items/new"><Icon icon="plus" aria-hidden="true" />New item</Button>{/if}
      {/snippet}
    </EmptyState>
  {:else}
    <Segmented
      label="Filter by status"
      bind:value={filter}
      options={[
        { value: 'all', label: 'All' },
        { value: 'todo', label: `To do ${count('todo')}` },
        { value: 'doing', label: `Doing ${count('doing')}` },
        { value: 'done', label: `Done ${count('done')}` },
      ]}
    />
    {#if visible.length === 0}
      <EmptyState size="sm" title="No items with this status" />
    {:else}
      <Box surface="default" radius="xl" elevation="sm" padding="sm">
        <ul role="list" class="tx-list">
          {#each visible as item (item.id)}
            <ListItem
              href={`#/items/${item.id}`}
              description={`Updated ${fromNow(item.updatedAt, clock.now)}`}
              class="min-h-16"
            >
              <Text as="span" size="sm" weight="medium" tone={item.status === 'done' ? 'muted' : 'default'} truncate>
                {item.title}
              </Text>
              {#snippet trailing()}
                <StatusBadge status={item.status} />
                <Icon icon="chevron-right" class="size-4 shrink-0" aria-hidden="true" />
              {/snippet}
            </ListItem>
          {/each}
        </ul>
      </Box>
    {/if}
  {/if}
</Page>
