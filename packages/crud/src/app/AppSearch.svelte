<script lang="ts">
import { Search } from '@lucide/svelte';
import { Button } from '@protoyard/ui';
import SearchPalette from '../SearchPalette.svelte';
import { useBlueprintApp } from './context.ts';

const { runtime, blueprint } = useBlueprintApp();

function openPalette(event: MouseEvent) {
  event.preventDefault();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
}
</script>

<Button size="sm" variant="outline" onclick={openPalette}>
  <Search class="size-4" aria-hidden="true" />
  <!-- The name starts with the visible "Search" (WCAG 2.5.3); phones hide the word visually only. -->
  <span class="sr-only sm:not-sr-only">Search</span>
  <span class="sr-only">records (Command or Control K)</span>
  <kbd aria-hidden="true" class="ml-1 hidden rounded border border-border px-1 text-[0.65rem] text-muted-foreground sm:inline">⌘K</kbd>
</Button>

<SearchPalette {runtime} {blueprint} />
