<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';

type Edge = 'top' | 'right' | 'bottom' | 'left';

type Props = HTMLAttributes<HTMLElement> & {
  /** Edges that receive `env(safe-area-inset-*)` padding (pair with `viewport-fit=cover`). */
  edges?: Edge[];
  as?: 'div' | 'section' | 'main' | 'header' | 'footer';
};

let {
  edges = ['top', 'right', 'bottom', 'left'],
  as = 'div',
  class: className,
  children,
  ...rest
}: Props = $props();

const edgeClass: Record<Edge, string> = {
  top: 'pt-safe',
  right: 'pr-safe',
  bottom: 'pb-safe',
  left: 'pl-safe',
};
</script>

<svelte:element this={as} class={cn(edges.map((edge) => edgeClass[edge]), className)} {...rest}>
  {@render children?.()}
</svelte:element>
