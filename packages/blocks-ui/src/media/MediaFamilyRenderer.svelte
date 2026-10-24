<script lang="ts">
/**
 * Adapter: image/video → `@texuli/blocks/media` MediaBlockView.
 * People is Protoyard-only. Dispatches `blocks:media-ready` after load so
 * decks/pages that wait on media keep working.
 */
import type { Block } from '@protoyard/blocks';
import { avatarUrl } from '@protoyard/renderer-svelte';
import { Avatar, cn } from '@protoyard/ui';
import { MediaBlockView } from '@texuli/blocks/media/renderers';

let { block }: { block: Block } = $props();

const resolveAvatar = (id: string) => avatarUrl(id);

function onMediaEvent(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLImageElement || target instanceof HTMLVideoElement)) return;
  if (event.type === 'load' || event.type === 'loadeddata') {
    target.dispatchEvent(new CustomEvent('blocks:media-ready', { bubbles: true }));
  }
}
</script>

<div
  data-py-block-family="media"
  data-tx-blocks="media"
  onloadcapture={onMediaEvent}
  onloadeddatacapture={onMediaEvent}
>
  {#if block.type === 'people'}
    <section aria-label={block.title ?? 'People'} class="space-y-3">
      {#if block.title}<h3 class="font-semibold text-foreground">{block.title}</h3>{/if}
      <ul
        class={cn(
          'gap-4',
          block.layout === 'row'
            ? 'flex flex-wrap'
            : 'grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]'
        )}
      >
        {#each block.people as person, i (i)}
          <li
            class="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground"
          >
            <Avatar
              name={person.name}
              src={person.avatar ? avatarUrl(person.avatar) : undefined}
              size="md"
              decorative
            />
            <div class="min-w-0">
              <p class="font-medium">{person.name}</p>
              {#if person.role}<p class="text-sm text-muted-foreground">{person.role}</p>{/if}
              {#if person.bio}<p class="mt-1 text-sm text-muted-foreground">{person.bio}</p>{/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <MediaBlockView {block} {resolveAvatar} />
  {/if}
</div>
