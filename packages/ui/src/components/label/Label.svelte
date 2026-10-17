<script lang="ts">
import type { HTMLLabelAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import type { WithElementRef } from '../../lib/types.ts';

type Props = WithElementRef<HTMLLabelAttributes, HTMLLabelElement> & {
  /** Adds a visual required marker; set `required` on the control itself for semantics. */
  required?: boolean;
};

let {
  class: className,
  required = false,
  ref = $bindable(null),
  children,
  ...rest
}: Props = $props();
</script>

<label
  bind:this={ref}
  class={cn(
    'inline-flex items-center gap-1 text-sm leading-none font-medium text-foreground select-none',
    'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
    className
  )}
  {...rest}
>
  {@render children?.()}
  {#if required}<span aria-hidden="true" class="text-destructive">*</span>{/if}
</label>
