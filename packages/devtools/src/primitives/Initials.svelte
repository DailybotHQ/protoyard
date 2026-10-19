<script lang="ts">
import { initials } from '../format.ts';

/**
 * A persona's face: the photo when `src` is given (the renderer resolved and
 * checked it), else, or when it fails to load, initials on the persona color.
 * Always decorative: the name is shown next to it.
 */
let {
  name,
  color,
  size = 'md',
  src,
  srcset,
}: {
  name: string;
  color?: string | undefined;
  size?: 'sm' | 'md';
  src?: string | undefined;
  srcset?: string | undefined;
} = $props();

const pixels = $derived(size === 'sm' ? 28 : 36);
// The source that failed last: a new one deserves a fresh attempt.
let failed = $state<string | null>(null);
const showImage = $derived(src !== undefined && failed !== src);
</script>

{#if showImage}
  <img
    {src}
    {srcset}
    alt=""
    width={pixels}
    height={pixels}
    loading="lazy"
    decoding="async"
    class="shrink-0 rounded-full object-cover {size === 'sm' ? 'size-7' : 'size-9'}"
    style:background-color={color ?? 'var(--color-chart-1)'}
    data-persona-avatar=""
    onerror={() => (failed = src ?? null)}
  />
{:else}
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white {size === 'sm'
      ? 'size-7 text-[10px]'
      : 'size-9 text-xs'}"
    style:background-color={color ?? 'var(--color-chart-1)'}
    aria-hidden="true">{initials(name)}</span
  >
{/if}
