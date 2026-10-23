<script lang="ts">
import { SeparatorRoot } from '@texuli/primitives/separator';
import type { ComponentProps } from 'svelte';
import { cn } from '../../lib/cn.ts';

type Props = Omit<ComponentProps<typeof SeparatorRoot>, 'child'>;

let {
  orientation = 'horizontal',
  decorative = true,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();
</script>

<SeparatorRoot
  bind:ref
  {orientation}
  {decorative}
  class={cn(
    'shrink-0 bg-border',
    orientation === 'horizontal' ? 'h-px w-full' : 'h-full min-h-4 w-px',
    className
  )}
  {...rest}
/>
