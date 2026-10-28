<script lang="ts">
import type { SelectOption } from '@protoyard/ui';
import { Select } from '@protoyard/ui';
import type { HTMLAttributes } from 'svelte/elements';

interface Props extends HTMLAttributes<HTMLButtonElement> {
  items: SelectOption[];
  value?: string;
  open?: boolean;
  placeholder?: string;
  onValueChange?: (value: string) => void;
}

let {
  items,
  value = $bindable(''),
  open = $bindable(false),
  placeholder = 'Select an option',
  onValueChange,
  ...rest
}: Props = $props();

let lastValue = value;
$effect(() => {
  const selectedValue = value;
  if (selectedValue !== lastValue) {
    lastValue = selectedValue;
    setTimeout(() => (open = false), 0);
  }
});
</script>

<Select items={items} bind:value bind:open {onValueChange} {placeholder} data-value={value} {...rest} />
