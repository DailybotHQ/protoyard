<script lang="ts">
import { isValidationError, navigate, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input } from '@protoyard/ui';
import type { Conversation } from '../database/schema.ts';
import { useChat } from '../lib/context.ts';

let { open = $bindable(false) }: { open?: boolean } = $props();

const { chat } = useChat();
let title = $state('');
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (open) {
    title = '';
    errors = {};
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService<Conversation>(() => chat.createConversation({ title }), {
    success: 'Conversation created',
  });
  saving = false;
  if (result.ok) {
    open = false;
    navigate(`/c/${result.value.id}`);
  } else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Dialog bind:open title="New conversation" description="The assistant answers every message in it." size="sm">
  <form id="new-conversation" onsubmit={submit} novalidate>
    <FormField label="Name" required error={errors.title}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={title} maxlength={60} placeholder="e.g. Weekly planning" autocomplete="off" />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="new-conversation" loading={saving}>Create</Button>
  {/snippet}
</Dialog>
