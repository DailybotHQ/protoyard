<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import type { WithElementRef } from '../../lib/types.ts';

type Props = WithElementRef<HTMLAttributes<HTMLParagraphElement>>;

let { class: className, ref = $bindable(null), children, ...rest }: Props = $props();
</script>

<p bind:this={ref} class={cn('text-sm text-muted-foreground', className)} {...rest}>
  {@render children?.()}
</p>
