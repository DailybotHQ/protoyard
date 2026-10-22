<script lang="ts">
import type { Block } from '@protoyard/blocks';

let { block }: { block: Block | unknown } = $props();
const type = $derived(
  typeof block === 'object' && block !== null && 'type' in block
    ? String((block as { type: string }).type)
    : 'unknown'
);
</script>

<div data-py-mock-block-host data-mock-type={type}></div>
