<script lang="ts">
import type { ValueSource } from '@protoyard/core';

let { source }: { source: ValueSource } = $props();

const styles: Record<ValueSource, string> = {
  override: 'bg-primary text-primary-foreground ring-primary',
  preference: 'bg-info text-info-foreground ring-info',
  scenario: 'bg-secondary text-secondary-foreground ring-border',
  default: 'bg-transparent text-muted-foreground ring-border',
};
const hints: Record<ValueSource, string> = {
  override: 'Temporary DevTools override',
  preference: "Saved in the active persona's preferences",
  scenario: 'Defined by the loaded scenario',
  default: 'Prototype or platform default',
};
</script>

<span
  class="inline-flex shrink-0 items-center rounded px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset {styles[source]}"
  title={hints[source]}
>
  {source}<span class="sr-only">: {hints[source]}</span>
</span>
