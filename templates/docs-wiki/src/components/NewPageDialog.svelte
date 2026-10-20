<script lang="ts">
import { isValidationError, navigate, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input } from '@protoyard/ui';
import { useWiki } from '../lib/context.ts';

/** Creates a page (under `parentId`, or at the top of the space) and opens it in the editor. */
let {
  open = $bindable(false),
  spaceId,
  parentId = null,
  parentTitle,
}: { open?: boolean; spaceId: string; parentId?: string | null; parentTitle?: string } = $props();

const { services } = useWiki();
let title = $state('');
let error = $state<string | undefined>(undefined);
let saving = $state(false);
$effect(() => {
  if (open) {
    title = '';
    error = undefined;
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(
    () => services.pages.create({ spaceId, parentId, title, body: `# ${title.trim()}\n\n` }),
    { success: 'Page created' }
  );
  saving = false;
  if (result.ok) {
    open = false;
    navigate(`/pages/${result.value.id}/edit`);
  } else if (isValidationError(result.error)) {
    error =
      result.error.issues.title ?? result.error.issues.parentId ?? result.error.issues.spaceId;
  }
}
</script>

<Dialog bind:open title={parentTitle ? 'New subpage' : 'New page'} description={parentTitle ? `Inside “${parentTitle}”.` : 'At the top of this space.'}>
  <form id="new-page-form" onsubmit={submit} novalidate>
    <FormField label="Title" required {error}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={title} maxlength={120} autocomplete="off" placeholder="Incident checklist" />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="new-page-form" loading={saving}>Create and edit</Button>
  {/snippet}
</Dialog>
