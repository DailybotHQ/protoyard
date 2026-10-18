<script lang="ts">
import type { ShellHostVariant } from '@protoyard/core';
import { getDevice } from '@protoyard/core';
import SidePanelFrame from '../../src/shell/frames/SidePanelFrame.svelte';

let {
  hostVariant = 'chat-workspace' as ShellHostVariant,
}: {
  hostVariant?: ShellHostVariant;
} = $props();

const spec = getDevice('laptop-window')!;
</script>

<div
  data-py-shell-part="device"
  style:position="relative"
  style:width="{spec.width}px"
  style:height="{spec.height}px"
>
  <div data-py-shell-part="screen" tabindex="-1" data-testid="side-panel-screen">
    <p>Plugin app body</p>
  </div>
  <SidePanelFrame {spec} shell="side-panel" {hostVariant} />
</div>
