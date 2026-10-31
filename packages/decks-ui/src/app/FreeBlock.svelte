<script lang="ts">
import type { Block } from '@protoyard/blocks';
import { BlockRenderer, getBlockHost, setBlockHost } from '@protoyard/blocks-ui';
import { DECK_INTERACTIVE_ATTRIBUTE } from '@texuli/deck/engine';
import type { DeckStepContext } from '@texuli/slides/stage-core';
import { containsDeckControl } from './interactive.ts';

/**
 * One top-level block of a free slide. The `@texuli/slides` step context
 * owns the reveal: the box-less `tx-deck-stage__fragment` wrapper carries its
 * phase and effect, so the stage's fragment styles animate the block. The
 * Protoyard block host passes the surrounding host's state, embeds, viewer
 * and density through, lays the block out for the slide canvas, and moves
 * code highlights with the step.
 */
let { block, index, step }: { block: Block; index: number; step: DeckStepContext } = $props();

const path = $derived(['blocks', index] as const);
const parent = getBlockHost();
setBlockHost({
  get stateHost() {
    return parent.stateHost;
  },
  get mountEmbed() {
    return parent.mountEmbed;
  },
  get density() {
    return parent.density;
  },
  // A deck slide is a fixed-size canvas: blocks lay out for the slide, never the viewport.
  get canvasMode() {
    return 'slide' as const;
  },
  get documentId() {
    return parent.documentId;
  },
  get viewerId() {
    return parent.viewerId;
  },
  get onCtaAction() {
    return parent.onCtaAction;
  },
  get step() {
    return step.step;
  },
  // The wrapper reveals the block; nested blocks are never stepped on their own.
  get fragment() {
    return () => null;
  },
  get codeHighlight() {
    return () => step.codeHighlight(path)?.index ?? 0;
  },
});
const guard = $derived(containsDeckControl(block) ? { [DECK_INTERACTIVE_ATTRIBUTE]: '' } : {});
</script>

<div
  class="tx-deck-stage__fragment"
  data-tx-deck-item={index}
  data-tx-deck-morph-id={`${block.type}-${index}`}
  {...step.attributes(path)}
>
  <div class="min-w-0" {...guard}>
    <BlockRenderer blocks={[block]} />
  </div>
</div>
