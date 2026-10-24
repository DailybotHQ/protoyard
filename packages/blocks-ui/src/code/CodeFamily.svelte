<script lang="ts">
import type { Block } from '@protoyard/blocks';
import CodeBlock from './CodeBlock.svelte';

let { block }: { block: Block } = $props();
</script>

<div data-py-block-family="code" data-tx-blocks="code">
  <CodeBlock {block} />
</div>
