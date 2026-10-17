<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import { type BadgeVariant, badgeVariants } from './badge-variants.ts';

type Props = HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant };

let { variant = 'default', class: className, children, ...rest }: Props = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)} {...rest}>{@render children?.()}</span>
