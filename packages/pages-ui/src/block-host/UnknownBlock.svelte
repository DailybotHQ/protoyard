<script lang="ts">
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

<aside
  class="rounded-md border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
  role="note"
  data-py-unknown-block
  data-block-type={blockType}
>
  <p class="m-0 font-medium text-foreground">Unsupported block</p>
  <p class="mt-1 m-0">{message}</p>
  {#if blockType}
    <p class="mt-1 m-0 text-xs opacity-80">Type: {blockType}</p>
  {/if}
</aside>
