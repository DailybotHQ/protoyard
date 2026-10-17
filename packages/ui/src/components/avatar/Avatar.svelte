<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import { hashString, initials } from '../../lib/hash.ts';

type Props = HTMLAttributes<HTMLSpanElement> & {
  name: string;
  /** Optional image; initials are shown when absent or when it fails to load. */
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Decorative avatars (next to a visible name) are hidden from assistive tech. */
  decorative?: boolean;
};

let { name, src, size = 'md', decorative = false, class: className, ...rest }: Props = $props();

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

let failed = $state(false);
$effect(() => {
  // A new src deserves a fresh attempt.
  void src;
  failed = false;
});

const tone = $derived(palette[hashString(name) % palette.length]);
const showImage = $derived(Boolean(src) && !failed);
</script>

<span
  role={decorative ? undefined : 'img'}
  aria-label={decorative ? undefined : name}
  aria-hidden={decorative || undefined}
  title={decorative ? undefined : name}
  class={cn(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold tracking-tight uppercase select-none',
    sizes[size],
    !showImage && tone,
    className
  )}
  {...rest}
>
  {#if showImage}
    <img src={src ?? undefined} alt="" class="size-full object-cover" onerror={() => (failed = true)} />
  {:else}
    <span aria-hidden="true">{initials(name)}</span>
  {/if}
</span>
