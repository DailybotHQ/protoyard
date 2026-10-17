<script lang="ts">
import { Archive, Copy, Ellipsis, Pencil, Share2, Trash2 } from '@lucide/svelte';
import { Button, DropdownMenu, type DropdownMenuEntry, toast } from '@protoyard/ui';

let last = $state('Nothing yet');
let starred = $state(false);

const items: DropdownMenuEntry[] = $derived([
  { type: 'label', label: 'Document' },
  { label: 'Rename', icon: Pencil, shortcut: 'F2', onSelect: () => (last = 'Rename') },
  { label: 'Duplicate', icon: Copy, shortcut: '⌘D', onSelect: () => (last = 'Duplicate') },
  {
    label: starred ? 'Remove star' : 'Add star',
    onSelect: () => {
      starred = !starred;
      last = starred ? 'Starred' : 'Unstarred';
    },
  },
  { label: 'Share (no permission)', icon: Share2, disabled: true },
  { type: 'separator' },
  { label: 'Archive', icon: Archive, onSelect: () => (last = 'Archive') },
  {
    label: 'Delete',
    icon: Trash2,
    destructive: true,
    onSelect: () => {
      last = 'Delete';
      toast.error('Delete selected', { description: 'Demo only: nothing was removed.' });
    },
  },
]);
</script>

<div class="flex flex-wrap items-center gap-4">
  <DropdownMenu {items}>
    {#snippet trigger({ props })}
      <Button {...props} variant="outline">Actions</Button>
    {/snippet}
  </DropdownMenu>
  <DropdownMenu
    align="start"
    items={[
      { label: 'Newest first', onSelect: () => (last = 'Sort: newest') },
      { label: 'Oldest first', onSelect: () => (last = 'Sort: oldest') },
      { label: 'A → Z', onSelect: () => (last = 'Sort: A → Z') },
    ]}
  >
    {#snippet trigger({ props })}
      <Button {...props} size="icon" variant="ghost" aria-label="Sort options">
        <Ellipsis aria-hidden="true" />
      </Button>
    {/snippet}
  </DropdownMenu>
  <p class="text-xs text-muted-foreground" aria-live="polite">
    Last action: <span class="font-medium text-foreground">{last}</span>{starred ? ' · ★ starred' : ''}
  </p>
</div>
