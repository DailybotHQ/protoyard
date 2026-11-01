<script lang="ts">
import { SchemaForm } from '@texuli/forms';
import type { CompiledForm } from '@texuli/forms/model';

/** The form mounts disabled; a later change enables it, as the MFA challenge loading does (G134). */
let { form }: { form: CompiledForm } = $props();
let ready = $state(false);
</script>

<button type="button" onclick={() => (ready = true)}>Enable</button>
<SchemaForm {form} disabled={!ready} />
