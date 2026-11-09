<script lang="ts">
let count = $state(0);
</script>

<div class="flex items-center gap-2">
  <button type="button" onclick={() => (count += 1)}>Add one</button>
  <span>{count}</span>
</div>
