<script lang="ts">
import type { FilterProperty } from './model.ts';

type Props = {
  properties: readonly FilterProperty[];
  /** Selected property path, or null for no breakdown. */
  value: string | null;
  onchange: (path: string | null) => void;
  label?: string;
};

let { properties, value, onchange, label = 'Break down by' }: Props = $props();

const uid = $props.id();
// Splitting by a number or a date would make one series per value: offer categories only.
const choices = $derived(properties.filter((p) => p.type === 'string' || p.type === 'boolean'));
</script>

<div class="inline-flex items-center gap-2">
  <label for="{uid}-breakdown" class="text-xs text-muted-foreground">{label}</label>
  <select
    id="{uid}-breakdown"
    class="h-8 rounded-md border border-input bg-surface px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    value={value ?? ''}
    onchange={(e) => onchange(e.currentTarget.value || null)}
  >
    <option value="">None</option>
    {#each choices as p (p.path)}<option value={p.path}>{p.label}</option>{/each}
  </select>
</div>
