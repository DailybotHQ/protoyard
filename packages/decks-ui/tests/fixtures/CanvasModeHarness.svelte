<script lang="ts">
import { setBlockHost } from '@protoyard/blocks-ui';
import type { DeckSlide } from '@protoyard/decks/schema';
import SlideStepHost from '../../src/layouts/SlideStepHost.svelte';
import CanvasModeProbe from './CanvasModeProbe.svelte';

/** A surrounding block host that says "flow" (like a generated deck's App), around one slide. */
let { slide }: { slide: DeckSlide } = $props();
setBlockHost({ canvasMode: 'flow', density: 'comfortable' });
</script>

<CanvasModeProbe label="outside" />
<SlideStepHost {slide}>
  <CanvasModeProbe label="inside" />
</SlideStepHost>
