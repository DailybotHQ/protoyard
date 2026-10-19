<script lang="ts">
import { Select, type SelectOption } from '@protoyard/ui';

interface Props {
  label: string;
  description?: string;
  items: SelectOption[];
  value?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}

let {
  label,
  description,
  items,
  value = $bindable(''),
  disabled = false,
  onValueChange,
}: Props = $props();
const uid = $props.id();
const id = `pref-${uid}`;
</script>

<div class="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
  <div class="min-w-0">
    <p id={`${id}-label`} class="text-sm font-medium">{label}</p>
    {#if description}<p id={`${id}-hint`} class="mt-0.5 text-sm text-muted-foreground">{description}</p>{/if}
  </div>
  <Select
    {items}
    bind:value
    {disabled}
    {onValueChange}
    class="w-full sm:w-56"
    aria-labelledby={`${id}-label`}
    aria-describedby={description ? `${id}-hint` : undefined}
  />
</div>
