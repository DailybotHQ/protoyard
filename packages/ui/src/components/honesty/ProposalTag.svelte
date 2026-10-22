<script lang="ts">
import { FlaskConical } from '@lucide/svelte';
import { cn } from '../../lib/cn.ts';

/**
 * Marks a feature that is a proposal still under review — not a product promise.
 * Always includes a word — never color alone.
 */
let {
  label = 'Proposal under review',
  title = 'This is a proposal under review, not a committed product feature.',
  class: className,
}: {
  label?: string;
  title?: string;
  class?: string;
} = $props();
</script>

<span
  class={cn(
    'inline-flex items-center gap-1 rounded-full border border-dashed border-info/50 bg-info/10 px-2.5 py-1 text-xs font-semibold text-info',
    className
  )}
  {title}
  data-py-tag="proposal"
>
  <FlaskConical class="size-3.5 shrink-0" aria-hidden="true" />
  {label}
</span>
