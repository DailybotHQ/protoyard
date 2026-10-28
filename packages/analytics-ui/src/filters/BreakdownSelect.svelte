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
</script>

<div class="inline-flex items-center gap-2">
  <span class="text-xs text-muted-foreground">{label}</span>
  <SelectRoot value={selected} onValueChange={(next) => onchange(next === '__none' ? null : next)}>
    <SelectTrigger aria-label={label} size="sm" class="h-8 min-w-28">
      <SelectValue placeholder="None" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="__none">None</SelectItem>
      {#each choices as p (p.path)}<SelectItem value={p.path}>{p.label}</SelectItem>{/each}
    </SelectContent>
  </SelectRoot>
</div>
