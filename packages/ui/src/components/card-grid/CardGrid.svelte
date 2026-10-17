<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';

type Props = HTMLAttributes<HTMLElement> & {
  /** Minimum card width before the grid adds a column, e.g. "16rem". */
  minItemWidth?: string;
  gap?: 'sm' | 'md' | 'lg';
  /** Use `ul` when children are `<li>` items (lists are announced with a count). */
  as?: 'div' | 'ul' | 'section';
};

let {
  minItemWidth = '16rem',
  gap = 'md',
  as = 'div',
  class: className,
  style,
  children,
  ...rest
}: Props = $props();

const gaps = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };
</script>

<svelte:element
  this={as}
  class={cn('grid', gaps[gap], as === 'ul' && 'list-none p-0', className)}
  style={`grid-template-columns: repeat(auto-fill, minmax(min(100%, ${minItemWidth}), 1fr));${style ? ` ${style}` : ''}`}
  {...rest}
>
  {@render children?.()}
</svelte:element>
