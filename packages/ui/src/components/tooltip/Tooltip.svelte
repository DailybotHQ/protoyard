<script lang="ts">
import { Tooltip as TooltipPrimitive } from 'bits-ui';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import type { TriggerSnippet } from '../../lib/types.ts';

interface Props {
  /** Tooltip text, or a snippet for rich content. */
  content: string | Snippet;
  /** The trigger. Spread `props` onto a focusable element: `{#snippet children({ props })}<Button {...props}>…` */
  children: TriggerSnippet;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
  disabled?: boolean;
  open?: boolean;
  class?: string;
}

let {
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 300,
  disabled = false,
  open = $bindable(false),
  class: className,
}: Props = $props();
</script>

<!-- A local provider keeps Tooltip usable anywhere without app-level setup. -->
<TooltipPrimitive.Provider {delayDuration}>
  <TooltipPrimitive.Root bind:open {disabled}>
    <TooltipPrimitive.Trigger>
      {#snippet child({ props })}{@render children({ props })}{/snippet}
    </TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        {side}
        {align}
        sideOffset={6}
        class={cn(
          'z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-float ui-anim-pop',
          className
        )}
      >
        {#if typeof content === 'string'}
          {content}
        {:else}
          {@render content()}
        {/if}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
</TooltipPrimitive.Provider>
