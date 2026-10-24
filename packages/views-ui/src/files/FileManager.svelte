<script lang="ts" generics="T extends import('@protoyard/views/files').FileEntry">
/**
 * Host adapter over `@texuli/data/files` `FileBrowser`: liveQuery `query` → entries.
 * Mutation/upload props match the former host FileManager so prototypes typecheck;
 * Texuli FileBrowser is the display surface.
 */
import type { FileEntry } from '@protoyard/views/files';
import { FileBrowser } from '@texuli/data/files';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  folder = $bindable<string | null>(null),
  folderId = $bindable<string | null>(null),
  view = $bindable<'grid' | 'list'>('grid'),
  layout = $bindable<'grid' | 'list'>('grid'),
  selected = $bindable<string[]>([]),
  getBlob: _getBlob,
  onCreateFolder,
  onRename,
  onMove: _onMove,
  onDelete: _onDelete,
  onUpload: _onUpload,
  onFolderChange,
  onSelectedChange,
  onLayoutChange,
  onOpenFile,
  accept: _accept,
  maxSize: _maxSize,
  onRetry,
  label = 'Files',
  rootLabel: _rootLabel = 'Home',
  class: className,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  /** Open folder id (`null` = root). Prefer `folder`; `folderId` is an alias. */
  folder?: string | null;
  folderId?: string | null;
  view?: 'grid' | 'list';
  layout?: 'grid' | 'list';
  selected?: string[];
  getBlob?: (entry: T) => Promise<Blob | undefined>;
  onCreateFolder?: (parentId: string | null, name: string) => unknown;
  onRename?: (entry: T, name: string) => unknown;
  onMove?: (entries: T[], targetId: string | null) => unknown;
  onDelete?: (entries: T[]) => unknown;
  onUpload?: (files: File[], folderId: string | null) => unknown;
  onFolderChange?: (folderId: string | null) => void;
  onSelectedChange?: (selected: string[]) => void;
  onLayoutChange?: (layout: 'grid' | 'list') => void;
  onOpenFile?: (entry: T) => void;
  accept?: string;
  maxSize?: number;
  onRetry?: () => unknown;
  label?: string;
  rootLabel?: string;
  class?: string;
} = $props();

// Keep folder / folderId and view / layout in sync (host used both names).
let openFolder = $state<string | null>(folder ?? folderId ?? null);
let openLayout = $state<'grid' | 'list'>(view ?? layout ?? 'grid');
$effect(() => {
  folder = openFolder;
  folderId = openFolder;
});
$effect(() => {
  view = openLayout;
  layout = openLayout;
});
</script>

<QueryState {query} label={`Loading ${label.toLowerCase()}`} onRetry={onRetry ? () => { void onRetry(); } : undefined} isEmpty={() => false}>
  {#snippet children(entries)}
    <FileBrowser
      {entries}
      bind:folderId={openFolder}
      bind:selected
      bind:layout={openLayout}
      {onFolderChange}
      {onSelectedChange}
      {onLayoutChange}
      {onOpenFile}
      class={className}
      labels={{ browser: label }}
    />
  {/snippet}
</QueryState>
