<script lang="ts">
import type { TabsBlock as TabsBlockType } from '@protoyard/blocks';
import { Tabs } from '@protoyard/ui';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import NestedBlocks from './NestedBlocks.svelte';
import { useBlockState } from './use-block-state.svelte.ts';

let { block }: { block: TabsBlockType } = $props();
const ctl = useBlockState(() => block);

const items = $derived(
  block.panels.map((panel) => ({
    value: panel.id,
    label: panel.label,
  }))
);

let tab = $state('');
$effect(() => {
  tab = ctl.state.panel;
});

$effect(() => {
  const next = tab;
  if (next && next !== ctl.state.panel) {
    void ctl.dispatch({ type: 'select', panel: next });
  }
});
</script>

<section
  class="grid gap-2 rounded-lg border border-border bg-card p-3"
  data-py-block="tabs"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
  data-block-id={block.id}
>
  <Tabs bind:value={tab} {items} label={block.label} variant="underline">
    {#snippet content(item)}
      {@const panel = block.panels.find((p) => p.id === item.value)}
      {#if panel}
        <div role="tabpanel" id="panel-{block.id}-{panel.id}" class="pt-2">
          <NestedBlocks blocks={panel.blocks} />
        </div>
      {/if}
    {/snippet}
  </Tabs>
  <div class="sr-only" aria-live="polite">Selected tab: {ctl.state.panel}</div>
  {#if ctl.error}
    <p class="text-sm text-destructive" role="alert">{ctl.error}</p>
  {/if}
</section>
