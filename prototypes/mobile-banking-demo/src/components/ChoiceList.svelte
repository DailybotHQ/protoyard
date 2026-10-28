<script lang="ts" generics="T extends { id: string }">
import { Button } from '@protoyard/ui';
import type { Snippet } from 'svelte';
import { Icon } from 'texuli/icons';

/**
 * Large tappable options that pick-and-advance in one tap. They are
 * buttons (not radios) on purpose: arrowing through radios would fire
 * `change` and jump the flow forward for keyboard users.
 */
let {
  label,
  items,
  selected,
  onPick,
  row,
  disabled,
}: {
  label: string;
  items: readonly T[];
  selected: string | null;
  onPick: (item: T) => void;
  row: Snippet<[T]>;
  /** Returns a reason when an item can't be picked. */
  disabled?: (item: T) => string | null;
} = $props();
</script>

<ul class="flex flex-col gap-2" aria-label={label}>
  {#each items as item (item.id)}
    {@const reason = disabled?.(item) ?? null}
    <li>
      <Button
        type="button"
        class={[
          'flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          reason ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted',
          selected === item.id ? 'border-primary bg-primary/5' : 'border-border bg-surface',
        ]}
        aria-pressed={selected === item.id}
        aria-disabled={reason ? 'true' : undefined}
        onclick={() => {
          if (!reason) onPick(item);
        }}
      >
        <span class="min-w-0 flex-1">
          {@render row(item)}
          {#if reason}<span class="mt-0.5 block text-xs text-muted-foreground">{reason}</span>{/if}
        </span>
        {#if selected === item.id}
          <Icon icon="check" class="size-5 shrink-0 text-primary" aria-hidden="true" />
        {:else if !reason}
          <Icon icon="chevron-right" class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {/if}
      </Button>
    </li>
  {/each}
</ul>
