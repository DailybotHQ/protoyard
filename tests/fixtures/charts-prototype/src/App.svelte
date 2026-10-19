<script lang="ts">
import { Sparkline } from '@protoyard/charts-ui/compact';

let open = $state(false);
// The full charts arrive only when the user opens the details view.
const charts = () => import('./Charts.svelte');
</script>

<main>
  <h1>Dashboard</h1>
  <Sparkline values={[3, 5, 4, 8, 7, 9]} period="6 days" />
  <button type="button" onclick={() => (open = !open)}>Toggle</button>
  {#if open}
    {#await charts() then { default: Charts }}<Charts />{/await}
  {/if}
</main>
