<script lang="ts">
import { getBlockHost } from '@protoyard/blocks-ui';

let { label }: { label: string } = $props();
const host = getBlockHost();
</script>

<span data-canvas-mode-probe={label}>{host.canvasMode}</span>
