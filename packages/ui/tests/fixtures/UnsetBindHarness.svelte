<script lang="ts">
import type { Component } from 'svelte';

/**
 * Binds `value` to a map entry that starts undefined, as consumers do with
 * `bind:value={draft[id]}`. Reports the bound value.
 */
let {
  component: Target,
  props = {},
  onValue,
}: {
  component: Component<Record<string, unknown>>;
  props?: Record<string, unknown>;
  onValue?: (value: unknown) => void;
} = $props();

let drafts = $state<Record<string, string>>({});
$effect(() => {
  onValue?.(drafts.row);
});
</script>

<Target bind:value={drafts.row} {...props} />
