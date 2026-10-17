<script lang="ts">
import type { HTMLTextareaAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import type { WithElementRef } from '../../lib/types.ts';
import { fieldClasses } from '../input/input-classes.ts';

type Props = WithElementRef<HTMLTextareaAttributes, HTMLTextAreaElement>;

let { class: className, value = $bindable(), ref = $bindable(null), ...rest }: Props = $props();
</script>

<textarea
  bind:this={ref}
  bind:value
  class={cn(fieldClasses, 'flex min-h-20 px-3 py-2 field-sizing-content', className)}
  {...rest}
></textarea>
