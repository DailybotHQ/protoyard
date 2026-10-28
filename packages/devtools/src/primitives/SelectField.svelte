<script lang="ts">
import { SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue } from 'texuli/select';

type Option = { value: string; label: string; disabled?: boolean };
let {
  options,
  value = $bindable(''),
  label,
  disabled = false,
  'aria-busy': ariaBusy,
  class: className,
  onchange,
}: {
  options: readonly Option[];
  value?: string;
  label: string;
  disabled?: boolean;
  'aria-busy'?: boolean | 'true' | 'false';
  class?: string;
  onchange?: (value: string) => void;
} = $props();
</script>

<SelectRoot type="single" bind:value {disabled} items={options} onValueChange={(next) => onchange?.(next)}>
  <SelectTrigger class={className} aria-label={label} aria-busy={ariaBusy} {disabled}>
  <SelectValue placeholder={label} />
  </SelectTrigger>
  <SelectContent>
    {#each options as option (option.value)}
      <SelectItem value={option.value} label={option.label} disabled={option.disabled} />
    {/each}
  </SelectContent>
</SelectRoot>
