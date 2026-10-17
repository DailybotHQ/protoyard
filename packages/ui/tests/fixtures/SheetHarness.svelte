<script lang="ts">
import BottomSheet from '../../src/components/bottom-sheet/BottomSheet.svelte';

let { open = $bindable(true) }: { open?: boolean } = $props();
</script>

<BottomSheet bind:open title="Filters" description="Narrow the list">
  <p>Sheet body</p>
</BottomSheet>
<output data-testid="state">{open ? 'open' : 'closed'}</output>
