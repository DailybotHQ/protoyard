<script lang="ts">
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input } from '@protoyard/ui';
import type { Folder } from '../database/schema.ts';
import { useDesktop } from '../lib/context.ts';

/** Create a folder. Validation errors render inline; other failures toast. */
let {
  open = $bindable(false),
  oncreated,
}: { open?: boolean; oncreated?: (folder: Folder) => void } = $props();

const { services } = useDesktop();
let name = $state('');
let error = $state('');
let saving = $state(false);

$effect(() => {
  if (open) {
    name = '';
    error = '';
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(() => services.folders.create({ name }), {
    success: 'Folder created',
  });
  saving = false;
  if (result.ok) {
    open = false;
    oncreated?.(result.value);
  } else if (isValidationError(result.error)) {
    error = result.error.issues.name ?? result.error.message;
  }
}
</script>

<Dialog bind:open title="New folder" description="Folders group your documents." size="sm">
  <form id="folder-form" onsubmit={submit} novalidate>
    <FormField label="Name" required error={error}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={name} placeholder="Research" autocomplete="off" maxlength={60} />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="folder-form" loading={saving}>Create folder</Button>
  {/snippet}
</Dialog>
