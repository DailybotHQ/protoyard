<script lang="ts">
import { Check, ChevronDown } from '@lucide/svelte';
import { Select as SelectPrimitive } from 'bits-ui';
import { cn } from '../../lib/cn.ts';
import { floatingItem, floatingSurface } from '../../lib/overlay.ts';
import { fieldClasses } from '../input/input-classes.ts';
import type { SelectOption } from './types.ts';

type TriggerProps = Omit<SelectPrimitive.TriggerProps, 'children' | 'child'>;

type Props = TriggerProps & {
  items: SelectOption[];
  value?: string;
  open?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Form field name; renders a hidden input so the value submits with forms. */
  name?: string;
  contentClass?: string;
  onValueChange?: (value: string) => void;
};

let {
  items,
  value = $bindable(''),
  open = $bindable(false),
  placeholder = 'Select an option',
  disabled = false,
  required = false,
  name,
  class: className,
  contentClass,
  onValueChange,
  ref = $bindable(null),
  // The trigger is a button, where aria-required is not allowed; `required`
  // is enforced through the hidden form input instead (FormField passes both).
  'aria-required': _ariaRequired,
  ...rest
}: Props = $props();

const selected = $derived(items.find((item) => item.value === value));
const uid = $props.id();
const valueId = `select-value-${uid}`;
// The accessible name stays the field label (aria-label / <label for>); the
// current value is announced as the description, so SRs read "Stage, combobox, Won".
// role="combobox" (the ARIA select-only combobox) keeps the visible value from
// being judged as the name (WCAG 2.5.3, axe label-content-name-mismatch).
const describedBy = $derived(
  [rest['aria-describedby'], selected ? valueId : null].filter(Boolean).join(' ') || undefined
);
</script>

<SelectPrimitive.Root
  type="single"
  bind:value
  bind:open
  {items}
  {disabled}
  {required}
  {name}
  {onValueChange}
>
  <SelectPrimitive.Trigger
    bind:ref
    class={cn(
      fieldClasses,
      'flex h-9 min-h-touch items-center justify-between gap-2 px-3 py-1 text-left sm:min-h-0',
      'data-placeholder:text-muted-foreground',
      className
    )}
    {...rest}
    role="combobox"
    aria-describedby={describedBy}
  >
    <span id={valueId} class={cn('truncate', !selected && 'text-muted-foreground')}>
      {selected?.label ?? placeholder}
    </span>
    <ChevronDown class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </SelectPrimitive.Trigger>
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      sideOffset={4}
      class={cn(
        floatingSurface,
        'max-h-[min(20rem,var(--bits-select-content-available-height))] min-w-(--bits-select-anchor-width) overflow-hidden p-1',
        contentClass
      )}
    >
      <SelectPrimitive.Viewport class="max-h-[inherit]">
        {#each items as item (item.value)}
          <SelectPrimitive.Item
            value={item.value}
            label={item.label}
            disabled={item.disabled}
            class={cn(floatingItem, 'pr-8')}
          >
            {#snippet children({ selected: isSelected })}
              <span class="truncate">{item.label}</span>
              {#if isSelected}
                <Check class="absolute right-2 text-primary" aria-hidden="true" />
              {/if}
            {/snippet}
          </SelectPrimitive.Item>
        {/each}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
</SelectPrimitive.Root>
