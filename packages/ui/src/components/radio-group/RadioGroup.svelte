<script lang="ts">
import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
import { cn } from '../../lib/cn.ts';
import type { RadioOption } from './types.ts';

type Props = Omit<RadioGroupPrimitive.RootProps, 'child'> & {
  /** Rendered as labelled radio items; use `children` with `RadioGroupItem` for custom layouts. */
  items?: RadioOption[];
};

const uid = $props.id();

let {
  value = $bindable(''),
  ref = $bindable(null),
  items,
  orientation = 'vertical',
  class: className,
  children,
  ...rest
}: Props = $props();
</script>

<RadioGroupPrimitive.Root
  bind:value
  bind:ref
  {orientation}
  class={cn(orientation === 'horizontal' ? 'flex flex-wrap gap-4' : 'grid gap-3', className)}
  {...rest}
>
  {#if items}
    {#each items as item, index (item.value)}
      {@const itemId = `radio-${uid}-${index}`}
      <div class="flex items-start gap-2.5">
        <span class="flex h-5 items-center">
          <RadioGroupPrimitive.Item
            id={itemId}
            value={item.value}
            disabled={item.disabled}
            aria-describedby={item.description ? `${itemId}-description` : undefined}
            class={cn(
              'peer relative inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-surface shadow-soft',
              'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'data-[state=checked]:border-primary disabled:cursor-not-allowed disabled:opacity-50',
              "before:absolute before:-inset-3.5 before:content-[''] sm:before:-inset-1"
            )}
          >
            {#snippet children({ checked })}
              {#if checked}<span class="size-2 rounded-full bg-primary"></span>{/if}
            {/snippet}
          </RadioGroupPrimitive.Item>
        </span>
        <div class="grid gap-1">
          <label
            for={itemId}
            class={cn(
              'text-sm leading-5 font-medium text-foreground select-none',
              item.disabled && 'opacity-60'
            )}
          >
            {item.label}
          </label>
          {#if item.description}
            <p id={`${itemId}-description`} class="text-xs text-muted-foreground">
              {item.description}
            </p>
          {/if}
        </div>
      </div>
    {/each}
  {:else}
    {@render children?.()}
  {/if}
</RadioGroupPrimitive.Root>
