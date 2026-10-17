<script lang="ts">
import type { Author } from '../lib/context.ts';

let { author, size = 'md' }: { author: Author; size?: 'sm' | 'md' } = $props();

const initials = $derived(
  author.name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
);
</script>

<!-- Decorative: the name is always shown next to it. Near-black text keeps AA contrast on the palette. -->
<span
  aria-hidden="true"
  class={[
    'grid shrink-0 place-items-center font-semibold text-[#0b1220] select-none',
    size === 'sm' ? 'size-7 text-[0.65rem]' : 'size-9 text-xs',
    author.isAssistant ? 'rounded-lg' : 'rounded-full',
  ]}
  style:background-color={author.color}
>
  {initials}
</span>
