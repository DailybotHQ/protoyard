<script lang="ts">
import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
import { cn } from '../../lib/cn.ts';

type Props = Omit<RadioGroupPrimitive.ItemProps, 'children' | 'child'>;

let { ref = $bindable(null), class: className, ...rest }: Props = $props();
</script>

<RadioGroupPrimitive.Item
  bind:ref
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
