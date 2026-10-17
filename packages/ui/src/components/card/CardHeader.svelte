<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import type { WithElementRef } from '../../lib/types.ts';

type Props = WithElementRef<HTMLAttributes<HTMLDivElement>>;

let { class: className, ref = $bindable(null), children, ...rest }: Props = $props();
</script>

<div bind:this={ref} class={cn('grid gap-1.5 px-5 pt-5 [&:last-child]:pb-5', className)} {...rest}>
  {@render children?.()}
</div>
