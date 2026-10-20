<script lang="ts">
import { runService } from '@protoyard/renderer-svelte';
import { Button, Input } from '@protoyard/ui';
import type { SavedView } from '@protoyard/views/grid';
import { lazyDialog } from '../lib/lazy-overlays.svelte.ts';

/**
 * Picks, saves, renames and deletes saved grid views. Each write goes through
 * its callback (the prototype's service) with pending feedback; a failure
 * keeps the form open.
 */
let {
  views,
  activeId = $bindable(null),
  onApply,
  onCreate,
  onRename,
  onDelete,
}: {
  views: readonly SavedView[];
  activeId?: string | null;
  /** Called when a view is picked (or `null` for the default view). */
  onApply: (view: SavedView | null) => void;
  /** Saves the current state under a new name. */
  onCreate?: (name: string) => unknown;
  onRename?: (view: SavedView, name: string) => unknown;
  onDelete?: (view: SavedView) => unknown;
} = $props();

const uid = $props.id();
let mode = $state<'idle' | 'create' | 'rename'>('idle');
let name = $state('');
let confirmDelete = $state(false);
const active = $derived(views.find((view) => view.id === activeId) ?? null);

async function submit() {
  const trimmed = name.trim();
  if (!trimmed) return;
  const result =
    mode === 'create'
      ? await runService(() => onCreate?.(trimmed), { success: 'View saved' })
      : active
        ? await runService(() => onRename?.(active, trimmed), { success: 'View renamed' })
        : { ok: false as const, error: null };
  if (result.ok) {
    mode = 'idle';
    name = '';
  }
}
</script>

<div class="flex flex-wrap items-center gap-2">
  <label for={`views-${uid}`} class="text-sm text-muted-foreground">View</label>
  <select
    id={`views-${uid}`}
    class="h-9 rounded-md border border-input bg-surface px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    value={activeId ?? ''}
    onchange={(event) => {
      const id = (event.currentTarget as HTMLSelectElement).value;
      activeId = id || null;
      onApply(views.find((view) => view.id === id) ?? null);
    }}
  >
    <option value="">Default</option>
    {#each views as view (view.id)}<option value={view.id}>{view.name}</option>{/each}
  </select>

  {#if mode === 'idle'}
    {#if onCreate}<Button variant="outline" size="sm" onclick={() => ((mode = 'create'), (name = ''))}>Save as new view</Button>{/if}
    {#if active && onRename}<Button variant="ghost" size="sm" onclick={() => ((mode = 'rename'), (name = active.name))}>Rename</Button>{/if}
    {#if active && onDelete}<Button variant="ghost" size="sm" onclick={() => lazyDialog.load().then(() => (confirmDelete = true))}>Delete</Button>{/if}
  {:else}
    <form
      class="flex items-center gap-2"
      onsubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input bind:value={name} aria-label={mode === 'create' ? 'New view name' : 'View name'} class="h-9 w-44" maxlength={80} />
      <!-- The click returns the promise (spinner); Enter in the field submits the form. -->
      <Button type="button" size="sm" disabled={!name.trim()} onclick={() => submit()}>{mode === 'create' ? 'Save' : 'Rename'}</Button>
      <Button type="button" variant="ghost" size="sm" onclick={() => (mode = 'idle')}>Cancel</Button>
    </form>
  {/if}
</div>

<!-- The confirmation's Bits UI code loads when Delete is pressed (the button shows it pending). -->
{#if active && lazyDialog.current}
  {@const AlertDialog = lazyDialog.current}
  <AlertDialog
    bind:open={confirmDelete}
    title={`Delete the view "${active.name}"?`}
    description="The rows stay; only this saved view goes."
    confirmLabel="Delete view"
    destructive
    onConfirm={async () => {
      const result = await runService(() => onDelete?.(active), { success: 'View deleted' });
      if (result.ok) {
        activeId = null;
        onApply(null);
      }
    }}
  />
{/if}
