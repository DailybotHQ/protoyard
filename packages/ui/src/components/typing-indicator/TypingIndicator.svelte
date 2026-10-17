<script lang="ts">
import { cn } from '../../lib/cn.ts';

interface Props {
  /** Names of people currently typing; nothing renders when empty. */
  names: string[];
  /** Also show the text visually next to the dots. */
  showLabel?: boolean;
  class?: string;
}

let { names, showLabel = false, class: className }: Props = $props();

const text = $derived.by(() => {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return 'Several people are typing';
});
</script>

<!-- The status region stays mounted so the first "is typing" is announced. -->
<div role="status" class={cn('min-h-6', className)}>
  {#if names.length > 0}
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-2" aria-hidden="true">
        <span class="size-1.5 rounded-full bg-muted-foreground ui-typing-dot"></span>
        <span class="size-1.5 rounded-full bg-muted-foreground ui-typing-dot [animation-delay:150ms]"></span>
        <span class="size-1.5 rounded-full bg-muted-foreground ui-typing-dot [animation-delay:300ms]"></span>
      </span>
      <span class={showLabel ? undefined : 'sr-only'}>{text}</span>
    </div>
  {/if}
</div>
