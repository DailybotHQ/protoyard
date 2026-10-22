<script lang="ts">
import type { TeamAvatarsPropsSchema } from '@protoyard/decks/layouts';
import Blocks from '../design/Blocks.svelte';
import { fitContent, fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

let { props: p }: { props: PropsOf<typeof TeamAvatarsPropsSchema> } = $props();
const columns = $derived(Math.min(4, p.people.length));
</script>

<SlideFrame layout="team-avatars" class="gap-[3cqw] px-[7cqw] py-[6cqw]">
  {#if p.title}
    <h2 class={`${DECK_TYPE.title} line-clamp-2`} data-slot="title" {@attach fitText(40)}>{p.title}</h2>
  {/if}
  <div class="deck-team grid min-h-0 flex-1 content-center" style={`--deck-team-columns:${columns}`} data-slot="people" {@attach fitContent()}>
    <Blocks blocks={[{ type: 'people', layout: 'grid', people: p.people }]} />
  </div>
</SlideFrame>

<style>
  /* The shared people block, restyled as large centered cards with big avatars. */
  .deck-team :global([data-py-deck-interactive]),
  .deck-team :global(section) {
    display: contents;
  }
  .deck-team :global(ul) {
    display: grid;
    grid-template-columns: repeat(var(--deck-team-columns), minmax(0, 1fr));
    gap: 2.4cqw;
  }
  .deck-team :global(li) {
    flex-direction: column;
    justify-content: center;
    gap: 1.4cqw;
    padding: 2.6cqw 1.6cqw;
    border-radius: 2cqw;
    text-align: center;
  }
  .deck-team :global(li > :first-child) {
    width: clamp(88px, 9cqw, 128px);
    height: clamp(88px, 9cqw, 128px);
    font-size: clamp(28px, 3cqw, 40px);
    box-shadow: 0 0 0 4px var(--py-background), 0 0 0 7px color-mix(in oklab, var(--py-primary) 45%, transparent);
  }
  .deck-team :global(li p:first-child) {
    font-size: clamp(24px, 2.2cqw, 30px);
    font-weight: 600;
  }
  .deck-team :global(li p + p) {
    font-size: max(18px, 1.6cqw);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--py-primary);
  }
  @container (max-width: 48rem) {
    .deck-team :global(ul) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
