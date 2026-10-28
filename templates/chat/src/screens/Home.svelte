<script lang="ts">
import { MessagesSquare } from '@lucide/svelte';
import { can } from '@protoyard/renderer-svelte';
import { Button, EmptyState } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { CAPABILITIES } from '../domain/policy.ts';
import { useChat } from '../lib/context.ts';

/** Wide-screen landing pane (on phones the conversation list is the home screen). */
let { onNew }: { onNew?: () => void } = $props();

const { inbox } = useChat();
const empty = $derived(!inbox.loading && (inbox.current ?? []).length === 0);
</script>

<div class="flex h-full items-center justify-center px-6">
  <EmptyState
    icon={MessagesSquare}
    title={empty ? 'Welcome! No conversations yet' : 'Pick a conversation'}
    description={empty
      ? 'Start a conversation and ask the assistant anything. Its replies stream in and are saved in this browser.'
      : 'Choose one on the left, or start a new one.'}
  >
    {#snippet action()}
      {#if can(CAPABILITIES.create) && onNew}
        <Button onclick={onNew}><Icon icon="plus" aria-hidden="true" /> New conversation</Button>
      {/if}
    {/snippet}
  </EmptyState>
</div>
