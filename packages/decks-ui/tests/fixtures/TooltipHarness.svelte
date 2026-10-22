<script lang="ts">
import { deckControlFor } from '@protoyard/decks';
import { onDestroy } from 'svelte';
import ChromeTooltip from '../../src/chrome/ChromeTooltip.svelte';
import { controlTooltip, createDeckTooltip } from '../../src/chrome/tooltip.ts';

/** Two toolbar buttons sharing one tooltip, as the deck toolbar wires them. */
let {
  onaction,
  suppressed = () => false,
}: {
  onaction: (action: string) => void;
  suppressed?: () => boolean;
} = $props();

// svelte-ignore state_referenced_locally -- the harness mounts once with fixed options.
const tooltip = createDeckTooltip({ suppressed });
onDestroy(() => tooltip.destroy());
const fullscreen = deckControlFor('fullscreen');
const laser = deckControlFor('laser');
</script>

<div role="toolbar" aria-label="Presenting tools">
  <button type="button" data-tool="fullscreen" aria-label={fullscreen.label} onclick={() => onaction('fullscreen')} {@attach tooltip.anchor(() => controlTooltip(fullscreen))}>F</button>
  <button type="button" data-tool="laser" aria-label={laser.label} onclick={() => onaction('laser')} {@attach tooltip.anchor(() => controlTooltip(laser))}>L</button>
</div>
<ChromeTooltip {tooltip} />
