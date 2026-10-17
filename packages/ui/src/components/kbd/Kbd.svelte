<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';

type Props = HTMLAttributes<HTMLElement>;

let { class: className, children, ...rest }: Props = $props();
</script>

<kbd
  class={cn(
    'inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-sm border border-border border-b-2 bg-muted px-1 font-mono text-[0.7rem] font-medium text-muted-foreground',
    className
  )}
  {...rest}>{@render children?.()}</kbd
>
