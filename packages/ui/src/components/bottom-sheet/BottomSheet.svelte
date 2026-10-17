<script lang="ts">
import { Dialog as DialogPrimitive } from 'bits-ui';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { overlayBackdrop } from '../../lib/overlay.ts';
import type { TriggerSnippet } from '../../lib/types.ts';

type Props = Omit<DialogPrimitive.ContentProps, 'children' | 'child' | 'title'> & {
  open?: boolean;
  title: string;
  description?: string;
  /** Keep the title for assistive tech but hide it visually. */
  hideTitle?: boolean;
  trigger?: TriggerSnippet;
  footer?: Snippet;
  children?: Snippet;
  onOpenChange?: (open: boolean) => void;
};

let {
  open = $bindable(false),
  title,
  description,
  hideTitle = false,
  trigger,
  footer,
  children,
  onOpenChange,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();
</script>

<DialogPrimitive.Root bind:open {onOpenChange}>
  {#if trigger}
    <DialogPrimitive.Trigger>
      {#snippet child({ props })}{@render trigger({ props })}{/snippet}
    </DialogPrimitive.Trigger>
  {/if}
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class={overlayBackdrop} />
    <DialogPrimitive.Content
      bind:ref
      class={cn(
        'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl border border-b-0 border-border bg-elevated text-foreground shadow-float outline-none ui-anim-sheet',
        className
      )}
      {...rest}
    >
      <div class="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true"></div>
      <div class={cn('grid gap-1 px-5 pt-2 pb-3 text-center', hideTitle && 'sr-only')}>
        <DialogPrimitive.Title class="font-heading text-base font-semibold">{title}</DialogPrimitive.Title>
        {#if description}
          <DialogPrimitive.Description class="text-sm text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        {/if}
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-4 text-sm">{@render children?.()}</div>
      {#if footer}
        <div class="flex flex-col gap-2 border-t border-border px-5 pt-3 pb-3">{@render footer()}</div>
      {/if}
      <div class="pb-safe"></div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
