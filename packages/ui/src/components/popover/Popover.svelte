<script lang="ts">
import { Popover as PopoverPrimitive } from 'bits-ui';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { floatingSurface } from '../../lib/overlay.ts';
import type { TriggerSnippet } from '../../lib/types.ts';

type Props = Omit<PopoverPrimitive.ContentProps, 'children' | 'child'> & {
  open?: boolean;
  trigger: TriggerSnippet;
  children: Snippet;
  onOpenChange?: (open: boolean) => void;
};

let {
  open = $bindable(false),
  trigger,
  children,
  onOpenChange,
  side = 'bottom',
  align = 'center',
  sideOffset = 6,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();
</script>

<PopoverPrimitive.Root bind:open {onOpenChange}>
  <PopoverPrimitive.Trigger>
    {#snippet child({ props })}{@render trigger({ props })}{/snippet}
  </PopoverPrimitive.Trigger>
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      bind:ref
      {side}
      {align}
      {sideOffset}
      class={cn(floatingSurface, 'w-72 max-w-[calc(100vw-2rem)] p-4 text-sm', className)}
      {...rest}
    >
      {@render children()}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
</PopoverPrimitive.Root>
