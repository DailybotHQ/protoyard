<script lang="ts">
import { ArrowLeft, FileQuestion, Trash2 } from '@lucide/svelte';
import { back, can, getRuntime, liveQuery, navigate, runService } from '@protoyard/renderer-svelte';
import { AlertDialog, Button, EmptyState, Skeleton } from '@protoyard/ui';
import { type CanvasDocument, CanvasView } from '@protoyard/views-ui/canvas';
import { LucideIcon } from 'texuli/icons/lucide';
import type { CanvasBoardDatabase } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { boardsService } from '../lib/services.ts';

let { params }: { params: { id?: string } } = $props();

const runtime = getRuntime<CanvasBoardDatabase>();
const id = $derived(params.id ?? '');
// `deps` re-subscribes the query when the route param changes.
const board = liveQuery(() => runtime.db.boards.get(id), { deps: () => id });
const canvas = {
  get current() {
    return board.current?.canvas;
  },
  get loading() {
    return board.loading;
  },
  get error() {
    return board.error;
  },
};
const canUpdate = $derived(can(CAPABILITIES.update));
let confirmDelete = $state(false);

/** Every editor change saves through the board service (checked again there). */
function save(next: CanvasDocument) {
  return boardsService().saveCanvas(id, next);
}

async function remove() {
  const result = await runService(() => boardsService().remove(id), { success: 'Board deleted' });
  if (result.ok) navigate('/', { replace: true });
  else throw result.error instanceof Error ? result.error : new Error('Delete failed');
}
</script>

<Button variant="ghost" size="sm" class="-ml-2" onclick={() => back('/')}>
  <LucideIcon icon={ArrowLeft} class="size-4" />All boards
</Button>

{#if board.loading}
  <div class="mt-6 space-y-3"><Skeleton class="h-8 w-2/3" /><Skeleton class="h-96 w-full" /></div>
{:else if !board.current}
  <EmptyState class="mt-6" icon={FileQuestion} title="Board not found" description="It may have been deleted, or this scenario never had it.">
    {#snippet action()}<Button href="#/">Back to boards</Button>{/snippet}
  </EmptyState>
{:else}
  {@const current = board.current}
  <header class="mt-4 flex flex-wrap items-start gap-3">
    <div class="min-w-0 flex-1">
      <h1 class="text-2xl font-semibold tracking-tight break-words">{current.title}</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {canUpdate
          ? 'Every change saves in this browser. Tab moves between shapes; arrow keys move them.'
          : 'You can look at this board. Switch to the owner persona in DevTools to edit it.'}
      </p>
    </div>
    {#if can(CAPABILITIES.delete)}
      <Button variant="ghost" class="text-destructive hover:bg-destructive/10" onclick={() => (confirmDelete = true)}>
        <LucideIcon icon={Trash2} class="size-4" />Delete
      </Button>
    {/if}
  </header>
  <div class="mt-4 h-[70dvh] min-h-96">
    <CanvasView query={canvas} label={current.title} onChange={canUpdate ? save : undefined} class="h-full" />
  </div>
  <AlertDialog
    bind:open={confirmDelete}
    destructive
    title="Delete this board?"
    description={`“${current.title}” and its canvas will be removed from this prototype's data. Restore a snapshot to get it back.`}
    confirmLabel="Delete board"
    onConfirm={remove}
  />
{/if}
