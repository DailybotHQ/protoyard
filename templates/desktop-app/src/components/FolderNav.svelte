<script lang="ts">
import { Files, Folder as FolderIcon, FolderPlus, Hash } from '@lucide/svelte';
import { Button } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
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

const item = 'flex w-full items-center justify-start gap-2 whitespace-normal px-2 text-left';
</script>

<Box surface="subtle" radius="none" padding="none" class="h-full w-56 shrink-0 overflow-y-auto">
<nav aria-label="Folders and tags" class="flex flex-col gap-4 p-2">
  <Button type="button" variant={activePath === '/' ? 'secondary' : 'ghost'} size="sm" class={item} aria-current={activePath === '/' ? 'page' : undefined} onclick={() => ongo('/')}>
    <LucideIcon icon={Files} class="size-4 shrink-0" />
    <span class="min-w-0 flex-1 truncate">All documents</span>
    <Text as="span" size="xs" tone="muted" tabular>{total}</Text>
  </Button>

  <section aria-labelledby="folders-heading">
    <div class="mb-1 flex items-center justify-between px-2">
      <h2 id="folders-heading"><Text as="span" size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide">Folders</Text></h2>
      {#if canCreateFolder}
        <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="New folder" onclick={onnewfolder}>
          <LucideIcon icon={FolderPlus} tone="neutral" class="size-4" />
        </Button>
      {/if}
    </div>
    <ul class="space-y-0.5">
      {#each folders as folder (folder.id)}
        {@const path = `/folders/${folder.id}`}
        <li>
          <Button type="button" variant={activePath === path ? 'secondary' : 'ghost'} size="sm" class={item} aria-current={activePath === path ? 'page' : undefined} onclick={() => ongo(path)}>
            <LucideIcon icon={FolderIcon} class="size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{folder.name}</span>
            <Text as="span" size="xs" tone="muted" tabular>{counts[folder.id] ?? 0}</Text>
          </Button>
        </li>
      {/each}
    </ul>
  </section>

  {#if tags.length > 0}
    <section aria-labelledby="tags-heading">
      <h2 id="tags-heading" class="mb-1 px-2"><Text as="span" size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide">Tags</Text></h2>
      <ul class="space-y-0.5">
        {#each tags as tag (tag.id)}
          {@const path = `/tags/${tag.id}`}
          <li>
            <Button type="button" variant={activePath === path ? 'secondary' : 'ghost'} size="sm" class={item} aria-current={activePath === path ? 'page' : undefined} onclick={() => ongo(path)}>
              <LucideIcon icon={Hash} class="size-4 shrink-0" />
              <span class="min-w-0 flex-1 truncate">{tag.name}</span>
            </Button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</nav>
</Box>
