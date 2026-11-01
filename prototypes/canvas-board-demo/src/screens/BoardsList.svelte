<script lang="ts">
import { Shapes } from '@lucide/svelte';
import {
  can,
  getRuntime,
  liveQuery,
  navigate,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import { Button, EmptyState, FormField, Input, Skeleton } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import type { CanvasBoardDatabase } from '../database/schema.ts';
import { BoardValidationError, shapeCount, sortBoards } from '../domain/boards.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { timeAgo } from '../lib/format.ts';
import { boardsService } from '../lib/services.ts';

const runtime = getRuntime<CanvasBoardDatabase>();
const clock = useClock();
// Re-runs automatically when boards change — including scenario loads and snapshot restores.
const boards = liveQuery(() => runtime.db.boards.toArray(), { initial: [] });
const canCreate = $derived(can(CAPABILITIES.create));
const visible = $derived(sortBoards(boards.current ?? []));

let title = $state('');
let titleError = $state<string | null>(null);

async function create(event?: SubmitEvent) {
  event?.preventDefault();
  titleError = null;
  const result = await runService(() => boardsService().create({ title }), {
    success: 'Board created',
    silentValidation: true,
  });
  if (result.ok) {
    title = '';
    navigate(`/boards/${result.value.id}`);
  } else if (result.error instanceof BoardValidationError) {
    titleError = result.error.issues.title ?? result.error.message;
  }
}
</script>

<div class="flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Boards</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      {boards.current?.length ?? 0} board{boards.current?.length === 1 ? '' : 's'} · saved in this browser
    </p>
  </div>
</div>

{#if canCreate}
  <form class="mt-6 flex flex-wrap items-end gap-2" onsubmit={create}>
    <FormField label="New board title" error={titleError ?? undefined} class="min-w-64 flex-1">
      {#snippet children(props)}<Input {...props} bind:value={title} placeholder="Customer journey" />{/snippet}
    </FormField>
    <Button type="button" onclick={() => create()}><Icon icon="plus" class="size-4" aria-hidden="true" />New board</Button>
  </form>
{/if}

<div class="mt-6">
  {#if boards.loading}
    <div class="space-y-3" aria-busy="true" aria-label="Loading boards">
      {#each [0, 1, 2] as i (i)}<Skeleton class="h-20 w-full rounded-xl" />{/each}
    </div>
  {:else if boards.error}
    <p class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground" role="alert">
      Could not read boards: {String(boards.error)}
    </p>
  {:else if visible.length === 0}
    <EmptyState
      icon={Shapes}
      title="No boards yet"
      description={canCreate
        ? 'Name a board above to start a canvas of notes, shapes and connectors.'
        : 'Nothing has been drawn here yet. Viewers can look at boards but not create them.'}
    />
  {:else}
    <ul class="grid gap-3 sm:grid-cols-2">
      {#each visible as board (board.id)}
        <li class="group relative rounded-xl border border-border bg-surface p-4 shadow-soft transition-colors hover:border-primary/40">
          <h2 class="font-medium">
            <a href={`#/boards/${encodeURIComponent(board.id)}`} class="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
              {board.title}
            </a>
          </h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {shapeCount(board.canvas)} shape{shapeCount(board.canvas) === 1 ? '' : 's'} · {board.canvas.connectors.length} connector{board.canvas.connectors.length === 1 ? '' : 's'}
          </p>
          <p class="mt-2 text-xs text-muted-foreground">Updated {timeAgo(board.updatedAt, clock.now)}</p>
        </li>
      {/each}
    </ul>
  {/if}
</div>
