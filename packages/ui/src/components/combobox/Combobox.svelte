<script lang="ts">
import { Check, ChevronsUpDown } from '@lucide/svelte';
import { Combobox as ComboboxPrimitive } from 'bits-ui';
import { cn } from '../../lib/cn.ts';
import { floatingItem, floatingSurface } from '../../lib/overlay.ts';
import { fieldClasses } from '../input/input-classes.ts';
import type { SelectOption } from '../select/types.ts';

type InputProps = Omit<ComboboxPrimitive.InputProps, 'child' | 'defaultValue'>;

type Props = InputProps & {
  items: SelectOption[];
  value?: string;
  open?: boolean;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  contentClass?: string;
  /** Custom matcher; defaults to a case-insensitive label substring match. */
  filter?: (item: SelectOption, query: string) => boolean;
  onValueChange?: (value: string) => void;
};

let {
  items,
  value = $bindable(''),
  open = $bindable(false),
  placeholder = 'Search…',
  emptyText = 'No results',
  disabled = false,
  required = false,
  name,
  class: className,
  contentClass,
  filter = (item, query) => item.label.toLowerCase().includes(query.toLowerCase()),
  onValueChange,
  ref = $bindable(null),
  ...rest
}: Props = $props();

let query = $state('');
const selected = $derived(items.find((item) => item.value === value));
// Bits treats `inputValue` as the initial text only. When `value` changes from
// outside (a reset, a scenario load) mirror the label into the input — but
// never while the list is open, so an in-progress search isn't clobbered.
$effect(() => {
  const label = selected?.label ?? '';
  const input = ref;
  if (!(input instanceof HTMLInputElement) || open) return;
  if (input.value !== label) input.value = label;
  query = '';
});

const filtered = $derived(
  query.trim() === '' ? items : items.filter((item) => filter(item, query.trim()))
);
</script>

<ComboboxPrimitive.Root
  type="single"
  bind:value
  bind:open
  {items}
  {disabled}
  {required}
  {name}
  inputValue={selected?.label ?? ''}
  {onValueChange}
  onOpenChangeComplete={(isOpen) => {
    if (!isOpen) query = '';
  }}
>
  <div class={cn('relative', className)}>
    <ComboboxPrimitive.Input
      bind:ref
      {placeholder}
      oninput={(event) => {
        query = event.currentTarget.value;
      }}
      class={cn(fieldClasses, 'flex h-9 min-h-touch px-3 py-1 pr-10 sm:min-h-0')}
      {...rest}
    />
    <ComboboxPrimitive.Trigger
      aria-label="Show options"
      class="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronsUpDown class="size-4" aria-hidden="true" />
    </ComboboxPrimitive.Trigger>
  </div>
  <ComboboxPrimitive.Portal>
    <ComboboxPrimitive.Content
      sideOffset={4}
      class={cn(
        floatingSurface,
        'max-h-[min(20rem,var(--bits-combobox-content-available-height))] min-w-(--bits-combobox-anchor-width) overflow-hidden p-1',
        contentClass
      )}
    >
      <ComboboxPrimitive.Viewport class="max-h-[inherit]">
        {#each filtered as item (item.value)}
          <ComboboxPrimitive.Item
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
          </ComboboxPrimitive.Item>
        {:else}
          <p class="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        {/each}
      </ComboboxPrimitive.Viewport>
    </ComboboxPrimitive.Content>
  </ComboboxPrimitive.Portal>
</ComboboxPrimitive.Root>
