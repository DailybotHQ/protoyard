<script lang="ts">
import { Inbox } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import type { IconComponent } from '../../lib/types.ts';

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: string;
  description?: string;
  icon?: IconComponent;
  action?: Snippet;
  size?: 'sm' | 'md';
};

let {
  title,
  description,
  icon: Icon = Inbox,
  action,
  size = 'md',
  class: className,
  ...rest
}: Props = $props();
</script>

<div
  class={cn(
    'flex flex-col items-center justify-center text-center',
    size === 'sm' ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
    className
  )}
  {...rest}
>
  <div
    class={cn(
      'flex items-center justify-center rounded-full bg-muted text-muted-foreground',
      size === 'sm' ? 'size-10' : 'size-12'
    )}
    aria-hidden="true"
  >
    <Icon class={size === 'sm' ? 'size-5' : 'size-6'} />
  </div>
  <div class="grid max-w-sm gap-1">
    <p class="font-heading text-base font-semibold text-foreground">{title}</p>
    {#if description}<p class="text-sm text-muted-foreground">{description}</p>{/if}
  </div>
  {#if action}<div class="mt-2 flex flex-wrap justify-center gap-2">{@render action()}</div>{/if}
</div>
