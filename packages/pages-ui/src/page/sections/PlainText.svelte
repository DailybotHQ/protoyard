<script lang="ts">
import { RichText } from '@texuli/blocks/text/renderers';

/**
 * Short Markdown as text through Texuli's RichText: its closed Markdown
 * subset renders text and safe links only, never HTML.
 */
let { text, class: className = '' }: { text: string; class?: string } = $props();
</script>

{#if text.trim()}
  <div class="grid gap-2 {className}" data-py-plain-text>
    <RichText source={text} />
  </div>
{/if}
