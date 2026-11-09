<script lang="ts">
let { label }: { label: string } = $props();
</script>

<span class="status-badge">{label}</span>

<style>
  .status-badge {
    display: inline-flex;
    padding: var(--tx-space-1) var(--tx-space-2);
    border-radius: var(--tx-radius-full);
    background: var(--tx-color-muted);
  }
</style>
