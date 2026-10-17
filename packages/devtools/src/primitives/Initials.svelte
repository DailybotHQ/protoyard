<script lang="ts">
import { initials } from '../format.ts';

let {
  name,
  color,
  size = 'md',
}: { name: string; color?: string | undefined; size?: 'sm' | 'md' } = $props();
</script>

<span
  class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white {size === 'sm'
    ? 'size-7 text-[10px]'
    : 'size-9 text-xs'}"
  style:background-color={color ?? 'var(--color-chart-1)'}
  aria-hidden="true">{initials(name)}</span
>
