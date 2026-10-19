<script lang="ts">
/** A section's last failure, next to the control that caused it. */
let { message }: { message: string | null } = $props();
</script>

{#if message}
  <p class="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive" role="alert">
    {message}
  </p>
{/if}
