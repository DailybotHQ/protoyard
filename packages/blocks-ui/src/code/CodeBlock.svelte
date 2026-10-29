<script lang="ts">
/**
 * Thin adapter: Protoyard code block + host → `@texuli/blocks/code` CodeBlockView.
 */
import type { Block } from '@protoyard/blocks';
import { CodeBlockView } from '@texuli/blocks/code/renderers';
import { getBlockHost } from '../host.ts';

let { block }: { block: Block } = $props();
const host = getBlockHost();

/** Absolute deck fragment index; Texuli maps it through the block's own step. */
const hostStep = $derived.by(() => {
  if (block.type !== 'code') return undefined;
  if (host.codeHighlight) {
    const highlights = (block as { highlights?: readonly string[] }).highlights ?? [];
    const index = host.codeHighlight(
      block as { type: string; step?: number; highlights?: readonly string[] }
    );
    if (typeof index === 'number' && index >= 0 && highlights.length > 0) {
      const base = typeof block.step === 'number' ? block.step : 0;
      return base + index;
    }
  }
  return host.step;
});
</script>

{#if block.type === 'code'}
  <CodeBlockView {block} hostStep={hostStep} />
{/if}
