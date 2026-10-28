<script lang="ts">
import { Badge } from 'texuli/badge';

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
const classes = $derived(`font-semibold ${className}`);
</script>

{#if href}
  <a {href} aria-label={label} class="inline-flex rounded-full no-underline">
    <Badge variant="secondary" class={classes}>{label}</Badge>
  </a>
{:else}
  <Badge variant="secondary" class={classes} role="img" aria-label={label}>{label}</Badge>
{/if}
