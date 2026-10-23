<script lang="ts">
import { Check, Minus } from '@lucide/svelte';
import { CheckboxRoot } from '@texuli/primitives/checkbox';
import type { ComponentProps } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { refAttachment } from '../../lib/ref.ts';

type Props = Omit<ComponentProps<typeof CheckboxRoot>, 'children' | 'child'> & {
  ref?: HTMLButtonElement | null;
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
  <CheckboxRoot
    {@attach refAttachment<HTMLButtonElement>((node) => (ref = node))}
    bind:checked
    bind:indeterminate
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
  </CheckboxRoot>
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
