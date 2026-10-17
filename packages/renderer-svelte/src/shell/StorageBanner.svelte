<script lang="ts">
import type { StorageStatus } from '@protoyard/core';
import Icon from './Icon.svelte';

let { storage }: { storage: StorageStatus } = $props();
let dismissed = $state(false);
</script>

{#if !dismissed}
  <div
    role="status"
    class="relative z-40 flex items-start gap-3 border-b border-border bg-warning px-4 py-2.5 pt-safe text-sm text-warning-foreground"
  >
    <Icon name="alert" class="mt-0.5 size-4 shrink-0" />
    <p class="min-w-0 flex-1">
      <strong class="font-semibold">Changes won't be saved.</strong>
      {storage.warning ??
        'Browser storage is unavailable, so this prototype runs in memory and resets when you reload.'}
    </p>
    <button
      type="button"
      class="-m-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-black/10 sm:size-7"
      aria-label="Dismiss storage warning"
      onclick={() => (dismissed = true)}
    >
      <Icon name="close" />
    </button>
  </div>
{/if}
