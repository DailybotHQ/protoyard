<script lang="ts">
import { Flame } from '@lucide/svelte';
import { Badge } from 'texuli/badge';
import { LucideIcon } from 'texuli/icons/lucide';

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
  `inline-flex items-center gap-1 rounded-full text-xs font-bold tabular-nums ${className}`
);
</script>

<Badge variant="warning" class={classes} role="img" aria-label={spoken}>
  <LucideIcon icon={Flame} class="size-3.5 shrink-0" />{weeks}
</Badge>
