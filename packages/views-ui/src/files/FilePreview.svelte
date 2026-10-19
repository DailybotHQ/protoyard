<script lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/svelte';
import { Button, Dialog } from '@protoyard/ui';
import { categoryOf, type FileEntry, formatSize, thumbnailUrl } from '@protoyard/views/files';

/**
 * A lightbox over the files of a folder: ←/→ (or the buttons) step through
 * them, Escape closes. Images show their blob when one is loaded, otherwise
 * the generated thumbnail.
 */
let {
  files,
  index = $bindable(0),
  open = $bindable(false),
  urlFor,
  onIndexChange,
}: {
  files: readonly FileEntry[];
  index?: number;
  open?: boolean;
  /** An object URL for the entry's blob, when loaded. */
  urlFor: (entry: FileEntry) => string | undefined;
  onIndexChange?: (index: number) => void;
} = $props();

const current = $derived(files[index]);
const category = $derived(current ? categoryOf(current) : 'other');
const src = $derived(
  current ? (category === 'image' && urlFor(current)) || thumbnailUrl(current, { size: 320 }) : ''
);

function go(step: number) {
  if (files.length === 0) return;
  index = (index + step + files.length) % files.length;
  onIndexChange?.(index);
}
</script>

{#if current}
  <Dialog
    bind:open
    title={current.name}
    description={`${index + 1} of ${files.length}`}
    size="xl"
    onkeydown={(event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      }
    }}
  >
    <div class="grid gap-3">
      <div class="flex min-h-48 items-center justify-center rounded-lg bg-muted p-2">
        <img {src} alt={category === 'image' ? current.name : ''} class="max-h-[60vh] max-w-full rounded object-contain" />
      </div>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-muted-foreground">Type</dt>
        <dd>{current.type || category}</dd>
        {#if current.size !== undefined}<dt class="text-muted-foreground">Size</dt><dd>{formatSize(current.size)}</dd>{/if}
        {#if current.updatedAt}<dt class="text-muted-foreground">Updated</dt><dd>{current.updatedAt.slice(0, 10)}</dd>{/if}
      </dl>
      {#if files.length > 1}
        <div class="flex justify-between">
          <Button variant="outline" size="sm" onclick={() => go(-1)}><ChevronLeft class="size-4" aria-hidden="true" />Previous file</Button>
          <Button variant="outline" size="sm" onclick={() => go(1)}>Next file<ChevronRight class="size-4" aria-hidden="true" /></Button>
        </div>
      {/if}
    </div>
  </Dialog>
{/if}
