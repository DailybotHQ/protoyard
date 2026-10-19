<script lang="ts">
import { RadioGroup, type RadioOption } from '@protoyard/ui';

interface Props {
  label: string;
  description?: string;
  items: RadioOption[];
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
</script>

<fieldset class="py-3" aria-describedby={description ? `pref-${uid}-hint` : undefined}>
  <legend class="text-sm font-medium">{label}</legend>
  {#if description}<p id={`pref-${uid}-hint`} class="mt-0.5 mb-2 text-sm text-muted-foreground">{description}</p>{/if}
  <RadioGroup {items} bind:value {disabled} {onValueChange} aria-label={label} class="mt-2" />
</fieldset>
