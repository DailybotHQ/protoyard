<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import type { WithElementRef } from '../../lib/types.ts';

type Props = WithElementRef<HTMLAttributes<HTMLDivElement>>;

let { class: className, ref = $bindable(null), children, ...rest }: Props = $props();
</script>

<div bind:this={ref} class={cn('flex items-center gap-2 border-t border-border px-5 py-3', className)} {...rest}>
  {@render children?.()}
</div>
