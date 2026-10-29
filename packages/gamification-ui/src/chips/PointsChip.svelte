<script lang="ts">
import { Sparkles } from '@lucide/svelte';
import { Badge } from 'texuli/badge';
import { LucideIcon } from 'texuli/icons/lucide';

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
  `inline-flex items-center gap-1 rounded-full text-xs font-bold tabular-nums ${className}`
);
</script>

{#if href}
  <a {href} class="inline-flex rounded-full no-underline" aria-label={spoken}>
    <Badge variant="default" class={classes}><LucideIcon icon={Sparkles} class="size-3.5 shrink-0" />{points}</Badge>
  </a>
{:else}
  <Badge variant="default" class={classes} role="img" aria-label={spoken}>
    <LucideIcon icon={Sparkles} class="size-3.5 shrink-0" />{points}
  </Badge>
{/if}
