<script lang="ts">
import type { DeckLayoutId } from '@protoyard/decks';
import type { DeckSlide } from '@protoyard/decks/schema';
import DeckLayoutRenderer from '../../src/layouts/DeckLayoutRenderer.svelte';
import SlideStepHost from '../../src/layouts/SlideStepHost.svelte';

/** One catalog slide at a given step, as the canvas renders it. */
let { slide, step = 0 }: { slide: DeckSlide; step?: number } = $props();
</script>

<SlideStepHost {slide} {step}>
  <DeckLayoutRenderer layout={slide.layout as DeckLayoutId} props={'props' in slide ? slide.props : {}} />
</SlideStepHost>
