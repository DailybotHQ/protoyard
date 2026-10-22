<script lang="ts">
import type { ImageSidePropsSchema, VideoSidePropsSchema } from '@protoyard/decks/layouts';
import Blocks from '../design/Blocks.svelte';
import { fitContent, fitText } from '../design/fit.ts';
import Markdown from '../design/Markdown.svelte';
import { imageBlock, videoBlock } from '../design/media.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';
import { getPropSteps } from '../prop-steps.ts';

/** image-left, image-right, video-left and video-right: media bleeds to one edge, copy on the other. */
let {
  layout,
  props: p,
}: {
  layout: 'image-left' | 'image-right' | 'video-left' | 'video-right';
  props: PropsOf<typeof ImageSidePropsSchema> | PropsOf<typeof VideoSidePropsSchema>;
} = $props();

const mediaFirst = $derived(layout.endsWith('-left'));
const steps = getPropSteps();
/** The props key the media comes from: a step marker on it reveals the media pane. */
const mediaKey = $derived('image' in p ? 'image' : 'video');
const media = $derived(
  'image' in p
    ? imageBlock(p.image)
    : videoBlock(p.video, p.title ?? p.heading ?? 'Presentation video')
);
</script>

{#snippet mediaPane()}
  <div {...steps([mediaKey])} class="relative min-h-0 overflow-hidden bg-muted @max-[48rem]:order-1" data-slot="media" data-media={media.type} data-fit="cover">
    <Blocks blocks={[media]} class="h-full" />
  </div>
{/snippet}

{#snippet copyPane()}
  <div class="flex min-h-0 min-w-0 flex-col justify-center gap-[1.8cqw] px-[5.5cqw] py-[5cqw] @max-[48rem]:order-2" data-slot="copy" {@attach fitContent()}>
    {#if p.title && p.heading}
      <p class={`${DECK_TYPE.label} text-primary`} data-slot="eyebrow">{p.title}</p>
    {/if}
    {#if p.heading ?? p.title}
      <h2 class={`${DECK_TYPE.title} line-clamp-3`} data-slot="title" {@attach fitText(40)}>{p.heading ?? p.title}</h2>
    {/if}
    <Markdown text={p.body} class={`${DECK_TYPE.body} text-muted-foreground`} />
  </div>
{/snippet}

<!-- DOM order follows the visual order, so reading order matches what people see. -->
<SlideFrame layout={layout} class={`grid ${mediaFirst ? 'grid-cols-[1.15fr_1fr]' : 'grid-cols-[1fr_1.15fr]'} @max-[48rem]:grid-cols-1 @max-[48rem]:grid-rows-[1fr_auto]`}>
  {#if mediaFirst}
    {@render mediaPane()}
    {@render copyPane()}
  {:else}
    {@render copyPane()}
    {@render mediaPane()}
  {/if}
</SlideFrame>
