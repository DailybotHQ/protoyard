<script lang="ts">
import type { BlockStateHost } from '@protoyard/blocks/interactive';
import { createMemoryBlockStateHost } from '@protoyard/blocks/interactive';
import type { Theme } from '@protoyard/core';
import { onMount } from 'svelte';
import { themeVariables } from '../../../themes/src/apply.ts';
import { BlockRenderer, setBlockHost } from '../../src/index.ts';

let {
  blocks,
  theme,
  mode = 'light',
  stateHost,
}: {
  blocks: readonly unknown[];
  theme: Theme;
  mode?: 'light' | 'dark';
  stateHost?: BlockStateHost;
} = $props();

const host = stateHost ?? createMemoryBlockStateHost();

setBlockHost({
  stateHost: host,
  documentId: 'a11y-catalog',
  viewerId: 'viewer',
  density: 'comfortable',
  canvasMode: 'flow',
});

let root = $state<HTMLDivElement | undefined>();

onMount(() => {
  if (!root) return;
  const vars = themeVariables({ theme, resolvedMode: mode });
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  root.dataset.pyMode = mode;
  root.dataset.pyTheme = theme.id;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
  root.style.background = vars['--tx-background'] ?? '';
  root.style.color = vars['--tx-foreground'] ?? '';
});
</script>

<div bind:this={root} class="min-h-0 p-4" data-a11y-harness data-theme={mode} data-theme-id={theme.id}>
  <BlockRenderer {blocks} />
</div>
