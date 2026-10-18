<script lang="ts">
import { Files, Folder as FolderIcon, FolderPlus, Hash } from '@lucide/svelte';
import type { Folder, Tag } from '../database/schema.ts';

/** Sidebar: all documents, folders with counts, and tags. Navigation goes through `ongo` so unsaved edits are guarded. */
let {
  folders,
  tags,
  counts,
  total,
  activePath,
  canCreateFolder,
  ongo,
  onnewfolder,
}: {
  folders: Folder[];
  tags: Tag[];
  counts: Record<string, number>;
  total: number;
  activePath: string;
  canCreateFolder: boolean;
  ongo: (path: string) => void;
  onnewfolder: () => void;
} = $props();

const item =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:bg-primary/10 aria-[current=page]:font-medium aria-[current=page]:text-primary';
</script>

<nav aria-label="Folders and tags" class="flex h-full w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-sidebar p-2">
  <button type="button" class={item} aria-current={activePath === '/' ? 'page' : undefined} onclick={() => ongo('/')}>
    <Files class="size-4 shrink-0" aria-hidden="true" />
    <span class="min-w-0 flex-1 truncate">All documents</span>
    <span class="text-xs text-muted-foreground tabular-nums">{total}</span>
  </button>

  <section aria-labelledby="folders-heading">
    <div class="mb-1 flex items-center justify-between px-2">
      <h2 id="folders-heading" class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Folders</h2>
      {#if canCreateFolder}
        <button type="button" class="rounded p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="New folder" onclick={onnewfolder}>
          <FolderPlus class="size-4" aria-hidden="true" />
        </button>
      {/if}
    </div>
    <ul class="space-y-0.5">
      {#each folders as folder (folder.id)}
        {@const path = `/folders/${folder.id}`}
        <li>
          <button type="button" class={item} aria-current={activePath === path ? 'page' : undefined} onclick={() => ongo(path)}>
            <FolderIcon class="size-4 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{folder.name}</span>
            <span class="text-xs text-muted-foreground tabular-nums">{counts[folder.id] ?? 0}</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>

  {#if tags.length > 0}
    <section aria-labelledby="tags-heading">
      <h2 id="tags-heading" class="mb-1 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tags</h2>
      <ul class="space-y-0.5">
        {#each tags as tag (tag.id)}
          {@const path = `/tags/${tag.id}`}
          <li>
            <button type="button" class={item} aria-current={activePath === path ? 'page' : undefined} onclick={() => ongo(path)}>
              <Hash class="size-4 shrink-0" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{tag.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</nav>
