<script lang="ts">
import type { ComponentProps } from 'svelte';
import { Combobox as TexuliCombobox } from 'texuli/combobox';
import { refAttachment } from '../../lib/ref.ts';
import type { SelectOption } from '../select/types.ts';

type InputProps = Omit<ComponentProps<typeof TexuliCombobox.Input>, 'child' | 'value' | 'size'>;

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
  ref?: HTMLInputElement | null;
};

let {
  items,
  // No fallback: a caller may bind a value that starts undefined (a map entry);
  // a `$bindable('')` would throw (props_invalid_value). Read as ''.
  value = $bindable(),
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

const selected = $derived(items.find((item) => item.value === value));
// The input's text: the search while the list is open, the chosen label otherwise.
// svelte-ignore state_referenced_locally
let inputText = $state(selected?.label ?? '');

// When `value` changes from outside (a reset, a scenario load), or the list
// closes without a choice, the input shows the chosen label again. Never while
// the list is open, so a search in progress is kept.
$effect(() => {
  const label = selected?.label ?? '';
  if (!open && inputText !== label) inputText = label;
});

// The chosen label in the input is not a search: opening the list then shows every option.
const matches = (item: SelectOption, query: string): boolean =>
  query === (selected?.label ?? '').trim() || filter(item, query);
</script>

<!-- A thin adapter: Texuli's styled Combobox, driven by an `items` list. -->
<TexuliCombobox.Root
  bind:value={() => value ?? '', (next) => (value = typeof next === 'string' ? next : '')}
  bind:open
  bind:inputValue={inputText}
  {items}
  filter={matches}
  {disabled}
  {name}
  {required}
  onValueChange={(next) => onValueChange?.(typeof next === 'string' ? next : '')}
>
  <TexuliCombobox.Field {disabled} class={className}>
    <TexuliCombobox.Input
      {@attach refAttachment<HTMLInputElement>((node) => (ref = node))}
      {placeholder}
      {...rest}
    />
    <TexuliCombobox.Trigger aria-label="Show options" />
  </TexuliCombobox.Field>
  <!-- The list opens in the top layer at the field's width; no portal is needed. -->
  <TexuliCombobox.Content sideOffset={4} class={contentClass}>
    <TexuliCombobox.Viewport>
      {#snippet children(item)}
        <TexuliCombobox.Item value={item.value} label={item.label} disabled={item.disabled} />
      {/snippet}
    </TexuliCombobox.Viewport>
    <TexuliCombobox.Empty announce={emptyText}>{emptyText}</TexuliCombobox.Empty>
  </TexuliCombobox.Content>
</TexuliCombobox.Root>
