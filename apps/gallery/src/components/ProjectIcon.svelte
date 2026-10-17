<script lang="ts">
import { monogram } from '@/lib/format';

let {
  icon,
  name,
  size = 'md',
}: { icon: string | null; name: string; size?: 'md' | 'lg' } = $props();
</script>

<span
  aria-hidden="true"
  class={[
    'grid shrink-0 place-items-center rounded-xl border border-line bg-surface-2 font-semibold text-accent-fg',
    size === 'lg' ? 'size-14 text-2xl' : 'size-10 text-lg',
  ]}
>
  {#if icon}{icon}{:else}<span class={size === 'lg' ? 'text-base' : 'text-xs'}>{monogram(name)}</span>{/if}
</span>
