<script lang="ts" generics="T extends string">
import { RadioGroup } from '@texuli/primitives/radio-group';
import Spinner from './Spinner.svelte';

/**
 * Single-select segmented control on `@texuli/primitives/radio-group`
 * (APG radiogroup + roving tabindex). Panel chrome classes keep the compact look.
 */
let {
  value,
  options,
  label,
  onchange,
  disabled = false,
  busy = false,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  label: string;
  onchange: (value: T) => void;
  disabled?: boolean;
  /** The change is being applied: the chosen option shows a spinner, the group waits. */
  busy?: boolean;
} = $props();

/** The option the user picked last; it shows the spinner while `busy`. */
let chosen = $state<T | null>(null);

function onValueChange(next: string): void {
  if (busy) return;
  chosen = next as T;
  onchange(next as T);
}
</script>

<div
  class="py-devtools-segmented inline-flex w-full rounded-md bg-muted p-0.5 dark:bg-background"
  data-py-devtools-segmented=""
>
  <RadioGroup.Root
    {value}
    onValueChange={onValueChange}
    orientation="horizontal"
    loop
    disabled={disabled || busy}
    aria-label={label}
    aria-busy={busy || undefined}
    class="flex w-full gap-0"
  >
    {#each options as option (option.value)}
      {@const checked = option.value === value}
      {@const pending = busy && chosen === option.value}
      <RadioGroup.Item
        value={option.value}
        disabled={disabled || (busy && !pending)}
        class="inline-flex min-h-touch flex-1 items-center justify-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:min-h-7 {checked
          ? 'bg-surface text-foreground shadow-soft ring-1 ring-border dark:bg-elevated'
          : 'text-muted-foreground hover:text-foreground'}"
      >
        {#snippet children()}
          {#if pending}<Spinner />{/if}
          {option.label}
        {/snippet}
      </RadioGroup.Item>
    {/each}
  </RadioGroup.Root>
</div>
