<script lang="ts">
import { Callout } from 'texuli/alert';

/**
 * Safe placeholder when a block type is unknown or its family is missing.
 * Plain text only — never raw HTML.
 */
let {
  message = 'This block needs a newer Protoyard.',
  blockType,
}: {
  message?: string;
  blockType?: string;
} = $props();
</script>

<!-- A static note, not a live region (Callout's neutral tone would be role="status"). -->
<Callout
  tone="neutral"
  title="Unsupported block"
  text={message}
  role="note"
  data-py-unknown-block=""
  data-block-type={blockType}
>
  {#if blockType}
    <p class="m-0 mt-1 text-xs text-muted-foreground">Type: {blockType}</p>
  {/if}
</Callout>
