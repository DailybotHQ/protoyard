<script lang="ts">
import { getBlockHost, setBlockHost } from '@protoyard/blocks-ui';
import type { DeckSlide } from '@protoyard/decks/schema';
import type { Snippet } from 'svelte';
import { setPropSteps } from './step-context.ts';
import {
  blockFragment,
  codeHighlightIndex,
  propFragmentAttributes,
  slideStepModel,
} from './steps.ts';

/**
 * Gives the blocks of one slide its current step: stepped blocks reveal in
 * order and code highlights move per step. The canvas mode is always `slide`.
 * Every other host capability (state, embeds, density) passes through from the
 * surrounding host.
 */
let {
  slide,
  step = 0,
  children,
}: { slide: DeckSlide; step?: number; children: Snippet } = $props();

const parent = getBlockHost();
const model = $derived(slideStepModel(slide));
const current = $derived(
  Math.max(0, Math.min(model.count, Math.trunc(Number.isFinite(step) ? step : 0)))
);

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
  // A deck slide is always a fixed-size canvas, whatever the surrounding host
  // says (a generated deck mounts DeckApp without one): blocks lay out for the
  // slide, never for the viewport.
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
    return current;
  },
  get fragment() {
    const m = model;
    const at = current;
    return (block: { step?: number; reveal?: string }) => blockFragment(m, block, at);
  },
  get codeHighlight() {
    const m = model;
    const at = current;
    return (block: { step?: number; highlights?: readonly string[] }) =>
      codeHighlightIndex(m, block, at);
  },
});

// Catalog layouts read their stepped items (cards, process steps, events…) here.
setPropSteps((path) => propFragmentAttributes(model, path, current));
</script>

{@render children()}
