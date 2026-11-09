<script lang="ts">
import { fade } from 'svelte/transition';
import { Button } from 'texuli/button';

let open = $state(false);
</script>

<Button onclick={() => (open = !open)}>Details</Button>
{#if open}
  <div class="p-4" transition:fade>Order details</div>
{/if}
