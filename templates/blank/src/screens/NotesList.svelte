<script lang="ts">
import { NotebookPen, Pin, Search } from '@lucide/svelte';
import {
  can,
  getRuntime,
  liveQuery,
  navigate,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import { Badge, Button, EmptyState, Skeleton } from '@protoyard/ui';
import { Alert } from 'texuli/alert';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { InputGroup } from 'texuli/input';
import { Box, Heading, Text } from 'texuli/typography';
import NoteEditor from '../components/NoteEditor.svelte';
import type { BlankDatabase } from '../database/schema.ts';
import { sortNotes } from '../domain/notes.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { timeAgo } from '../lib/format.ts';
import { notesService } from '../lib/services.ts';

const runtime = getRuntime<BlankDatabase>();
const clock = useClock();
// Re-runs automatically when notes change — including scenario loads and snapshot restores.
const notes = liveQuery(() => runtime.db.notes.toArray(), { initial: [] });
const personas = liveQuery(() => runtime.db.table('py_personas').toArray(), { initial: [] });

let query = $state('');
let editorOpen = $state(false);
const canCreate = $derived(can(CAPABILITIES.create));
const canUpdate = $derived(can(CAPABILITIES.update));
const authorName = (id: string) =>
  (personas.current ?? []).find((p: { id: string; name: string }) => p.id === id)?.name ??
  'Someone';

const visible = $derived.by(() => {
  const q = query.trim().toLowerCase();
  const all = sortNotes(notes.current ?? []);
  return q ? all.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q)) : all;
});
</script>

<div class="flex flex-wrap items-end justify-between gap-4">
  <div>
    <Heading level={1} size="xl">Notes</Heading>
    <Text size="sm" tone="muted" class="mt-1">
      {notes.current?.length ?? 0} note{notes.current?.length === 1 ? '' : 's'} · saved in this browser
    </Text>
  </div>
  {#if canCreate}
    <Button onclick={() => (editorOpen = true)}><Icon icon="plus" class="size-4" aria-hidden="true" />New note</Button>
  {/if}
</div>

{#if (notes.current?.length ?? 0) > 0}
  <InputGroup
    class="mt-6"
    inputProps={{ type: 'search', placeholder: 'Search notes', 'aria-label': 'Search notes' }}
    bind:value={query}
  >
    {#snippet start()}<Icon icon="search" class="size-4" aria-hidden="true" />{/snippet}
  </InputGroup>
{/if}

<div class="mt-6">
  {#if notes.loading}
    <div class="space-y-3" aria-busy="true" aria-label="Loading notes">
      {#each [0, 1, 2] as i (i)}<Skeleton class="h-20 w-full" />{/each}
    </div>
  {:else if notes.error}
    <Alert tone="error" text={`Could not read notes: ${String(notes.error)}`} />
  {:else if (notes.current?.length ?? 0) === 0}
    <EmptyState
      icon={NotebookPen}
      title="No notes yet"
      description={canCreate
        ? 'Capture the first idea — it is saved in this browser and survives reloads.'
        : 'Nothing has been written here yet. Viewers can read notes but not create them.'}
    >
      {#snippet action()}
        {#if canCreate}
          <Button onclick={() => (editorOpen = true)}><Icon icon="plus" class="size-4" aria-hidden="true" />Create a note</Button>
        {/if}
      {/snippet}
    </EmptyState>
  {:else if visible.length === 0}
    <Text size="sm" tone="muted" align="center" class="py-10">No notes match “{query}”.</Text>
  {:else}
    <ul class="space-y-3">
      {#each visible as note (note.id)}
        <li class="relative">
          <Box radius="xl" border="default" elevation="sm" surface="default" class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <Heading level={2} size="sm" class="flex items-center gap-2">
                <a href={`#/notes/${encodeURIComponent(note.id)}`} class="truncate after:absolute after:inset-0">
                  {note.title}
                </a>
                {#if note.pinned}<Badge variant="secondary"><LucideIcon icon={Pin} class="size-3" />Pinned</Badge>{/if}
              </Heading>
              {#if note.body}
                <Text size="sm" tone="muted" lineClamp={2} class="mt-1">{note.body}</Text>
              {/if}
              <Text size="xs" tone="muted" class="mt-2">
                {authorName(note.authorId)} · updated {timeAgo(note.updatedAt, clock.now)}
              </Text>
            </div>
            {#if canUpdate}
              <Button
                variant="ghost"
                size="icon"
                class="relative z-10"
                aria-label={note.pinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
                aria-pressed={note.pinned}
                onclick={() => runService(() => notesService().togglePin(note))}
              >
                <LucideIcon
                  icon={Pin}
                  class="size-4"
                  tone={note.pinned ? 'primary' : undefined}
                  fill={note.pinned ? 'currentColor' : 'none'}
                />
              </Button>
            {/if}
          </Box>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<NoteEditor bind:open={editorOpen} onsaved={(note) => note && navigate(`/notes/${note.id}`)} />
