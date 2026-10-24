<script lang="ts">
import type { ValueSource } from '@protoyard/core';
import { Badge } from 'texuli/badge';

/**
 * Value-source chip on Texuli Badge. Labels stay the same for tests and AT.
 */
let { source }: { source: ValueSource } = $props();

const variants: Record<ValueSource, 'default' | 'secondary' | 'outline' | 'info'> = {
  override: 'default',
  preference: 'info',
  scenario: 'secondary',
  default: 'outline',
};
const hints: Record<ValueSource, string> = {
  override: 'Temporary DevTools override',
  preference: "Saved in the active persona's preferences",
  scenario: 'Defined by the loaded scenario',
  default: 'Prototype or platform default',
};
</script>

<Badge variant={variants[source]} title={hints[source]} data-py-devtools-source={source} class="uppercase tracking-wide font-mono text-[10px]">
  {source}<span class="sr-only">: {hints[source]}</span>
</Badge>
