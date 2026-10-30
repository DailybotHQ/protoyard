<script lang="ts">
import type { Component } from 'svelte';
import { RadioGroup } from '../../src/index.ts';

/**
 * Renders one `@protoyard/ui` component with `bind:ref` and the caller's
 * props (rest attributes and handlers included), and reports the bound ref.
 * `snippets` names props that get a generic snippet: a button that spreads
 * the `props` a trigger snippet receives. `inRadioGroup` renders the target
 * inside a RadioGroup (for its item part).
 */
let {
  component: Target,
  props = {},
  snippets = [],
  inRadioGroup = false,
  onRef,
}: {
  component: Component<Record<string, unknown>>;
  props?: Record<string, unknown>;
  snippets?: readonly string[];
  inRadioGroup?: boolean;
  onRef?: (ref: unknown) => void;
} = $props();

let ref = $state<unknown>(null);
$effect(() => {
  onRef?.(ref);
});

const all = $derived({
  ...props,
  ...Object.fromEntries(snippets.map((name) => [name, generic])),
});
</script>

{#snippet generic(arg?: unknown)}
  <button type="button" {...((arg as { props?: Record<string, unknown> } | undefined)?.props ?? {})}>
    Item
  </button>
{/snippet}

{#if inRadioGroup}
  <RadioGroup aria-label="Plan" value="a">
    <Target bind:ref {...all} />
  </RadioGroup>
{:else}
  <Target bind:ref {...all} />
{/if}
