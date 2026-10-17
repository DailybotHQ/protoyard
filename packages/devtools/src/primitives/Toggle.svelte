<script lang="ts">
let {
  checked,
  label,
  onchange,
  disabled = false,
  hideLabel = false,
}: {
  checked: boolean;
  label: string;
  onchange: (checked: boolean) => void;
  disabled?: boolean;
  hideLabel?: boolean;
} = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={hideLabel ? label : undefined}
  {disabled}
  class="group inline-flex min-h-touch items-center gap-2 text-xs disabled:opacity-50 sm:min-h-7"
  onclick={() => onchange(!checked)}
>
  <span
    class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring {checked
      ? 'bg-primary'
      : 'bg-input'}"
  >
    <span
      class="inline-block size-4 rounded-full bg-surface shadow-soft transition-transform {checked
        ? 'translate-x-4.5'
        : 'translate-x-0.5'}"
    ></span>
  </span>
  {#if !hideLabel}<span>{label}</span>{/if}
</button>
