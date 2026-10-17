<script lang="ts" generics="T extends string">
let {
  value,
  options,
  label,
  onchange,
  disabled = false,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  label: string;
  onchange: (value: T) => void;
  disabled?: boolean;
} = $props();

let group: HTMLDivElement | undefined = $state();

// Radio-group keyboard model: arrows move AND select, Tab leaves the group.
function onkeydown(event: KeyboardEvent) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const index = options.findIndex((o) => o.value === value);
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
  const next = options[(index + step + options.length) % options.length];
  if (!next) return;
  onchange(next.value);
  queueMicrotask(() =>
    group?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus()
  );
}
</script>

<div
  bind:this={group}
  role="radiogroup"
  aria-label={label}
  tabindex="-1"
  class="inline-flex w-full rounded-md bg-muted p-0.5 dark:bg-background"
  {onkeydown}
>
  {#each options as option (option.value)}
    {@const checked = option.value === value}
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-value={option.value}
      tabindex={checked ? 0 : -1}
      {disabled}
      class="min-h-touch flex-1 rounded-[calc(var(--radius-md)-2px)] px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:min-h-7 {checked
        ? 'bg-surface text-foreground shadow-soft ring-1 ring-border dark:bg-elevated'
        : 'text-muted-foreground hover:text-foreground'}"
      onclick={() => onchange(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>
