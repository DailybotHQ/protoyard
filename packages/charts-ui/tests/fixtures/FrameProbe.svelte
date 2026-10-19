<script lang="ts">
import ChartFrame from '../../src/frame/ChartFrame.svelte';
import ContextProbe from './ContextProbe.svelte';

let { title = 'Signups' }: { title?: string } = $props();
</script>

<ChartFrame {title} height={200} margin={{ left: 50 }}>
  {#snippet children(size)}
    <svg data-testid="plot" width={size.width} height={size.height}></svg>
    <ContextProbe />
  {/snippet}
</ChartFrame>
