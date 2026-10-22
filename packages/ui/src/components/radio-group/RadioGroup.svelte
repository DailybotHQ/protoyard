<script lang="ts">
import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
import { cn } from '../../lib/cn.ts';
import type { RadioOption } from './types.ts';

type Props = Omit<RadioGroupPrimitive.RootProps, 'child'> & {
  /** Rendered as labelled radio items; use `children` with `RadioGroupItem` for custom layouts. */
  items?: RadioOption[];
  /**
   * `default` = classic radio + label row.
   * `card` = full-width selectable cards (title, description, indicator).
   */
  variant?: 'default' | 'card';
};

const uid = $props.id();

let {
  value = $bindable(''),
  ref = $bindable(null),
  items,
  orientation = 'vertical',
  variant = 'default',
  class: className,
  children,
  ...rest
}: Props = $props();

const isCard = $derived(variant === 'card');
</script>

<RadioGroupPrimitive.Root
  bind:value
  bind:ref
  {orientation}
  data-variant={variant}
  class={cn(
    isCard
      ? orientation === 'horizontal'
        ? 'flex flex-wrap gap-3'
        : 'grid gap-3'
      : orientation === 'horizontal'
        ? 'flex flex-wrap gap-4'
        : 'grid gap-3',
    className
  )}
  {...rest}
>
  {#if items}
    {#each items as item, index (item.value)}
      {@const itemId = `radio-${uid}-${index}`}
      {#if isCard}
        <label
          for={itemId}
          data-disabled={item.disabled ? 'true' : undefined}
          class={cn(
            'relative flex w-full cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3.5 text-left shadow-soft transition-colors',
            'hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
            'has-[:checked]:border-primary has-[:checked]:bg-primary/5',
            'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
            orientation === 'horizontal' && 'min-w-[12rem] flex-1'
          )}
        >
          <span class="mt-0.5 flex shrink-0">
            <RadioGroupPrimitive.Item
              id={itemId}
              value={item.value}
              disabled={item.disabled}
              aria-describedby={item.description ? `${itemId}-description` : undefined}
              class={cn(
                'peer relative inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-input bg-surface',
                'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'data-[state=checked]:border-primary disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {#snippet children({ checked })}
                {#if checked}<span class="size-2.5 rounded-full bg-primary"></span>{/if}
              {/snippet}
            </RadioGroupPrimitive.Item>
          </span>
          <span class="grid min-w-0 flex-1 gap-0.5">
            <span class="text-sm leading-5 font-semibold text-foreground">{item.label}</span>
            {#if item.description}
              <span id={`${itemId}-description`} class="text-xs leading-5 text-muted-foreground">
                {item.description}
              </span>
            {/if}
          </span>
        </label>
      {:else}
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
      {/if}
    {/each}
  {:else}
    {@render children?.()}
  {/if}
</RadioGroupPrimitive.Root>
