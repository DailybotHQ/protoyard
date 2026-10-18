<script lang="ts">
import { getDevice } from '@protoyard/core';
import WidgetHostFrame from '../../src/shell/frames/WidgetHostFrame.svelte';

/** Device + screen sibling layout matching ShellHost, for widget frame unit tests. */
const spec = getDevice('laptop-window')!;
</script>

<div
  data-py-shell-part="device"
  style:position="relative"
  style:width="{spec.width}px"
  style:height="{spec.height}px"
>
  <div data-py-shell-part="screen" tabindex="-1" data-testid="widget-screen">
    <p>Widget app body</p>
    <button type="button">Inside panel</button>
  </div>
  <WidgetHostFrame {spec} shell="widget-host" />
</div>
