<script lang="ts">
import { Archive, ArchiveRestore, Ellipsis, Pencil, Pin, PinOff, Trash2 } from '@lucide/svelte';
import { can, navigate, runService } from '@protoyard/renderer-svelte';
import {
  AlertDialog,
  Button,
  Dialog,
  DropdownMenu,
  type DropdownMenuEntry,
  FormField,
  Input,
} from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import type { Conversation } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useChat } from '../lib/context.ts';

/** Rename / pin / archive / delete, each gated by the policy for THIS conversation. */
let { conversation }: { conversation: Conversation } = $props();

const { services } = useChat();

let renameOpen = $state(false);
let deleteOpen = $state(false);
let name = $state('');
let nameError = $state<string | undefined>();
let saving = $state(false);

const canManage = $derived(can(CAPABILITIES.manageConversation, conversation));
const canPin = $derived(can(CAPABILITIES.send));

const items = $derived.by((): DropdownMenuEntry[] => {
  const entries: DropdownMenuEntry[] = [];
  if (canPin)
    entries.push({
      label: conversation.pinned ? 'Unpin' : 'Pin to top',
      icon: conversation.pinned ? PinOff : Pin,
      onSelect: () =>
        void runService(() => services.togglePin(conversation.id), {
          success: conversation.pinned ? 'Unpinned' : 'Pinned to top',
        }),
    });
  if (canManage) {
    entries.push(
      {
        label: 'Rename…',
        icon: Pencil,
        onSelect: () => {
          name = conversation.title;
          nameError = undefined;
          renameOpen = true;
        },
      },
      {
        label: conversation.archived ? 'Unarchive' : 'Archive',
        icon: conversation.archived ? ArchiveRestore : Archive,
        onSelect: () =>
          void runService(() => services.archive(conversation.id, !conversation.archived), {
            success: conversation.archived ? 'Moved back to your inbox' : 'Conversation archived',
          }),
      },
      { type: 'separator' },
      { label: 'Delete…', icon: Trash2, destructive: true, onSelect: () => (deleteOpen = true) }
    );
  }
  return entries;
});

async function rename(event: SubmitEvent) {
  event.preventDefault();
  nameError = name.trim().length < 2 ? 'Name must have at least 2 characters.' : undefined;
  if (nameError) return;
  saving = true;
  const result = await runService(() => services.rename(conversation.id, name), {
    success: 'Conversation renamed',
  });
  saving = false;
  if (result.ok) renameOpen = false;
}

async function remove() {
  const result = await runService(() => services.remove(conversation.id), {
    success: 'Conversation deleted',
  });
  if (!result.ok) throw new Error('The conversation was not deleted.');
  navigate('/', { replace: true });
}
</script>

{#if items.length > 0}
  <DropdownMenu {items}>
    {#snippet trigger({ props })}
      <Button {...props} variant="ghost" size="icon" aria-label="Conversation options">
        <LucideIcon icon={Ellipsis} />
      </Button>
    {/snippet}
  </DropdownMenu>
{/if}

<Dialog bind:open={renameOpen} title="Rename conversation" size="sm">
  <form id="rename-conversation" onsubmit={rename} novalidate>
    <FormField label="Name" required error={nameError}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={name} maxlength={60} autocomplete="off" />
      {/snippet}
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
  description="All messages and agent replies in this conversation are removed for everyone. This cannot be undone."
  confirmLabel="Delete conversation"
  destructive
  onConfirm={remove}
/>
