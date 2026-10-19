<script lang="ts">
import LiveCounter from '../../src/kpi/LiveCounter.svelte';

let {
  value,
  announceEvery = 5000,
  duration = 600,
}: { value: number | null; announceEvery?: number; duration?: number } = $props();
// Stands in for a liveQuery result: a reactive `current`.
const query = {
  get current() {
    return value;
  },
};
</script>

<LiveCounter label="Active users" {query} {announceEvery} {duration} />
