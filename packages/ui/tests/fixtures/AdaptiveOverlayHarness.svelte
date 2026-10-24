<script lang="ts">
import AdaptiveOverlay from '../../src/components/adaptive-overlay/AdaptiveOverlay.svelte';
import type {
  AdaptiveOverlayMode,
  AdaptiveOverlayWideKind,
} from '../../src/components/adaptive-overlay/resolve.ts';
import { Button } from '../../src/index.ts';

let {
  open = $bindable(false),
  kind = 'dialog' as AdaptiveOverlayWideKind,
  force = 'auto' as AdaptiveOverlayMode,
  host = null as Element | null,
  breakpoint = 768,
  title = 'Filters',
}: {
  open?: boolean;
  kind?: AdaptiveOverlayWideKind;
  force?: AdaptiveOverlayMode;
  host?: Element | null;
  breakpoint?: number;
  title?: string;
} = $props();
</script>

<Button onclick={() => (open = true)}>Open overlay</Button>
<AdaptiveOverlay bind:open {title} {kind} {force} {host} {breakpoint} description="Choose options">
  <p>Overlay body</p>
  {#snippet footer()}
    <Button onclick={() => (open = false)}>Done</Button>
  {/snippet}
</AdaptiveOverlay>
