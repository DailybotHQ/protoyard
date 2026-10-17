<script lang="ts">
import { Check, Minus } from '@lucide/svelte';
import { Checkbox as CheckboxPrimitive } from 'bits-ui';
import { cn } from '../../lib/cn.ts';

type Props = Omit<CheckboxPrimitive.RootProps, 'children' | 'child'> & {
  /** Optional visible label rendered next to the box and wired with `for`. */
  label?: string;
  description?: string;
};

const uid = $props.id();

let {
  checked = $bindable(false),
  indeterminate = $bindable(false),
  ref = $bindable(null),
  id = `checkbox-${uid}`,
  label,
  description,
  class: className,
  ...rest
}: Props = $props();
</script>

{#snippet box()}
  <CheckboxPrimitive.Root
    bind:checked
    bind:indeterminate
    bind:ref
    {id}
    aria-describedby={description ? `${id}-description` : undefined}
    class={cn(
      'peer relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-surface text-primary-foreground shadow-soft',
      'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary',
      'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
      // Invisible hit area keeps the 16px box while meeting 44px touch targets.
      "before:absolute before:-inset-3.5 before:content-[''] sm:before:-inset-1",
      label ? undefined : className
    )}
    {...rest}
  >
    {#snippet children({ checked: isChecked, indeterminate: isIndeterminate })}
      {#if isIndeterminate}
        <Minus class="size-3.5" strokeWidth={3} aria-hidden="true" />
      {:else if isChecked}
        <Check class="size-3.5" strokeWidth={3} aria-hidden="true" />
      {/if}
    {/snippet}
  </CheckboxPrimitive.Root>
{/snippet}

{#if label}
  <div class={cn('flex items-start gap-2.5', className)}>
    <span class="flex h-5 items-center">{@render box()}</span>
    <div class="grid gap-1">
      <label for={id} class="text-sm leading-5 font-medium text-foreground select-none">
        {label}
      </label>
      {#if description}
        <p id={`${id}-description`} class="text-xs text-muted-foreground">{description}</p>
      {/if}
    </div>
  </div>
{:else}
  {@render box()}
{/if}
