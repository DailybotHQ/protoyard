<script lang="ts">
import type { ImageCenteredPropsSchema, VideoCenteredPropsSchema } from '@protoyard/decks/layouts';
import Blocks from '../design/Blocks.svelte';
import { fitText } from '../design/fit.ts';
import { imageBlock, videoBlock } from '../design/media.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

/** image-centered and video-centered: a framed media stage with its title and caption. */
let {
  layout,
  props: p,
}: {
  layout: 'image-centered' | 'video-centered';
  props: PropsOf<typeof ImageCenteredPropsSchema> | PropsOf<typeof VideoCenteredPropsSchema>;
} = $props();

const media = $derived(
  'image' in p
    ? imageBlock(p.image, 'contain')
    : videoBlock(p.video, p.title ?? 'Presentation video')
);
</script>

<SlideFrame layout={layout} class="items-center gap-[2.2cqw] px-[7cqw] py-[5cqw]">
  {#if p.title}
    <h2 class={`${DECK_TYPE.title} line-clamp-2 self-stretch text-center`} data-slot="title" {@attach fitText(40)}>{p.title}</h2>
  {/if}
  <figure class="m-0 flex min-h-0 w-full flex-1 flex-col items-center gap-[1.4cqw]" data-slot="figure">
    <div class="relative min-h-0 w-full flex-1 overflow-hidden rounded-[1.8cqw] border border-border bg-muted shadow-float" data-slot="media" data-media={media.type} data-fit="contain">
      <Blocks blocks={[media]} class="h-full" />
    </div>
    {#if p.caption}
      <figcaption class={`${DECK_TYPE.caption} line-clamp-2 text-center text-muted-foreground`} data-slot="caption">{p.caption}</figcaption>
    {/if}
  </figure>
</SlideFrame>
