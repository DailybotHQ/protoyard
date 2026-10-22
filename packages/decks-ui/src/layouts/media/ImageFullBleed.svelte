<script lang="ts">
import type { ImageFullBleedPropsSchema } from '@protoyard/decks/layouts';
import Blocks from '../design/Blocks.svelte';
import { imageBlock } from '../design/media.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

let { props: p }: { props: PropsOf<typeof ImageFullBleedPropsSchema> } = $props();
const overlay = $derived(p.overlay ?? (p.caption ? 'dark' : 'none'));
</script>

<SlideFrame layout="image-full-bleed">
  <div class="absolute inset-0" data-slot="media" data-media="image" data-fit="cover">
    <Blocks blocks={[imageBlock(p.image)]} class="h-full" />
  </div>
  {#if overlay !== 'none'}
    <div
      aria-hidden="true"
      class={`pointer-events-none absolute inset-0 ${overlay === 'dark' ? 'bg-linear-to-t from-black/80 via-black/25 to-transparent' : 'bg-linear-to-t from-white/85 via-white/30 to-transparent'}`}
      data-slot="overlay"
    ></div>
  {/if}
  {#if p.caption || p.credit}
    <div
      class={`relative mt-auto flex flex-col gap-[1cqw] px-[7cqw] pb-[6cqw] ${overlay === 'dark' ? 'text-white' : overlay === 'light' ? 'text-black' : 'text-foreground'}`}
      data-slot="caption"
    >
      {#if p.caption}
        <p class={`${DECK_TYPE.title} line-clamp-2 max-w-[24ch] ${overlay === 'none' ? 'w-fit rounded-[1.2cqw] bg-background/85 px-[2cqw] py-[1cqw] backdrop-blur' : ''}`}>{p.caption}</p>
      {/if}
      {#if p.credit}
        <p class={`${DECK_TYPE.caption} opacity-80`} data-slot="credit">{p.credit}</p>
      {/if}
    </div>
  {/if}
</SlideFrame>
