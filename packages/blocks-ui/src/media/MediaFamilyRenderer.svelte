<script lang="ts">
import type { Block } from '@protoyard/blocks';
import { classifyMediaSource } from '@protoyard/blocks';
import { avatarUrl } from '@protoyard/renderer-svelte';
import { Avatar, cn } from '@protoyard/ui';
import { onMount } from 'svelte';

let { block }: { block: Block } = $props();
let reducedMotion = $state(false);
let motionPreferenceKnown = $state(false);
const mediaSrc = (src: string, kind: 'image' | 'video') => {
  const result = classifyMediaSource(src, kind);
  if (!result.ok) return undefined;
  return result.kind === 'avatar' ? avatarUrl(src.slice('avatar:'.length)) : src;
};
const notifyMediaReady = async (event: Event) => {
  const target = event.currentTarget;
  if (target instanceof HTMLImageElement && typeof target.decode === 'function') {
    await target.decode().catch(() => undefined);
  }
  target?.dispatchEvent(new CustomEvent('blocks:media-ready', { bubbles: true }));
};

onMount(() => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => (reducedMotion = query.matches);
  update();
  motionPreferenceKnown = true;
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
});
</script>

{#if block.type === 'image'}
  {@const src = mediaSrc(block.src, 'image')}
  <figure class="space-y-2">
    {#if src}<img {src} alt={block.decorative ? '' : (block.alt ?? '')} width={block.width} height={block.height} loading="lazy" decoding="async" referrerpolicy="no-referrer" onload={notifyMediaReady} class={cn('h-auto max-w-full rounded-md border border-border', block.fit === 'contain' ? 'object-contain' : 'object-cover')} />{/if}
    {#if block.caption || block.credit}<figcaption class="text-sm text-muted-foreground">{#if block.caption}<span>{block.caption}</span>{/if}{#if block.credit}<span>{block.caption ? ` · ${block.credit}` : block.credit}</span>{/if}</figcaption>{/if}
  </figure>
{:else if block.type === 'video'}
  {@const src = mediaSrc(block.src, 'video')}
  {@const poster = block.poster ? mediaSrc(block.poster, 'image') : undefined}
  <figure class="space-y-2">
    {#if src}<video src={src} {poster} width={block.width} height={block.height} aria-label={block.label} controls playsinline muted loop={block.loop ?? false} autoplay={block.autoplay === true && motionPreferenceKnown && !reducedMotion} preload="metadata" onloadeddata={notifyMediaReady} class="h-auto max-w-full rounded-md border border-border"></video>{/if}
    {#if block.caption}<figcaption class="text-sm text-muted-foreground">{block.caption}</figcaption>{/if}
  </figure>
{:else if block.type === 'people'}
  <section aria-label={block.title ?? 'People'} class="space-y-3">
    {#if block.title}<h3 class="font-semibold text-foreground">{block.title}</h3>{/if}
    <ul class={cn('gap-4', block.layout === 'row' ? 'flex flex-wrap' : 'grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))')}>
      {#each block.people as person, i (i)}
        <li class="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground">
          <Avatar name={person.name} src={person.avatar ? avatarUrl(person.avatar) : undefined} size="md" decorative />
          <div class="min-w-0"><p class="font-medium">{person.name}</p>{#if person.role}<p class="text-sm text-muted-foreground">{person.role}</p>{/if}{#if person.bio}<p class="mt-1 text-sm text-muted-foreground">{person.bio}</p>{/if}</div>
        </li>
      {/each}
    </ul>
  </section>
{/if}
