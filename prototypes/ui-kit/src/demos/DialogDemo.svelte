<script lang="ts">
import { Button, Dialog, FormField, Input, toast } from '@protoyard/ui';
import { wait } from './nav.ts';

let projectName = $state('Atlas redesign');
let editOpen = $state(false);
let draft = $state('');
let saving = $state(false);
let draftError = $derived(draft.trim().length < 3 ? 'Use at least 3 characters.' : undefined);
let touched = $state(false);

async function save(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  touched = true;
  if (draftError) return;
  saving = true;
  await wait(700);
  projectName = draft.trim();
  saving = false;
  editOpen = false;
  toast.success('Project renamed', { description: projectName });
}
</script>

<div class="flex flex-wrap items-center gap-3">
  <Dialog
    bind:open={editOpen}
    title="Rename project"
    description="Project names are visible to everyone in the workspace."
    size="sm"
    onOpenChange={(open) => {
      if (open) {
        draft = projectName;
        touched = false;
      }
    }}
  >
    {#snippet trigger({ props })}
      <Button {...props}>Rename “{projectName}”</Button>
    {/snippet}
    <form id="dialog-demo-form" class="grid gap-3 py-1" novalidate onsubmit={save}>
      <FormField label="Name" error={touched ? draftError : undefined} required>
        {#snippet children({ props })}
          <Input {...props} bind:value={draft} oninput={() => (touched = true)} />
        {/snippet}
      </FormField>
    </form>
    {#snippet footer()}
      <Button variant="outline" disabled={saving} onclick={() => (editOpen = false)}>Cancel</Button>
      <Button type="submit" form="dialog-demo-form" loading={saving}>Save</Button>
    {/snippet}
  </Dialog>

  <Dialog
    title="Terms of service"
    description="A large dialog with scrolling content."
    size="lg"
  >
    {#snippet trigger({ props })}
      <Button {...props} variant="outline">Open large dialog</Button>
    {/snippet}
    <div class="grid gap-3 text-muted-foreground">
      {#each { length: 8 }, index (index)}
        <p>
          Section {index + 1}. Example Corp provides this fictional service as is. Content in this
          dialog scrolls while the header and footer stay put, and Esc or the close button dismiss
          it.
        </p>
      {/each}
    </div>
  </Dialog>
</div>
<p class="mt-3 text-xs text-muted-foreground">
  Focus is trapped while open and returns to the trigger on close.
</p>
