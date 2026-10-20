<script lang="ts">
let open = $state(false);
</script>

<main>
  <h1>Dashboard</h1>
  <button type="button" onclick={() => (open = !open)}>Toggle</button>
  {#if open}<p>Details</p>{/if}
</main>
