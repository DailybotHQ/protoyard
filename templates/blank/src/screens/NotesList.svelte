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
import { Badge, Button, EmptyState, Input, Skeleton } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
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
    <h1 class="text-2xl font-semibold tracking-tight">Notes</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      {notes.current?.length ?? 0} note{notes.current?.length === 1 ? '' : 's'} · saved in this browser
    </p>
  </div>
  {#if canCreate}
    <Button onclick={() => (editorOpen = true)}><Icon icon="plus" class="size-4" aria-hidden="true" />New note</Button>
  {/if}
</div>

{#if (notes.current?.length ?? 0) > 0}
  <div class="relative mt-6">
    <Icon icon="search" class="pointer-events-none absolute top-1 2 left-3 size-4 -translate-y-1 2 text-muted-foreground" aria-hidden="true" />
    <Input type="search" class="pl-9" placeholder="Search notes" aria-label="Search notes" bind:value={query} />
  </div>
{/if}

<div class="mt-6">
  {#if notes.loading}
    <div class="space-y-3" aria-busy="true" aria-label="Loading notes">
      {#each [0, 1, 2] as i (i)}<Skeleton class="h-20 w-full rounded-xl" />{/each}
    </div>
  {:else if notes.error}
    <p class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground" role="alert">
      Could not read notes: {String(notes.error)}
    </p>
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
    <p class="py-10 text-center text-sm text-muted-foreground">No notes match “{query}”.</p>
  {:else}
    <ul class="space-y-3">
      {#each visible as note (note.id)}
        <li class="group relative rounded-xl border border-border bg-surface p-4 shadow-soft transition-colors hover:border-primary/40">
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <h2 class="flex items-center gap-2 font-medium">
                <a href={`#/notes/${encodeURIComponent(note.id)}`} class="truncate after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
                  {note.title}
                </a>
                {#if note.pinned}<Badge variant="secondary"><LucideIcon icon={Pin} class="size-3" />Pinned</Badge>{/if}
              </h2>
              {#if note.body}
                <p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{note.body}</p>
              {/if}
              <p class="mt-2 text-xs text-muted-foreground">
                {authorName(note.authorId)} · updated {timeAgo(note.updatedAt, clock.now)}
              </p>
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
                <LucideIcon icon={Pin} class={note.pinned ? 'size-4 fill-current text-primary' : 'size-4'} />
              </Button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<NoteEditor bind:open={editorOpen} onsaved={(note) => note && navigate(`/notes/${note.id}`)} />
