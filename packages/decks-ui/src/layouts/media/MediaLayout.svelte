<script lang="ts">
import type { DeckLayoutId } from '@protoyard/decks';
import { layoutProps } from '../compose.ts';
import Invalid from '../design/Invalid.svelte';
import ImageFullBleed from './ImageFullBleed.svelte';
import MediaCentered from './MediaCentered.svelte';
import MediaSide from './MediaSide.svelte';
import TeamAvatars from './TeamAvatars.svelte';

let { layout, props }: { layout: DeckLayoutId; props: unknown } = $props();
// biome-ignore lint/suspicious/noExplicitAny: each composition types its own validated props.
const p = $derived(layoutProps<any>(layout, props));
</script>

{#if !p}
  <Invalid />
{:else if layout === 'image-left' || layout === 'image-right' || layout === 'video-left' || layout === 'video-right'}
  <MediaSide {layout} props={p} />
{:else if layout === 'image-centered' || layout === 'video-centered'}
  <MediaCentered {layout} props={p} />
{:else if layout === 'image-full-bleed'}
  <ImageFullBleed props={p} />
{:else if layout === 'team-avatars'}
  <TeamAvatars props={p} />
{:else}
  <Invalid />
{/if}
