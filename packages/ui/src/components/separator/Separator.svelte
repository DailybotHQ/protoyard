<script lang="ts">
import { Separator as SeparatorPrimitive } from 'bits-ui';
import { cn } from '../../lib/cn.ts';

type Props = Omit<SeparatorPrimitive.RootProps, 'child' | 'children'>;

let {
  orientation = 'horizontal',
  decorative = true,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();
</script>

<SeparatorPrimitive.Root
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
