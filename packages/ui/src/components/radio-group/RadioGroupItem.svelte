<script lang="ts">
import { RadioGroup as RadioGroupPrimitive } from '@texuli/primitives/radio-group';
import type { ComponentProps } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { refAttachment } from '../../lib/ref.ts';

type Props = Omit<ComponentProps<typeof RadioGroupPrimitive.Item>, 'children'> & {
  ref?: HTMLButtonElement | null;
};

let { ref = $bindable(null), class: className, ...rest }: Props = $props();
</script>

<RadioGroupPrimitive.Item
  {@attach refAttachment<HTMLButtonElement>((node) => (ref = node))}
  class={cn(
    'peer relative inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-surface shadow-soft',
    'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'data-[state=checked]:border-primary disabled:cursor-not-allowed disabled:opacity-50',
    "before:absolute before:-inset-3.5 before:content-[''] sm:before:-inset-1",
    className
  )}
  {...rest}
>
  {#snippet children({ checked })}
    {#if checked}<span class="size-2 rounded-full bg-primary"></span>{/if}
  {/snippet}
</RadioGroupPrimitive.Item>
