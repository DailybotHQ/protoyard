<script lang="ts">
import type { ComponentProps } from 'svelte';
import { selectValueClass, Select as TexuliSelect } from 'texuli/select';
import { refAttachment } from '../../lib/ref.ts';
import type { SelectOption } from './types.ts';

type TriggerProps = Omit<ComponentProps<typeof TexuliSelect.Trigger>, 'children' | 'child'> & {
  ref?: HTMLButtonElement | null;
};

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
  // No fallback: a caller may bind a value that starts undefined (a map entry);
  // a `$bindable('')` would throw (props_invalid_value). Read as ''.
  value = $bindable(),
  open = $bindable(false),
  placeholder = 'Select an option',
  disabled = false,
  required = false,
  name,
  class: className,
  contentClass,
  onValueChange,
  ref = $bindable(null),
  // The trigger (role="combobox") states `required` itself, from the root.
  'aria-required': _ariaRequired,
  ...rest
}: Props = $props();

const selected = $derived(items.find((item) => item.value === (value ?? '')));
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

<!-- A thin adapter: Texuli's styled Select, driven by an `items` list. -->
<TexuliSelect.Root
  type="single"
  bind:value={() => value ?? '', (next) => (value = next)}
  bind:open
  {items}
  {disabled}
  {required}
  {name}
  {onValueChange}
>
  <TexuliSelect.Trigger
    {@attach refAttachment<HTMLButtonElement>((node) => (ref = node))}
    class={className}
    {...rest}
    aria-describedby={describedBy}
  >
    <span
      id={valueId}
      class={selectValueClass({ placeholder: !selected })}
      data-placeholder={selected ? undefined : ''}
    >
      {selected?.label ?? placeholder}
    </span>
  </TexuliSelect.Trigger>
  <!-- The list opens in the top layer at the trigger's width; no portal is needed. -->
  <TexuliSelect.Content sideOffset={4} class={contentClass}>
    <TexuliSelect.Viewport>
      {#each items as item (item.value)}
        <TexuliSelect.Item value={item.value} label={item.label} disabled={item.disabled} />
      {/each}
    </TexuliSelect.Viewport>
  </TexuliSelect.Content>
</TexuliSelect.Root>
