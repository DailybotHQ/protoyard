<script lang="ts">
import type { HTMLInputAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import type { WithElementRef } from '../../lib/types.ts';
import { fieldClasses } from './input-classes.ts';

type Props = WithElementRef<Omit<HTMLInputAttributes, 'files'>, HTMLInputElement> & {
  files?: FileList | null;
};

let {
  class: className,
  type = 'text',
  value = $bindable(),
  files = $bindable(null),
  ref = $bindable(null),
  ...rest
}: Props = $props();

const classes = $derived(
  cn(
    fieldClasses,
    'flex h-9 min-h-touch px-3 py-1 sm:min-h-0',
    'file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
    className
  )
);
</script>

{#if type === 'file'}
  <input bind:this={ref} type="file" bind:files class={cn('ui-input', classes)} {...rest} />
{:else}
  <input bind:this={ref} {type} bind:value class={cn('ui-input', classes)} {...rest} />
{/if}
