<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { AVATAR_PIXELS, avatarInitials, avatarRootClass, avatarToneIndex } from 'texuli/avatar';
import { isSafeImageSource, safeSrcset } from '../../lib/image-source.ts';

type Props = HTMLAttributes<HTMLSpanElement> & {
  name: string;
  /**
   * Optional image. Initials are shown when it is absent, unsafe (any scheme
   * other than https, `//host`, whitespace…) or fails to load. Persona
   * avatars (`av-042`, URLs) resolve with `avatarImage()` from
   * `@protoyard/renderer-svelte`: `<Avatar name={p.name} {...avatarImage(p.avatar)} />`.
   */
  src?: string | null;
  /** Optional `srcset` (for example `64px 1x, 128px 2x`); dropped when any candidate is unsafe. */
  srcset?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Decorative avatars (next to a visible name) are hidden from assistive tech. */
  decorative?: boolean;
};

let {
  name,
  src,
  srcset,
  size = 'md',
  decorative = false,
  class: className,
  'aria-label': ariaLabel,
  title,
  ...rest
}: Props = $props();

const safeSrc = $derived(isSafeImageSource(src) ? src : undefined);
const safeSet = $derived(safeSrc ? safeSrcset(srcset) : undefined);
// The source that failed last: a new src (or srcset) deserves a fresh attempt.
let failedKey = $state<string | null>(null);
const key = $derived(`${safeSrc ?? ''}|${safeSet ?? ''}`);
const tone = $derived(avatarToneIndex(name));
const showImage = $derived(safeSrc !== undefined && failedKey !== key);
// Exactly one element names the avatar: the <img> (alt) when the photo shows,
// else the wrapper (role="img"). Decorative avatars name nothing.
const label = $derived(ariaLabel ?? name);
</script>

<!--
  Texuli's avatar (`texuli/avatar`: root, tone and image classes, initials and
  tone from the name) with an image that takes a `srcset`, which Texuli's
  Avatar cannot yet (gap G10).
-->
<span
  role={decorative || showImage ? undefined : 'img'}
  aria-label={decorative || showImage ? undefined : label}
  aria-hidden={decorative || undefined}
  title={decorative ? undefined : (title ?? name)}
  data-avatar={showImage ? 'image' : 'initials'}
  data-tx-avatar=""
  data-size={size}
  class={avatarRootClass({ size, class: className })}
  {...rest}
>
  <span class="tx-avatar__surface" data-tone={tone}>
    {#if showImage}
      <img
        src={safeSrc}
        srcset={safeSet}
        alt={decorative ? '' : label}
        width={AVATAR_PIXELS[size]}
        height={AVATAR_PIXELS[size]}
        loading="lazy"
        decoding="async"
        class="tx-avatar__image"
        onerror={() => (failedKey = key)}
      />
    {:else}
      <span class="tx-avatar__fallback" aria-hidden="true">{avatarInitials(name)}</span>
    {/if}
  </span>
</span>
