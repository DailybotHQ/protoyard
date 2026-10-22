<script lang="ts">
import { Flame } from '@lucide/svelte';

/**
 * Consecutive ISO-week streak chip. `weeks` is already derived (streakWeeks).
 */
let {
  weeks,
  class: className = '',
}: {
  weeks: number;
  class?: string;
} = $props();

const spoken = $derived(weeks === 1 ? '1 week streak' : `${weeks} week streak`);
const classes = $derived(
  `inline-flex h-9 items-center gap-1 rounded-full border border-border bg-warning/20 px-3 text-xs font-bold text-warning-foreground tabular-nums ${className}`
);
</script>

<span class={classes} role="img" aria-label={spoken}>
  <Flame class="size-3.5 shrink-0" aria-hidden="true" />{weeks}
</span>
