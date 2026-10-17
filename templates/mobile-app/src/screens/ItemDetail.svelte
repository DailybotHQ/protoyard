<script lang="ts">
import { Pencil, Trash } from '@lucide/svelte';
import {
  can,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import { AlertDialog, Button, ErrorState, Skeleton } from '@protoyard/ui';
import Page from '../components/Page.svelte';
import Segmented from '../components/Segmented.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import type { ItemStatus } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useApp } from '../lib/context.ts';
import { fromNow, STATUS_LABELS } from '../lib/format.ts';

let { params }: RouteProps = $props();

const { db, items, runtime } = useApp();
const clock = useClock();

const id = $derived(params.id ?? '');
const item = liveQuery(() => db.items.get(id));
const owner = $derived(runtime.session.personas().find((p) => p.id === item.current?.ownerId));
const canEdit = $derived(can(CAPABILITIES.update));
const canDelete = $derived(can(CAPABILITIES.delete));

let status = $state<ItemStatus>('todo');
$effect(() => {
  if (item.current) status = item.current.status;
});

async function changeStatus(next: ItemStatus) {
  // runService turns permission/offline/server failures into toasts.
  const result = await runService(() => items.setStatus(id, next), {
    success: `Marked as ${STATUS_LABELS[next].toLowerCase()}`,
  });
  if (!result.ok && item.current) status = item.current.status;
}

async function remove() {
  const result = await runService(() => items.remove(id), { success: 'Item deleted' });
  if (result.ok) navigate('/', { replace: true });
  // Keep the dialog open on failure; the toast explains why.
  else throw new Error('The item was not deleted.');
}
</script>

<Page title={item.current?.title ?? 'Item'} backHref="#/">
  {#snippet actions()}
    {#if canEdit && item.current}
      <Button size="icon" variant="ghost" href={`#/items/${id}/edit`} aria-label="Edit item">
        <Pencil aria-hidden="true" />
      </Button>
    {/if}
  {/snippet}

  {#if item.loading}
    <Skeleton class="h-40 rounded-2xl" />
  {:else if !item.current}
    <ErrorState title="Item not found" message="It may have been deleted, or it belongs to another scenario.">
      {#snippet action()}<Button href="#/" variant="outline">Back to items</Button>{/snippet}
    </ErrorState>
  {:else}
    <article class="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-soft">
      <div class="flex items-start justify-between gap-3">
        <h2 class="text-xl font-semibold">{item.current.title}</h2>
        <StatusBadge status={item.current.status} />
      </div>
      {#if item.current.notes}
        <p class="text-sm whitespace-pre-line text-muted-foreground">{item.current.notes}</p>
      {:else}
        <p class="text-sm text-muted-foreground italic">No notes.</p>
      {/if}
      <p class="text-xs text-muted-foreground">
        {owner ? `${owner.name} · ` : ''}updated {fromNow(item.current.updatedAt, clock.now)}
      </p>
    </article>

    {#if canEdit}
      <Segmented
        label="Status"
        bind:value={status}
        onChange={changeStatus}
        options={[
          { value: 'todo', label: 'To do' },
          { value: 'doing', label: 'In progress' },
          { value: 'done', label: 'Done' },
        ]}
      />
    {/if}

    {#if canDelete}
      <AlertDialog
        title="Delete this item?"
        description="This removes it from this prototype's data. A snapshot can bring it back."
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
      >
        {#snippet trigger({ props })}
          <Button {...props} variant="outline" size="lg"><Trash aria-hidden="true" />Delete item</Button>
        {/snippet}
      </AlertDialog>
    {/if}
  {/if}
</Page>
