<script lang="ts">
import { Badge } from 'texuli/badge';
import { useMessages } from 'texuli/i18n';

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

// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })).
const messages = useMessages();
const label = $derived(
  messages('protoyard.gamification.level-chip.label', 'Level {level}', { level: String(level) })
);
const classes = $derived(`font-semibold ${className}`);
</script>

{#if href}
  <a {href} aria-label={label} class="inline-flex rounded-full no-underline">
    <Badge variant="secondary" class={classes}>{label}</Badge>
  </a>
{:else}
  <Badge variant="secondary" class={classes} role="img" aria-label={label}>{label}</Badge>
{/if}
