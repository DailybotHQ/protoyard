<script lang="ts">
import { Alert } from 'texuli/alert';

/** A section's last failure, next to the control that caused it (Texuli Alert). */
let { message }: { message: string | null } = $props();
</script>

{#if message}
  <div class="mt-2" data-py-devtools-inline-error="">
    <Alert tone="error" text={message} hideIcon />
  </div>
{/if}
