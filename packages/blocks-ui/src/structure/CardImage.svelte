<script lang="ts">
import { classifyMediaSource } from '@protoyard/blocks';
import { avatarUrl } from '@protoyard/renderer-svelte';
import { cx } from 'texuli/cx';

/**
 * A card's image under the block media policy: a library avatar, a bounded
 * `data:` image or a relative path; anything else renders nothing. Its own
 * chunk, loaded only for cards with an image, so the structure family does not
 * carry the avatar resolver.
 */
let { src: source, alt = '' }: { src: string; alt?: string } = $props();

const src = $derived.by(() => {
  const media = classifyMediaSource(source, 'image');
  if (!media.ok) return undefined;
  return media.kind === 'avatar' ? avatarUrl(source.slice('avatar:'.length)) : source;
});
</script>

{#if src}<img {src} {alt} loading="lazy" decoding="async" referrerpolicy="no-referrer" class={cx('h-auto max-w-full rounded-md border border-border')} />{/if}
