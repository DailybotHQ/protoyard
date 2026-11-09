<script lang="ts" generics="T extends string">
import { ToggleGroup, ToggleGroupItem } from 'texuli/toggle';

/**
 * Segmented control: the design system's single-choice toggle group (a muted
 * track with the pressed segment raised), with roving arrow-key focus. One
 * segment is always pressed.
 */
let {
  label,
  options,
  value = $bindable(),
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange?: (value: T) => void;
} = $props();

function select(next: string | string[]): void {
  const picked = Array.isArray(next) ? next[0] : next;
  if (!picked || picked === value) return;
  value = picked as T;
  onChange?.(value);
}
</script>

<ToggleGroup
  type="single"
  aria-label={label}
  deselectable={false}
  class="flex w-full min-w-0"
  value={value ?? ''}
  onValueChange={select}
>
  {#each options as option (option.value)}
    <ToggleGroupItem value={option.value} class="min-h-touch min-w-0 flex-1">{option.label}</ToggleGroupItem>
  {/each}
</ToggleGroup>
