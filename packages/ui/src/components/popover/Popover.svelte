<script lang="ts">
import * as PopoverPrimitive from '@texuli/primitives/popover';
import type { ComponentProps, Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { floatingSurface } from '../../lib/overlay.ts';
import { refAttachment } from '../../lib/ref.ts';
import type { TriggerSnippet } from '../../lib/types.ts';

type Props = Omit<ComponentProps<typeof PopoverPrimitive.Content>, 'children'> & {
  side?: PopoverPrimitive.PopoverSide;
  align?: PopoverPrimitive.PopoverAlign;
  sideOffset?: number;
  ref?: HTMLElement | null;
  open?: boolean;
  trigger: TriggerSnippet;
  children: Snippet;
  onOpenChange?: (open: boolean) => void;
  /**
   * Runs once the content is open and has focused its first control; move
   * focus elsewhere here (for example to a calendar's focused date).
   */
  onOpenFocus?: () => void;
};

let {
  open = $bindable(false),
  trigger,
  children,
  onOpenChange,
  onOpenFocus,
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
  <!-- The content opens in the top layer, above every stacking context. -->
  <PopoverPrimitive.Content
    {@attach refAttachment<HTMLElement>((node) => {
      ref = node;
      // The primitive focuses the content as it attaches, right after this.
      if (node && onOpenFocus) queueMicrotask(onOpenFocus);
    })}
    class={cn(floatingSurface, 'w-72 max-w-[calc(100vw-2rem)] p-4 text-sm', className)}
    {...rest}
  >
    {@render children()}
  </PopoverPrimitive.Content>
</PopoverPrimitive.Root>
