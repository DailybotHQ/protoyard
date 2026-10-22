<script lang="ts">
import { DeckCanvas } from '../../src/canvas/index.ts';

interface TestSlide {
  id: string;
  title: string;
}

let { slides, activeIndex }: { slides: readonly TestSlide[]; activeIndex: number } = $props();
</script>

<DeckCanvas {slides} {activeIndex} aspect="16:9" label="Test deck">
  {#snippet children(slide, index)}
    <article data-testid={`slide-content-${index}`}>{slide.title}</article>
  {/snippet}
</DeckCanvas>
