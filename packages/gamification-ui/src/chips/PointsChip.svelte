<script lang="ts">
import { Sparkles } from '@lucide/svelte';
import type { IconComponent } from '@protoyard/ui';
import { Badge } from 'texuli/badge';
import { useMessages } from 'texuli/i18n';
import { LucideIcon } from 'texuli/icons/lucide';

/**
 * Compact verified-points indicator. Optional provisional total is spoken, not
 * mixed into the visible number.
 */
let {
  points,
  provisional = 0,
  href,
  icon: Icon = Sparkles,
  class: className = '',
}: {
  points: number;
  provisional?: number;
  href?: string;
  /** Glyph before the number (default Lucide `Sparkles`). */
  icon?: IconComponent;
  class?: string;
} = $props();

const messages = useMessages();
const spoken = $derived(
  provisional > 0
    ? messages(
        'protoyard.gamification.points-chip.points-provisional',
        '{points} points verified, {provisional} in progress',
        { points: String(points), provisional: String(provisional) }
      )
    : messages('protoyard.gamification.points-chip.points', '{points} points', {
        points: String(points),
      })
);
const classes = $derived(
  `inline-flex items-center gap-1 rounded-full text-xs font-bold tabular-nums ${className}`
);
</script>

{#if href}
  <a {href} class="inline-flex rounded-full no-underline" aria-label={spoken}>
    <Badge variant="default" class={classes}><LucideIcon icon={Icon} class="size-3.5 shrink-0" />{points}</Badge>
  </a>
{:else}
  <Badge variant="default" class={classes} role="img" aria-label={spoken}>
    <LucideIcon icon={Icon} class="size-3.5 shrink-0" />{points}
  </Badge>
{/if}
