<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import { hashString, initials } from '../../lib/hash.ts';
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

// Tinted backgrounds + foreground text keep contrast AA for every palette slot and theme.
const palette = [
  'bg-chart-1/20 text-foreground',
  'bg-chart-2/20 text-foreground',
  'bg-chart-3/20 text-foreground',
  'bg-chart-4/25 text-foreground',
  'bg-chart-5/20 text-foreground',
];
const sizes = {
  xs: 'size-5 text-[0.55rem]',
  sm: 'size-7 text-[0.65rem]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-base',
};
/** Rendered size in CSS pixels, set on the image so it never shifts layout. */
const pixels = { xs: 20, sm: 28, md: 36, lg: 48 };

const safeSrc = $derived(isSafeImageSource(src) ? src : undefined);
const safeSet = $derived(safeSrc ? safeSrcset(srcset) : undefined);
// The source that failed last: a new src (or srcset) deserves a fresh attempt.
let failedKey = $state<string | null>(null);
const key = $derived(`${safeSrc ?? ''}|${safeSet ?? ''}`);
const tone = $derived(palette[hashString(name) % palette.length]);
const showImage = $derived(safeSrc !== undefined && failedKey !== key);
// Exactly one element names the avatar: the <img> (alt) when the photo shows,
// else the wrapper (role="img"). Decorative avatars name nothing.
const label = $derived(ariaLabel ?? name);
</script>

<span
  role={decorative || showImage ? undefined : 'img'}
  aria-label={decorative || showImage ? undefined : label}
  aria-hidden={decorative || undefined}
  title={decorative ? undefined : (title ?? name)}
  data-avatar={showImage ? 'image' : 'initials'}
  class={cn(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold tracking-tight uppercase select-none',
    sizes[size],
    !showImage && tone,
    className
  )}
  {...rest}
>
  {#if showImage}
    <img
      src={safeSrc}
      srcset={safeSet}
      alt={decorative ? '' : label}
      width={pixels[size]}
      height={pixels[size]}
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
      onerror={() => (failedKey = key)}
    />
  {:else}
    <span aria-hidden="true">{initials(name)}</span>
  {/if}
</span>
