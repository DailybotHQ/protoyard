<script lang="ts">
import { SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue } from 'texuli/select';
import type { FilterProperty } from './model.ts';

type Props = {
  properties: readonly FilterProperty[];
  value: string | null;
  onchange: (path: string | null) => void;
  label?: string;
};

let { properties, value, onchange, label = 'Break down by' }: Props = $props();
const choices = $derived(properties.filter((p) => p.type === 'string' || p.type === 'boolean'));
const selected = $derived(value ?? '__none');
const items = $derived([
  { value: '__none', label: 'None' },
  ...choices.map((property) => ({ value: property.path, label: property.label })),
]);
</script>

<div class="inline-flex items-center gap-2">
  <span class="text-xs text-muted-foreground">{label}</span>
  <SelectRoot {items} value={selected} onValueChange={(next) => onchange(next === '__none' ? null : next)}>
    <SelectTrigger aria-label={label} size="sm" class="h-8 min-w-28">
      <SelectValue placeholder="None" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="__none" label="None">None</SelectItem>
      {#each choices as p (p.path)}<SelectItem value={p.path} label={p.label}>{p.label}</SelectItem>{/each}
    </SelectContent>
  </SelectRoot>
</div>
