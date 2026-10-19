<script lang="ts">
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input } from '@protoyard/ui';

/** Rename a dashboard or a segment. Validation errors render inline; others toast. */
let {
  open = $bindable(false),
  title,
  current,
  save,
}: {
  open?: boolean;
  title: string;
  current: string;
  /** The service call (returns its promise). */
  save: (name: string) => Promise<unknown>;
} = $props();

let name = $state('');
let error = $state<string | undefined>(undefined);
let saving = $state(false);

$effect(() => {
  if (open) {
    name = current;
    error = undefined;
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(() => save(name), { success: 'Renamed' });
  saving = false;
  if (result.ok) open = false;
  else if (isValidationError(result.error)) error = result.error.issues.name;
}
</script>

<Dialog bind:open {title} description="Saved in this browser's IndexedDB.">
  <form id="rename-form" class="grid gap-4" onsubmit={submit} novalidate>
    <FormField label="Name" required {error}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={name} autocomplete="off" maxlength={60} />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="rename-form" loading={saving}>Save name</Button>
  {/snippet}
</Dialog>
