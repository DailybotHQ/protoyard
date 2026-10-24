<script lang="ts" generics="T">
import { runService } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { cx } from 'texuli/cx';
import { lazyDialog } from '../lib/lazy-overlays.svelte.ts';
import type { BulkAction } from './model.ts';

/**
 * The toolbar for selected rows: "3 selected", one button per action and
 * "Clear selection". Each action runs through its callback (the prototype's
 * service) with pending feedback; a destructive action with `confirm` asks
 * first. On success the selection clears unless the action keeps it.
 */
let {
  rows,
  actions,
  onClear,
  label = 'Bulk actions',
  class: className,
}: {
  /** The selected rows, in row order. The bar hides when this is empty. */
  rows: readonly T[];
  actions: readonly BulkAction<T>[];
  onClear: () => void;
  label?: string;
  class?: string;
} = $props();

let confirming = $state<BulkAction<T> | null>(null);
let confirmOpen = $state(false);

async function run(action: BulkAction<T>) {
  const snapshot = [...rows];
  const result = await runService(() => action.run(snapshot), {
    success:
      action.success ??
      `${action.label}: ${snapshot.length} ${snapshot.length === 1 ? 'row' : 'rows'}`,
  });
  if (result.ok && !action.keepSelection) onClear();
}

function start(action: BulkAction<T>) {
  if (!action.confirm) return run(action);
  return lazyDialog.load().then(() => {
    confirming = action;
    confirmOpen = true;
  });
}
</script>

{#if rows.length > 0}
  <div role="toolbar" aria-label={label} class={cx('flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2', className)}>
    <span class="text-sm font-medium tabular-nums" aria-live="polite">{rows.length.toLocaleString('en')} selected</span>
    {#each actions as action (action.id)}
      <Button
        size="sm"
        variant={action.destructive ? 'destructive' : 'outline'}
        disabled={action.disabled?.(rows) ?? false}
        onclick={() => start(action)}
      >{action.label}</Button>
    {/each}
    <Button size="sm" variant="ghost" class="ml-auto" onclick={onClear}>Clear selection</Button>
  </div>
{/if}

{#if confirming && lazyDialog.current}
  {@const AlertDialog = lazyDialog.current}
  {@const action = confirming}
  <AlertDialog
    bind:open={confirmOpen}
    title={action.confirm?.title ?? `${action.label}?`}
    description={action.confirm?.description ?? `This applies to ${rows.length} selected ${rows.length === 1 ? 'row' : 'rows'}.`}
    confirmLabel={action.confirm?.confirmLabel ?? action.label}
    destructive={action.destructive ?? false}
    onConfirm={() => run(action)}
  />
{/if}
