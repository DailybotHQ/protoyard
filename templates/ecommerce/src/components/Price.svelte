<script lang="ts">
import { money } from '../lib/format.ts';

let {
  cents,
  compareAt = null,
  class: className = '',
}: { cents: number; compareAt?: number | null; class?: string } = $props();
</script>

<span class={['inline-flex items-baseline gap-2 tabular-nums', className]}>
  <span class="font-semibold">{money(cents)}</span>
  {#if compareAt && compareAt > cents}
    <s class="text-sm text-muted-foreground"><span class="sr-only">was </span>{money(compareAt)}</s>
  {/if}
</span>
