<script lang="ts">
import { type ChatMessage, type MessageAttachment, parseChatMessage } from '@protoyard/ai/messages';
import RichAnswer from '../components/RichAnswer.svelte';
import MessageAttachments from './MessageAttachments.svelte';
import MessageButtons from './MessageButtons.svelte';
import MessageForm from './MessageForm.svelte';
import MessageLinkPreview from './MessageLinkPreview.svelte';
import MessageSelect from './MessageSelect.svelte';
import MessageTable from './MessageTable.svelte';
import type { MessageActionHandler } from './types.ts';

/**
 * Renders a `protoyard.message@1` chat message. Input is untrusted, so it is
 * always validated with `parseChatMessage` first: an invalid message shows a
 * short note (never its content), and an unknown block arrives as the plain
 * text the parser put in its place. Text renders as text; markdown text goes
 * through the safe markdown renderer. Nothing here uses `{@html}`.
 *
 * Actions (buttons, selects, forms) call `onAction` with a typed event; the
 * returned promise drives each control's pending and error feedback.
 */
let {
  message,
  onAction,
  onOpenAttachment,
  label = 'Message',
  class: className = '',
}: {
  /** A message object or its JSON text. */
  message: unknown;
  onAction?: MessageActionHandler;
  onOpenAttachment?: (attachment: MessageAttachment) => unknown | Promise<unknown>;
  label?: string;
  class?: string;
} = $props();

const result = $derived(parseChatMessage(message));
const parsed = $derived<ChatMessage | null>(result.success ? result.message : null);
const messageId = $derived(parsed?.id ?? null);
</script>

<div class="grid gap-3 text-sm text-foreground {className}" data-py-chat-message role="group" aria-label={label}>
  {#if !result.success}
    <p class="m-0 rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground" role="note" data-py-message-invalid>
      This message could not be shown ({result.issues.length === 1 ? '1 problem' : `${result.issues.length} problems`}).
    </p>
  {:else if parsed}
    {#each parsed.blocks as block, index (index)}
      {#if block.type === 'text'}
        {#if block.replaces}
          <p class="m-0 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground" role="note" data-py-message-block="unknown">{block.text}</p>
        {:else if block.format === 'markdown'}
          <div data-py-message-block="text"><RichAnswer content={block.text} label="Message text" /></div>
        {:else}
          <p class="m-0 whitespace-pre-wrap leading-6" data-py-message-block="text">{block.text}</p>
        {/if}
      {:else if block.type === 'buttons'}
        <MessageButtons {block} blockIndex={index} {messageId} {onAction} />
      {:else if block.type === 'select'}
        <MessageSelect {block} blockIndex={index} {messageId} {onAction} />
      {:else if block.type === 'form'}
        <MessageForm {block} blockIndex={index} {messageId} {onAction} />
      {:else if block.type === 'table'}
        <MessageTable {block} />
      {:else if block.type === 'link_preview'}
        <MessageLinkPreview {block} />
      {/if}
    {/each}
    {#if parsed.attachments.length > 0}
      <MessageAttachments attachments={parsed.attachments} onOpen={onOpenAttachment} />
    {/if}
  {/if}
</div>
