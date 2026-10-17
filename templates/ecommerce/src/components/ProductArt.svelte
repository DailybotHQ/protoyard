<script lang="ts">
import { Armchair, Backpack, Laptop, NotebookPen, Tent } from '@lucide/svelte';

/**
 * Generated product artwork (no image assets, no external URLs): a soft
 * gradient from the product's hue with its category icon.
 */
let {
  hue,
  category,
  name,
  class: className = '',
  size = 'md',
}: {
  hue: number;
  category: string;
  name: string;
  class?: string;
  size?: 'sm' | 'md' | 'lg';
} = $props();

const icons = {
  bags: Backpack,
  stationery: NotebookPen,
  home: Armchair,
  outdoors: Tent,
  tech: Laptop,
};
const Icon = $derived(icons[category as keyof typeof icons] ?? Backpack);
const iconSize = { sm: 'size-6', md: 'size-12', lg: 'size-20' };
</script>

<div
  role="img"
  aria-label={`Illustration of ${name}`}
  class={['grid place-items-center overflow-hidden', className]}
  style={`background: radial-gradient(circle at 30% 25%, hsl(${hue} 80% 88%), hsl(${(hue + 35) % 360} 55% 70%));`}
>
  <Icon class={[iconSize[size], 'text-slate-900/55']} aria-hidden="true" strokeWidth={1.5} />
</div>
