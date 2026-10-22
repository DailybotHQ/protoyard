<script lang="ts">
import { Sparkles } from '@lucide/svelte';

/**
 * Compact verified-points indicator. Optional provisional total is spoken, not
 * mixed into the visible number.
 */
let {
  points,
  provisional = 0,
  href,
  class: className = '',
}: {
  points: number;
  provisional?: number;
  href?: string;
  class?: string;
} = $props();

const spoken = $derived(
  provisional > 0 ? `${points} points verified, ${provisional} in progress` : `${points} points`
);
const classes = $derived(
  `inline-flex h-9 items-center gap-1 rounded-full border border-border bg-primary/10 px-3 text-xs font-bold text-primary tabular-nums ${className}`
);
</script>

{#if href}
  <a {href} class={classes} aria-label={spoken}>
    <Sparkles class="size-3.5 shrink-0" aria-hidden="true" />{points}
  </a>
{:else}
  <span class={classes} role="img" aria-label={spoken}>
    <Sparkles class="size-3.5 shrink-0" aria-hidden="true" />{points}
  </span>
{/if}
