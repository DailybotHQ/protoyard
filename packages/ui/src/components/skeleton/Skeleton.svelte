<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';

type Props = HTMLAttributes<HTMLDivElement>;

let { class: className, ...rest }: Props = $props();
</script>

<div aria-hidden="true" class={cn('rounded-md bg-muted ui-skeleton', className)} {...rest}></div>
