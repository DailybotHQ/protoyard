<script lang="ts">
import type { Author } from '../lib/context.ts';

let {
  author,
  size = 'md',
  decorative = true,
}: { author: Author; size?: 'sm' | 'md'; decorative?: boolean } = $props();

const initials = $derived(
  author.name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
);
</script>

<!-- Near-black text keeps AA contrast on every agent and persona color. -->
<span
  class={[
    'grid shrink-0 place-items-center font-semibold text-[#0b1220] select-none',
    size === 'sm' ? 'size-7 text-[0.65rem]' : 'size-9 text-xs',
    author.kind === 'agent' ? 'rounded-lg' : 'rounded-full',
  ]}
  style:background-color={author.color}
  role={decorative ? undefined : 'img'}
  aria-hidden={decorative ? 'true' : undefined}
  aria-label={decorative ? undefined : `${author.name}${author.kind === 'agent' ? ' (AI agent)' : ''}`}
>
  {initials}
</span>
