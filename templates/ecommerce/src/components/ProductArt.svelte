<script lang="ts">
import { Armchair, Backpack, Laptop, NotebookPen, Tent } from '@lucide/svelte';
import { Icon } from 'texuli/icons';
import { Box } from 'texuli/typography';

/**
 * Generated product artwork (no image assets, no external URLs): a muted
 * design-system surface with the category icon drawn in the product's hue.
 * The hue is data, so it reaches the icon through its `color` prop; a sold
 * out product shows a neutral icon instead.
 */
let {
  hue,
  category,
  name,
  class: className = '',
  size = 'md',
  radius = 'none',
  bordered = false,
  soldOut = false,
}: {
  hue: number;
  category: string;
  name: string;
  class?: string;
  size?: 'sm' | 'md' | 'lg';
  radius?: 'none' | 'lg' | 'xl';
  bordered?: boolean;
  soldOut?: boolean;
} = $props();

const icons = {
  bags: Backpack,
  stationery: NotebookPen,
  home: Armchair,
  outdoors: Tent,
  tech: Laptop,
};
const CategoryIcon = $derived(icons[category as keyof typeof icons] ?? Backpack);
const iconSize = { sm: 'size-6', md: 'size-12', lg: 'size-20' };
</script>

<Box
  role="img"
  aria-label={`Illustration of ${name}`}
  surface="muted"
  {radius}
  border={bordered ? 'default' : 'none'}
  padding="none"
  class={['grid place-items-center overflow-hidden', className]}
>
  <Icon
    icon={CategoryIcon}
    tone={soldOut ? 'neutral' : undefined}
    color={soldOut ? null : `hsl(${hue} 55% 50%)`}
    class={iconSize[size]}
    strokeWidth={1.5}
    aria-hidden="true"
  />
</Box>
