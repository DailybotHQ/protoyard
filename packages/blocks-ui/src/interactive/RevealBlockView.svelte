<script lang="ts">
import type { RevealBlock as RevealBlockType } from '@protoyard/blocks';
import { Button } from '@protoyard/ui';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import NestedBlocks from './NestedBlocks.svelte';
import { useBlockState } from './use-block-state.svelte.ts';

let { block }: { block: RevealBlockType } = $props();
const ctl = useBlockState(() => block);
const openLabel = $derived(block.openLabel ?? block.label);
</script>

<section
  class="grid gap-2 rounded-lg border border-border bg-card p-3"
  data-py-block="reveal"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
  data-block-id={block.id}
>
  <Button
    size="sm"
    variant="outline"
    class="w-fit"
    loading={ctl.pending}
    loadingLabel="Updating"
    aria-expanded={ctl.state.open}
    aria-controls="reveal-panel-{block.id}"
    onclick={() => ctl.dispatch({ type: 'toggle' })}
  >
    {ctl.state.open ? openLabel : block.label}
  </Button>
  {#if ctl.state.open}
    <div id="reveal-panel-{block.id}" class="pt-1">
      <NestedBlocks blocks={block.blocks} />
    </div>
  {/if}
  <div class="sr-only" aria-live="polite">
    {ctl.state.open ? 'Content shown' : 'Content hidden'}
  </div>
  {#if ctl.error}
    <p class="text-sm text-destructive" role="alert">{ctl.error}</p>
  {/if}
</section>
