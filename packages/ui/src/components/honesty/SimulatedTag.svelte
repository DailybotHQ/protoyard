<script lang="ts">
import { Sparkles } from '@lucide/svelte';
import { cn } from '../../lib/cn.ts';

/**
 * Marks a step that is simulated in the prototype (sign-in, billing, AI, …).
 * Always includes a word — never color alone (AGENTS.md honesty).
 */
let {
  label = 'Simulated',
  title = 'This step is simulated. It is not real security, billing or AI.',
  class: className,
}: {
  label?: string;
  /** Longer explanation for hover / assistive tech via the title attribute. */
  title?: string;
  class?: string;
} = $props();
</script>

<span
  class={cn(
    'inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/20 px-2.5 py-1 text-xs font-semibold text-warning-foreground',
    className
  )}
  {title}
  data-py-tag="simulated"
>
  <Sparkles class="size-3.5 shrink-0" aria-hidden="true" />
  {label}
</span>
