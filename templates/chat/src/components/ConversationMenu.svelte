<script lang="ts">
import { Ellipsis, Pencil, Trash2 } from '@lucide/svelte';
import { can, isValidationError, navigate, runService } from '@protoyard/renderer-svelte';
import { AlertDialog, Button, Dialog, DropdownMenu, FormField, Input } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import type { Conversation } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useChat } from '../lib/context.ts';

/** Rename / delete, gated by the policy for THIS conversation. */
let { conversation }: { conversation: Conversation } = $props();

const { chat } = useChat();
let renameOpen = $state(false);
let deleteOpen = $state(false);
let name = $state('');
let errors = $state<Record<string, string>>({});
let saving = $state(false);

async function rename(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(() => chat.rename(conversation.id, name), { success: 'Renamed' });
  saving = false;
  if (result.ok) renameOpen = false;
  else if (isValidationError(result.error)) errors = result.error.issues;
}

async function remove() {
  const result = await runService(() => chat.remove(conversation.id), {
    success: 'Conversation deleted',
  });
  if (!result.ok) throw new Error('The conversation was not deleted.');
  navigate('/', { replace: true });
}
</script>

{#if can(CAPABILITIES.manage, conversation)}
  <DropdownMenu
    items={[
      {
        label: 'Rename…',
        icon: Pencil,
        onSelect: () => {
          name = conversation.title;
          errors = {};
          renameOpen = true;
        },
      },
      { type: 'separator' },
      { label: 'Delete…', icon: Trash2, destructive: true, onSelect: () => (deleteOpen = true) },
    ]}
  >
    {#snippet trigger({ props })}
      <Button {...props} variant="ghost" size="icon" aria-label="Conversation options"><LucideIcon icon={Ellipsis} /></Button>
    {/snippet}
  </DropdownMenu>
{/if}

<Dialog bind:open={renameOpen} title="Rename conversation" size="sm">
  <form id="rename-conversation" onsubmit={rename} novalidate>
    <FormField label="Name" required error={errors.title}>
      {#snippet children(control)}<Input {...control.props} bind:value={name} maxlength={60} autocomplete="off" />{/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (renameOpen = false)}>Cancel</Button>
    <Button type="submit" form="rename-conversation" loading={saving}>Save</Button>
  {/snippet}
</Dialog>

<AlertDialog
  bind:open={deleteOpen}
  title={`Delete “${conversation.title}”?`}
  description="All of its messages are removed. This cannot be undone."
  confirmLabel="Delete conversation"
  destructive
  onConfirm={remove}
/>
