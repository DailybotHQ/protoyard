<script lang="ts" generics="T extends import('@protoyard/views/files').FileEntry">
/**
 * Host adapter over `@texuli/data/files` `FileBrowser`: liveQuery `query` → entries.
 */
import type { FileEntry } from '@protoyard/views/files';
import { FileBrowser } from '@texuli/data/files';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  folderId = $bindable<string | null>(null),
  selected = $bindable<string[]>([]),
  layout = $bindable<'grid' | 'list'>('grid'),
  onFolderChange,
  onSelectedChange,
  onLayoutChange,
  onOpenFile,
  onRename: _onRename,
  onCreateFolder: _onCreateFolder,
  onRetry,
  label = 'Files',
  class: className,
  ..._rest
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  folderId?: string | null;
  selected?: string[];
  layout?: 'grid' | 'list';
  onFolderChange?: (folderId: string | null) => void;
  onSelectedChange?: (selected: string[]) => void;
  onLayoutChange?: (layout: 'grid' | 'list') => void;
  onOpenFile?: (entry: T) => void;
  onRename?: unknown;
  onCreateFolder?: unknown;
  onRetry?: () => void | Promise<void>;
  label?: string;
  class?: string;
  [key: string]: unknown;
} = $props();
</script>

<QueryState {query} label={`Loading ${label.toLowerCase()}`} {onRetry} isEmpty={() => false}>
  {#snippet children(entries)}
    <FileBrowser
      {entries}
      bind:folderId
      bind:selected
      bind:layout
      {onFolderChange}
      {onSelectedChange}
      {onLayoutChange}
      {onOpenFile}
      class={className}
      labels={{ browser: label }}
    />
  {/snippet}
</QueryState>
