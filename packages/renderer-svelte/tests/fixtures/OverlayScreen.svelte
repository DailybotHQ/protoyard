<script lang="ts">
let {
  params = {},
  close,
}: { params?: Record<string, string>; close?: () => void; [key: string]: unknown } = $props();
</script>

<div data-testid="overlay-screen">
  <p>Editing deal {params.id}</p>
  <button type="button" onclick={() => close?.()}>Cancel</button>
</div>
