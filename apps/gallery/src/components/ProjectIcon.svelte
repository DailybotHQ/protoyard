<script lang="ts">
import { Badge } from '@protoyard/ui';
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
  <Badge variant="secondary" class="border-0 bg-transparent p-0 text-inherit">{#if icon}{icon}{:else}{monogram(name)}{/if}</Badge>
</span>
