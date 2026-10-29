<script lang="ts">
import { RichText } from '@texuli/blocks/text/renderers';

/**
 * Compact safe Markdown body for short structure block descriptions.
 */
let { text = '' }: { text?: string } = $props();
</script>

{#if text.trim()}
  <div class="text-sm leading-relaxed text-muted-foreground">
    <RichText source={text} compact />
  </div>
{/if}
