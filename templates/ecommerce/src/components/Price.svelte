<script lang="ts">
import { Text } from 'texuli/typography';
import { money } from '../lib/format.ts';

/** A price with tabular figures; `size="lg"` is the product page's large figure. */
let {
  cents,
  compareAt = null,
  size = 'md',
  class: className = '',
}: { cents: number; compareAt?: number | null; size?: 'md' | 'lg'; class?: string } = $props();
</script>

<span class={['inline-flex items-baseline gap-2', className]}>
  <Text as="span" size={size === 'lg' ? 'figure' : 'md'} weight="semibold" tabular>{money(cents)}</Text>
  {#if compareAt && compareAt > cents}
    <s><Text as="span" size="sm" tone="muted" tabular><span class="sr-only">was </span>{money(compareAt)}</Text></s>
  {/if}
</span>
