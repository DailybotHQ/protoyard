<script lang="ts">
import { ArrowLeft, FileQuestion, Pencil, Pin, Trash2 } from '@lucide/svelte';
import {
  back,
  can,
  getRuntime,
  liveQuery,
  navigate,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import { AlertDialog, Badge, Button, EmptyState, Skeleton } from '@protoyard/ui';
import NoteEditor from '../components/NoteEditor.svelte';
import type { BlankDatabase } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { timeAgo } from '../lib/format.ts';
import { notesService } from '../lib/services.ts';

let { params }: { params: { id?: string } } = $props();

const runtime = getRuntime<BlankDatabase>();
const clock = useClock();
const id = $derived(params.id ?? '');
// `deps` re-subscribes the query when the route param changes.
const note = liveQuery(() => runtime.db.notes.get(id), { deps: () => id });
let editing = $state(false);
let confirmDelete = $state(false);

async function remove() {
  const current = note.current;
  if (!current) return;
  const result = await runService(() => notesService().remove(current.id), {
    success: 'Note deleted',
  });
  if (result.ok) navigate('/', { replace: true });
  else throw result.error instanceof Error ? result.error : new Error('Delete failed');
}
</script>

<Button variant="ghost" size="sm" class="-ml-2" onclick={() => back('/')}>
  <ArrowLeft class="size-4" aria-hidden="true" />All notes
</Button>

{#if note.loading}
  <div class="mt-6 space-y-3"><Skeleton class="h-8 w-2/3" /><Skeleton class="h-32 w-full" /></div>
{:else if !note.current}
  <EmptyState class="mt-6" icon={FileQuestion} title="Note not found" description="It may have been deleted, or this scenario never had it.">
    {#snippet action()}<Button href="#/">Back to notes</Button>{/snippet}
  </EmptyState>
{:else}
  {@const current = note.current}
  <article class="mt-4 rounded-xl border border-border bg-surface p-5 shadow-soft sm:p-8">
    <header class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold tracking-tight break-words">{current.title}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Updated {timeAgo(current.updatedAt, clock.now)} · created {timeAgo(current.createdAt, clock.now)}
        </p>
      </div>
      {#if current.pinned}<Badge variant="secondary"><Pin class="size-3" aria-hidden="true" />Pinned</Badge>{/if}
    </header>
    <p class="mt-6 whitespace-pre-wrap text-surface-foreground">{current.body || 'No body.'}</p>
    {#if can(CAPABILITIES.update) || can(CAPABILITIES.delete)}
      <footer class="mt-8 flex flex-wrap gap-2 border-t border-border pt-5">
        {#if can(CAPABILITIES.update)}
          <Button variant="outline" onclick={() => (editing = true)}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
        {/if}
        {#if can(CAPABILITIES.delete)}
          <Button variant="ghost" class="text-destructive hover:bg-destructive/10" onclick={() => (confirmDelete = true)}>
            <Trash2 class="size-4" aria-hidden="true" />Delete
          </Button>
        {/if}
      </footer>
    {:else}
      <p class="mt-8 border-t border-border pt-5 text-sm text-muted-foreground">
        You can read this note. Switch to the owner persona in DevTools to edit it.
      </p>
    {/if}
  </article>
  <NoteEditor bind:open={editing} note={current} />
  <AlertDialog
    bind:open={confirmDelete}
    destructive
    title="Delete this note?"
    description={`“${current.title}” will be removed from this prototype's data. Restore a snapshot to get it back.`}
    confirmLabel="Delete note"
    onConfirm={remove}
  />
{/if}
