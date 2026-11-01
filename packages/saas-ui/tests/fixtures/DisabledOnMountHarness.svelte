<script lang="ts">
import { SchemaForm } from '@texuli/forms';
import type { CompiledForm } from '@texuli/forms/model';

/** G134 repro: the form mounts disabled; a later change enables it (the MFA challenge loading). */
let { form }: { form: CompiledForm } = $props();
let ready = $state(false);
</script>

<button type="button" onclick={() => (ready = true)}>Enable</button>
<SchemaForm {form} disabled={!ready} />
