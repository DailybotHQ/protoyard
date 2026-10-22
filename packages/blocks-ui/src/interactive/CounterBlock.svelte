<script lang="ts">
import type { CounterBlock as CounterBlockType } from '@protoyard/blocks';
import { Button } from '@protoyard/ui';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import { useBlockState } from './use-block-state.svelte.ts';

let { block }: { block: CounterBlockType } = $props();
const ctl = useBlockState(() => block);
const unit = $derived(block.unit ? ` ${block.unit}` : '');
</script>

<section
  class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4"
  data-py-block="counter"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
  data-block-id={block.id}
  aria-labelledby="counter-label-{block.id}"
>
  <div class="grid gap-0.5">
    <p class="text-sm font-medium text-foreground" id="counter-label-{block.id}">{block.label}</p>
    <p
      class="text-2xl font-semibold tabular-nums text-foreground"
      aria-live="polite"
      aria-atomic="true"
    >
      {ctl.state.value.toLocaleString()}{unit}
    </p>
  </div>
  <div class="ml-auto flex gap-2">
    <Button
      size="sm"
      variant="outline"
      loading={ctl.pending}
      loadingLabel="Updating"
      aria-label="Decrease {block.label}"
      onclick={() => ctl.dispatch({ type: 'decrement' })}
    >
      −
    </Button>
    <Button
      size="sm"
      variant="outline"
      loading={ctl.pending}
      loadingLabel="Updating"
      aria-label="Increase {block.label}"
      onclick={() => ctl.dispatch({ type: 'increment' })}
    >
      +
    </Button>
    <Button
      size="sm"
      variant="ghost"
      loading={ctl.pending}
      aria-label="Reset {block.label}"
      onclick={() => ctl.dispatch({ type: 'reset' })}
    >
      Reset
    </Button>
  </div>
  {#if ctl.error}
    <p class="w-full text-sm text-destructive" role="alert">{ctl.error}</p>
  {/if}
</section>
