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
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
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
  <LucideIcon icon={ArrowLeft} class="size-4" />All notes
</Button>

{#if note.loading}
  <div class="mt-6 space-y-3"><Skeleton class="h-8 w-2/3" /><Skeleton class="h-32 w-full" /></div>
{:else if !note.current}
  <EmptyState class="mt-6" icon={FileQuestion} title="Note not found" description="It may have been deleted, or this scenario never had it.">
    {#snippet action()}<Button href="#/">Back to notes</Button>{/snippet}
  </EmptyState>
{:else}
  {@const current = note.current}
  <Box as="article" padding="none" radius="xl" border="default" elevation="sm" surface="default" class="mt-4 p-5 sm:p-8">
    <header class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1">
        <Heading level={1} size="xl" class="break-words">{current.title}</Heading>
        <Text size="sm" tone="muted" class="mt-1">
          Updated {timeAgo(current.updatedAt, clock.now)} · created {timeAgo(current.createdAt, clock.now)}
        </Text>
      </div>
      {#if current.pinned}<Badge variant="secondary"><LucideIcon icon={Pin} class="size-3" />Pinned</Badge>{/if}
    </header>
    <Text class="mt-6 whitespace-pre-wrap">{current.body || 'No body.'}</Text>
    {#if can(CAPABILITIES.update) || can(CAPABILITIES.delete)}
      <Box as="footer" padding="none" radius="none" border="block-start" class="mt-8 flex flex-wrap gap-2 pt-5">
        {#if can(CAPABILITIES.update)}
          <Button variant="outline" onclick={() => (editing = true)}><LucideIcon icon={Pencil} class="size-4" />Edit</Button>
        {/if}
        {#if can(CAPABILITIES.delete)}
          <Button variant="ghost" tone="destructive" onclick={() => (confirmDelete = true)}>
            <LucideIcon icon={Trash2} class="size-4" />Delete
          </Button>
        {/if}
      </Box>
    {:else}
      <Box as="footer" padding="none" radius="none" border="block-start" class="mt-8 pt-5">
        <Text size="sm" tone="muted">You can read this note. Switch to the owner persona in DevTools to edit it.</Text>
      </Box>
    {/if}
  </Box>
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
