<script lang="ts" generics="T">
/**
 * Host adapter over `@texuli/data/tree-view` `TreeDataView`.
 */
import { runService } from '@protoyard/renderer-svelte';
import type { TreeMove } from '@protoyard/views/tree';
import { TreeDataView } from '@texuli/data/tree-view';
import type { Snippet } from 'svelte';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  getId,
  getParentId,
  getRank,
  getLabel,
  hasChildren,
  loadChildren,
  onMove,
  onOpen: _onOpen,
  onRetry,
  selected = $bindable<string[]>([]),
  expanded = $bindable<string[]>([]),
  item,
  label = 'Tree',
  class: className,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  getId: (item: T) => string;
  getParentId: (item: T) => string | null;
  getRank: (item: T) => string;
  getLabel?: (item: T) => string;
  hasChildren?: (item: T) => boolean;
  loadChildren?: (item: T) => Promise<readonly T[]>;
  onMove?: (move: TreeMove, item: T) => unknown;
  onOpen?: (item: T) => void;
  onRetry?: () => void | Promise<void>;
  selected?: string[];
  expanded?: string[];
  item?: Snippet<[T, { pending: boolean; selected: boolean }]>;
  label?: string;
  class?: string;
} = $props();

async function persist(move: TreeMove, row: T): Promise<void> {
  if (!onMove) return;
  await runService(() => onMove(move, row));
}
</script>

<QueryState {query} label={`Loading ${label.toLowerCase()}`} {onRetry} isEmpty={() => false}>
  {#snippet children(items)}
    <TreeDataView
      {items}
      {getId}
      {getParentId}
      {getRank}
      {getLabel}
      {hasChildren}
      {loadChildren}
      onMove={onMove ? persist : undefined}
      bind:selected
      bind:expanded
      class={className}
      labels={{ tree: label }}
      {item}
    />
  {/snippet}
</QueryState>
