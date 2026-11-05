<script lang="ts">
import { Flame } from '@lucide/svelte';
import type { IconComponent } from '@protoyard/ui';
import { Badge } from 'texuli/badge';
import { useMessages } from 'texuli/i18n';
import { LucideIcon } from 'texuli/icons/lucide';

/**
 * Consecutive ISO-week streak chip. `weeks` is already derived (streakWeeks).
 */
let {
  weeks,
  icon: Icon = Flame,
  class: className = '',
}: {
  weeks: number;
  /** Glyph before the number (default Lucide `Flame`). */
  icon?: IconComponent;
  class?: string;
} = $props();

const messages = useMessages();
const spoken = $derived(
  weeks === 1
    ? messages('protoyard.gamification.streak-chip.label-one', '1 week streak')
    : messages('protoyard.gamification.streak-chip.label', '{weeks} week streak', {
        weeks: String(weeks),
      })
);
const classes = $derived(
  `inline-flex items-center gap-1 rounded-full text-xs font-bold tabular-nums ${className}`
);
</script>

<Badge variant="warning" class={classes} role="img" aria-label={spoken}>
  <LucideIcon icon={Icon} class="size-3.5 shrink-0" />{weeks}
</Badge>
