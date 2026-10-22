<script lang="ts">
import type { ResolvedDeckBackground } from '@protoyard/decks';

let {
  media,
  overlay,
  preload = 'none',
}: {
  media: NonNullable<ResolvedDeckBackground['media']>;
  overlay: ResolvedDeckBackground['overlay'];
  preload?: 'auto' | 'none';
} = $props();

let video = $state<HTMLVideoElement | undefined>();
const objectPosition = (position: string) =>
  ({ center: 'center', top: 'top', bottom: 'bottom', left: 'left', right: 'right' })[
    position as 'center' | 'top' | 'bottom' | 'left' | 'right'
  ];
const overlayColor = $derived(
  overlay
    ? `rgba(${Number.parseInt(overlay.color.slice(1, 3), 16)}, ${Number.parseInt(overlay.color.slice(3, 5), 16)}, ${Number.parseInt(overlay.color.slice(5, 7), 16)}, ${overlay.alpha})`
    : 'transparent'
);

$effect(() => {
  if (media.type !== 'video' || !video) return;
  const element = video;
  if (typeof window === 'undefined') return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  const syncPlayback = () => {
    if (reducedMotion.matches || !visible || preload === 'none') {
      element.pause();
    } else {
      void element.play().catch(() => {});
    }
  };
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver((entries) => {
          visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
          syncPlayback();
        });
  if (observer) observer.observe(element);
  else visible = true;
  reducedMotion.addEventListener('change', syncPlayback);
  syncPlayback();
  return () => {
    observer?.disconnect();
    reducedMotion.removeEventListener('change', syncPlayback);
    element.pause();
  };
});
</script>

<div class="deck-media-background pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-py-deck-media-background={media.type}>
  {#if media.type === 'image'}
    <img
      class="deck-media-background__image absolute inset-0 size-full"
      src={media.src}
      alt={media.alt ?? ''}
      loading={preload === 'auto' ? 'eager' : 'lazy'}
      decoding="async"
      style={`object-fit:${media.fit};object-position:${objectPosition(media.position)}`}
    />
  {:else}
    {#if media.poster}
      <img
        class="deck-media-background__poster absolute inset-0 hidden size-full"
        src={media.poster}
        alt=""
        loading={preload === 'auto' ? 'eager' : 'lazy'}
        decoding="async"
        style={`object-fit:${media.fit};object-position:${objectPosition(media.position)}`}
      />
    {/if}
    <video
      bind:this={video}
      class="deck-media-background__video absolute inset-0 size-full"
      src={media.src}
      poster={media.poster}
      muted
      loop
      playsinline
      preload={preload}
      tabindex="-1"
      style={`object-fit:${media.fit};object-position:${objectPosition(media.position)}`}
    ></video>
  {/if}
  <span class="deck-media-background__scrim absolute inset-0" style={`background:${overlayColor}`}></span>
</div>

<style>
  /* Positioning comes from shared utilities; only the reduced-motion and print swap is local. */
  @media (prefers-reduced-motion: reduce), print {
    .deck-media-background__video {
      display: none;
    }

    .deck-media-background__poster {
      display: block;
    }
  }
</style>
