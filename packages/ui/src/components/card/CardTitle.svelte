<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import type { WithElementRef } from '../../lib/types.ts';

type Props = WithElementRef<HTMLAttributes<HTMLHeadingElement>> & {
  /** Heading level so card titles fit the page outline. */
  level?: 2 | 3 | 4 | 5 | 6;
};

let { class: className, level = 3, ref = $bindable(null), children, ...rest }: Props = $props();
</script>

<svelte:element
  this={`h${level}`}
  bind:this={ref}
  class={cn('font-heading text-base leading-tight font-semibold', className)}
  {...rest}
>
  {@render children?.()}
</svelte:element>
