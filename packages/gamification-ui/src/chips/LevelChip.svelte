<script lang="ts">
/**
 * Compact level indicator. Theme tokens only; AA on surface backgrounds.
 */
let {
  level,
  href,
  class: className = '',
}: {
  level: number;
  /** Optional link target (hash route or path). */
  href?: string;
  class?: string;
} = $props();

const label = $derived(`Level ${level}`);
const classes = $derived(
  `inline-flex h-9 items-center rounded-full border border-border bg-muted px-3 text-xs font-semibold text-foreground ${className}`
);
</script>

{#if href}
  <a {href} class={classes} aria-label={label}>{label}</a>
{:else}
  <span class={classes} role="img" aria-label={label}>{label}</span>
{/if}
