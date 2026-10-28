<script lang="ts">
import * as PopoverPrimitive from '@texuli/primitives/popover';
import type { ComponentProps, Snippet } from 'svelte';
import { PopoverContent } from 'texuli/popover';
import { refAttachment } from '../../lib/ref.ts';
import type { TriggerSnippet } from '../../lib/types.ts';

type Props = Omit<ComponentProps<typeof PopoverContent>, 'children' | 'arrow'> & {
  side?: PopoverPrimitive.PopoverSide;
  align?: PopoverPrimitive.PopoverAlign;
  sideOffset?: number;
  ref?: HTMLElement | null;
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

<PopoverPrimitive.Root bind:open {onOpenChange} {side} {align} {sideOffset}>
  <PopoverPrimitive.Trigger>
    {#snippet child({ props })}{@render trigger({ props })}{/snippet}
  </PopoverPrimitive.Trigger>
  <!--
    Texuli's styled popover surface (`texuli/popover`). The trigger stays the
    caller's own element (the `trigger` snippet), so the root is the primitive.
    The content opens in the top layer, above every stacking context.
  -->
  <PopoverContent
    {@attach refAttachment<HTMLElement>((node) => (ref = node))}
    arrow={false}
    class={className}
    {...rest}
  >
    {@render children()}
  </PopoverContent>
</PopoverPrimitive.Root>
