<script lang="ts">
import { Switch as SwitchPrimitive } from 'bits-ui';
import { cn } from '../../lib/cn.ts';

type Props = Omit<SwitchPrimitive.RootProps, 'children' | 'child'> & {
  label?: string;
  description?: string;
};

const uid = $props.id();

let {
  checked = $bindable(false),
  ref = $bindable(null),
  id = `switch-${uid}`,
  label,
  description,
  class: className,
  ...rest
}: Props = $props();
</script>

{#snippet control()}
  <SwitchPrimitive.Root
    bind:checked
    bind:ref
    {id}
    aria-describedby={description ? `${id}-description` : undefined}
    class={cn(
      'peer relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-soft',
      'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input disabled:cursor-not-allowed disabled:opacity-50',
      "before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] sm:before:-inset-y-1",
      label ? undefined : className
    )}
    {...rest}
  >
    <SwitchPrimitive.Thumb
      class="pointer-events-none block size-4 rounded-full bg-surface shadow-soft ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5 dark:data-[state=checked]:bg-primary-foreground"
    />
  </SwitchPrimitive.Root>
{/snippet}

{#if label}
  <div class={cn('flex items-start justify-between gap-4', className)}>
    <div class="grid gap-1">
      <label for={id} class="text-sm leading-5 font-medium text-foreground select-none">{label}</label>
      {#if description}
        <p id={`${id}-description`} class="text-xs text-muted-foreground">{description}</p>
      {/if}
    </div>
    <span class="flex h-5 items-center">{@render control()}</span>
  </div>
{:else}
  {@render control()}
{/if}
