<script lang="ts">
import { messageParts } from '../messages.ts';

/**
 * A chrome message with its `{placeholders}` filled as text. Values named in
 * `strong` are bold and in `code` are monospace; nothing is rendered as HTML.
 */
let {
  template,
  values = {},
  strong = [],
  code = [],
}: {
  template: string;
  values?: Record<string, string | number>;
  strong?: readonly string[];
  code?: readonly string[];
} = $props();

const parts = $derived(messageParts(template, values));
</script>

{#each parts as part, i (i)}{#if part.value && code.includes(part.value)}<code class="rounded bg-muted px-1.5 py-0.5 text-sm">{part.text}</code>{:else if part.value && strong.includes(part.value)}<strong class="font-semibold">{part.text}</strong>{:else}{part.text}{/if}{/each}
