<script lang="ts" generics="T extends string">
import Spinner from './Spinner.svelte';

/**
 * Single-select segmented control (radiogroup).
 * Kept as a panel-local control so arrow keys move and select (DevTools tests
 * and keyboard model). Visual language uses Protoyard theme tokens that map
 * 1:1 to Texuli `--tx-*` when `enableTexuliAppearance()` is on.
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
  busy?: boolean;
} = $props();

let chosen = $state<T | null>(null);
function choose(next: T) {
  if (busy) return;
  chosen = next;
  onchange(next);
}

let group: HTMLDivElement | undefined = $state();

function onkeydown(event: KeyboardEvent) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const index = options.findIndex((o) => o.value === value);
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
  const next = options[(index + step + options.length) % options.length];
  if (!next || busy) return;
  choose(next.value);
  queueMicrotask(() =>
    group?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus()
  );
}
</script>

<div
  bind:this={group}
  role="radiogroup"
  aria-label={label}
  aria-busy={busy || undefined}
  tabindex="-1"
  class="inline-flex w-full rounded-md bg-muted p-0.5 dark:bg-background"
  data-py-devtools-segmented=""
  {onkeydown}
>
  {#each options as option (option.value)}
    {@const checked = option.value === value}
    {@const pending = busy && chosen === option.value}
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-value={option.value}
      tabindex={checked ? 0 : -1}
      disabled={disabled || (busy && !pending)}
      class="inline-flex min-h-touch flex-1 items-center justify-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:min-h-7 {checked
        ? 'bg-surface text-foreground shadow-soft ring-1 ring-border dark:bg-elevated'
        : 'text-muted-foreground hover:text-foreground'}"
      onclick={() => choose(option.value)}
    >
      {#if pending}<Spinner />{/if}
      {option.label}
    </button>
  {/each}
</div>
