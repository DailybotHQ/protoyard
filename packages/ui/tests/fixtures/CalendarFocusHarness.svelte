<script lang="ts">
import Calendar from '../../src/components/form/scheduling/Calendar.svelte';

let { start = null }: { start?: string | null } = $props();
let focusDate = $state<string | null>(null);
$effect.pre(() => {
  focusDate = start;
});
</script>

<Calendar bind:focusDate selected="2026-03-10" today="2026-03-04" locale="en-US" />
<output data-focus-date>{focusDate ?? ''}</output>
<button type="button" onclick={() => (focusDate = '2026-09-02')}>Jump to September</button>
