<script lang="ts">
let { path = '' }: { path?: string; [key: string]: unknown } = $props();
let count = $state(0);
</script>

<div data-testid="counter-screen" data-path={path}>
  <a href="#/deals/42/edit">Edit deal 42</a>
  <button type="button" onclick={() => (count += 1)}>Count {count}</button>
</div>
