<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import Composer from '../composer/Composer.svelte';
import TypingIndicator from '../typing-indicator/TypingIndicator.svelte';
import MessageList from './MessageList.svelte';
import type { ChatMessage } from './types.ts';

interface Props {
  messages: ChatMessage[];
  currentUserId?: string;
  /** Names currently typing (excluding the current user). */
  typing?: string[];
  /** Composer draft. */
  draft?: string;
  /** Omit to render a read-only thread without a composer. */
  onSend?: (body: string) => unknown;
  sending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  body?: Snippet<[ChatMessage]>;
  /** Shown above the list (channel name, participants…). */
  header?: Snippet;
  emptyText?: string;
  locale?: string;
  class?: string;
}

let {
  messages,
  currentUserId,
  typing = [],
  draft = $bindable(''),
  onSend,
  sending = false,
  disabled = false,
  placeholder,
  body,
  header,
  emptyText,
  locale,
  class: className,
}: Props = $props();
</script>

<div class={cn('flex h-full min-h-0 flex-col bg-background', className)}>
  {@render header?.()}
  <MessageList {messages} {currentUserId} {body} {emptyText} {locale}>
    {#snippet footer()}
      <TypingIndicator names={typing} class="mt-3" />
    {/snippet}
  </MessageList>
  {#if onSend}
    <div class="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <Composer bind:value={draft} onSubmit={onSend} {sending} {disabled} {placeholder} />
    </div>
  {/if}
</div>
