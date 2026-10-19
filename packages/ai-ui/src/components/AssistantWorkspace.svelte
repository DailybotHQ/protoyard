<script lang="ts">
import {
  ArrowDown,
  Check,
  Copy,
  FileText,
  FolderPlus,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Pin,
  Search,
  Share2,
  X,
} from '@lucide/svelte';
import { AI_MODELS, type AiModel } from '@protoyard/ai';
import { onMount } from 'svelte';
import MessageList from '../MessageList.svelte';
import type {
  AssistantCanvas,
  AssistantConversation,
  AssistantMessage,
  AssistantSendInput,
  FeedbackRating,
} from '../types.ts';
import AssistantComposer from './AssistantComposer.svelte';
import CanvasPanel from './CanvasPanel.svelte';

interface Props {
  conversations: readonly AssistantConversation[];
  messages: readonly AssistantMessage[];
  models?: readonly AiModel[];
  selectedConversationId?: string;
  selectedModelId?: string;
  folders?: readonly string[];
  streaming?: boolean;
  canvas?: AssistantCanvas | null;
  onSend: (conversationId: string, input: AssistantSendInput) => unknown;
  onStop?: () => void;
  onCreateConversation?: () => string | undefined;
  onSelectConversation?: (id: string) => void;
  onRenameConversation?: (id: string, title: string) => void;
  onTogglePin?: (id: string) => void;
  onMoveToFolder?: (id: string, folder: string | null) => void;
  onCreateFolder?: (name: string) => void;
  onRegenerate?: () => void;
  onEditMessage?: (messageId: string, content: string) => void;
  onBranchChange?: (messageId: string, direction: -1 | 1) => void;
  onFeedback?: (messageId: string, rating: FeedbackRating) => void;
  onShare?: (conversationId: string) => string | Promise<string>;
  onCanvasChange?: (content: string) => void;
  onCloseCanvas?: () => void;
}

const suggestions = [
  'Help me turn an idea into a product plan',
  'Summarize the key points in a document',
  'Write a first draft I can improve',
  'Explain a complex topic step by step',
];

let {
  conversations,
  messages,
  models = AI_MODELS,
  selectedConversationId,
  selectedModelId,
  folders = [],
  streaming = false,
  canvas = null,
  onSend,
  onStop,
  onCreateConversation,
  onSelectConversation,
  onRenameConversation,
  onTogglePin,
  onMoveToFolder,
  onCreateFolder,
  onRegenerate,
  onEditMessage,
  onBranchChange,
  onFeedback,
  onShare,
  onCanvasChange,
  onCloseCanvas,
}: Props = $props();

let activeId = $state('');
let modelId = $state('');
let query = $state('');
let folderFilter = $state('');
let sidebarOpen = $state(false);
let folderDraft = $state('');
let shareUrl = $state('');
let shareError = $state('');
let copiedShare = $state(false);
let editingId = $state('');
let editDraft = $state('');
let searchInput = $state<HTMLInputElement | null>(null);
const activeConversation = $derived(
  conversations.find((conversation) => conversation.id === activeId)
);
const sortedConversations = $derived.by(() => {
  const normalized = query.trim().toLowerCase();
  return [...conversations]
    .filter((conversation) => !normalized || conversation.title.toLowerCase().includes(normalized))
    .filter(
      (conversation) =>
        !folderFilter ||
        (folderFilter === '__unfiled' ? !conversation.folder : conversation.folder === folderFilter)
    )
    .sort(
      (left, right) =>
        Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) ||
        right.updatedAt.localeCompare(left.updatedAt)
    );
});
const activeModel = $derived(models.find((model) => model.id === modelId));

$effect(() => {
  if (selectedConversationId !== undefined && selectedConversationId !== activeId) {
    activeId = selectedConversationId;
  } else if (!conversations.some((conversation) => conversation.id === activeId)) {
    activeId = conversations[0]?.id ?? '';
  }
});

$effect(() => {
  const preferredModelId = selectedModelId ?? models[0]?.id ?? '';
  if (models.some((model) => model.id === preferredModelId)) modelId = preferredModelId;
});

onMount(() => {
  const handleShortcut = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchInput?.focus();
    } else if (event.key === 'Escape' && streaming) {
      onStop?.();
    }
  };
  window.addEventListener('keydown', handleShortcut);
  return () => window.removeEventListener('keydown', handleShortcut);
});

function selectConversation(id: string): void {
  activeId = id;
  sidebarOpen = false;
  shareUrl = '';
  onSelectConversation?.(id);
}

function newConversation(): void {
  if (!onCreateConversation) return;
  const id = onCreateConversation();
  if (id) selectConversation(id);
}

function chooseSuggestion(prompt: string): void {
  if (!activeId || !activeModel) return;
  void onSend(activeId, { prompt, model: activeModel, attachments: [] });
}

async function createShareLink(): Promise<void> {
  if (!onShare || !activeId) return;
  shareError = '';
  try {
    shareUrl = await onShare(activeId);
  } catch {
    shareError = 'A share link could not be created.';
  }
}

async function copyShareLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl);
    copiedShare = true;
    setTimeout(() => (copiedShare = false), 1400);
  } catch {
    shareError = 'Clipboard access is unavailable. Copy the link from the field.';
  }
}

function saveRename(id: string): void {
  const title = editDraft.trim();
  if (title) onRenameConversation?.(id, title);
  editingId = '';
}

function addFolder(): void {
  const folder = folderDraft.trim();
  if (!folder || folders.includes(folder)) return;
  onCreateFolder?.(folder);
  folderDraft = '';
}

function formatDate(date: string): string {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value);
}
</script>

<div class="@container relative flex h-full min-h-[32rem] min-w-0 overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-soft">
  {#if sidebarOpen}<button type="button" class="absolute inset-0 z-20 bg-black/30 @3xl:hidden" aria-label="Close conversation navigation" onclick={() => (sidebarOpen = false)}></button>{/if}
  <aside class={`absolute inset-y-0 left-0 z-30 flex w-[min(19rem,85%)] min-w-0 flex-col border-r border-border bg-surface transition-transform @3xl:static @3xl:w-72 @3xl:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full @3xl:translate-x-0'}`} aria-label="Conversation history">
    <div class="flex items-center gap-2 p-3">
      <button type="button" class="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 text-left text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" disabled={!onCreateConversation} onclick={newConversation}>
        <MessageSquarePlus class="size-4" aria-hidden="true" /> New chat
        <span class="ml-auto text-xs text-muted-foreground">⌘ K</span>
      </button>
      <button type="button" class="inline-flex size-11 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @3xl:hidden" aria-label="Close conversation navigation" onclick={() => (sidebarOpen = false)}><X class="size-4" aria-hidden="true" /></button>
    </div>
    <div class="px-3 pb-2">
      <label for="conversation-search" class="sr-only">Search conversations</label>
      <div class="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search class="size-4 text-muted-foreground" aria-hidden="true" />
        <input bind:this={searchInput} bind:value={query} id="conversation-search" class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Search conversations" />
        <kbd class="text-[0.65rem] text-muted-foreground">⌘K</kbd>
      </div>
      <label for="conversation-folder-filter" class="sr-only">Filter by folder</label>
      <select id="conversation-folder-filter" bind:value={folderFilter} class="mt-2 h-9 w-full rounded-lg bg-transparent px-2 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <option value="">All conversations</option><option value="__unfiled">Unfiled</option>
        {#each folders as folder (folder)}<option value={folder}>{folder}</option>{/each}
      </select>
    </div>
    <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Conversations">
      {#if sortedConversations.length === 0}<p class="px-3 py-6 text-center text-xs text-muted-foreground">No conversations found.</p>{/if}
      <ul class="space-y-1">
        {#each sortedConversations as conversation (conversation.id)}
          <li class={`rounded-xl p-1 ${activeId === conversation.id ? 'bg-muted' : 'hover:bg-muted/60'}`}>
            {#if editingId === conversation.id}
              <form class="flex gap-1" onsubmit={(event) => { event.preventDefault(); saveRename(conversation.id); }}>
                <label class="sr-only" for={`rename-${conversation.id}`}>Conversation title</label>
                <input id={`rename-${conversation.id}`} bind:value={editDraft} class="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-2 text-sm" maxlength="80" />
                <button class="inline-flex size-9 items-center justify-center rounded-md hover:bg-background" aria-label="Save conversation title"><Check class="size-4" aria-hidden="true" /></button>
              </form>
            {:else}
              <div class="flex min-w-0 items-center gap-1">
                <button type="button" class="min-h-10 min-w-0 flex-1 rounded-lg px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-current={activeId === conversation.id ? 'page' : undefined} onclick={() => selectConversation(conversation.id)}>
                  <span class="flex items-center gap-1.5 truncate text-sm">{#if conversation.pinned}<Pin class="size-3 shrink-0 text-primary" aria-label="Pinned" />{/if}<span class="truncate">{conversation.title || 'New conversation'}</span></span>
                  <span class="mt-0.5 block truncate text-[0.68rem] text-muted-foreground">{conversation.folder ?? 'Personal'} · {formatDate(conversation.updatedAt)}</span>
                </button>
                <details class="group relative shrink-0">
                  <summary class="flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Actions for ${conversation.title}`}><MoreHorizontal class="size-4" aria-hidden="true" /></summary>
                  <div class="absolute right-0 top-9 z-20 w-48 rounded-xl border border-border bg-elevated p-2 shadow-float">
                    <button type="button" class="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-muted" disabled={!onRenameConversation} onclick={(event) => { editingId = conversation.id; editDraft = conversation.title; (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); }}>{conversation.title ? 'Rename' : 'Name conversation'}</button>
                    <button type="button" class="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-muted" disabled={!onTogglePin} onclick={() => onTogglePin?.(conversation.id)}>{conversation.pinned ? 'Unpin' : 'Pin'} conversation</button>
                    <label class="sr-only" for={`folder-${conversation.id}`}>Move {conversation.title} to folder</label>
                    <select id={`folder-${conversation.id}`} class="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={conversation.folder ?? ''} disabled={!onMoveToFolder} onchange={(event) => onMoveToFolder?.(conversation.id, event.currentTarget.value || null)}>
                      <option value="">Move to folder…</option>{#each folders as folder (folder)}<option value={folder}>{folder}</option>{/each}
                    </select>
                  </div>
                </details>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>
    <form class="flex gap-2 border-t border-border p-3" onsubmit={(event) => { event.preventDefault(); addFolder(); }}>
      <label for="new-conversation-folder" class="sr-only">New folder name</label>
      <input id="new-conversation-folder" bind:value={folderDraft} maxlength="40" class="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="New folder" disabled={!onCreateFolder} />
      <button type="submit" class="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40" aria-label="Create folder" disabled={!onCreateFolder || !folderDraft.trim()}><FolderPlus class="size-4" aria-hidden="true" /></button>
    </form>
    <p class="px-4 pb-3 text-[0.65rem] text-muted-foreground">All conversations and models are simulated.</p>
  </aside>

  <section class="flex min-w-0 flex-1 flex-col" aria-label="Assistant conversation">
    <header class="flex min-h-14 items-center gap-2 border-b border-border px-3 @xl:px-5">
      <button type="button" class="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @3xl:hidden" aria-label="Open conversation history" onclick={() => (sidebarOpen = true)}><Menu class="size-4" aria-hidden="true" /></button>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-sm font-semibold">{activeConversation?.title || 'New conversation'}</h1>
        <p class="text-[0.68rem] text-muted-foreground">{activeModel?.name ?? 'Simulated assistant'} · Simulated</p>
      </div>
      {#if onShare}<button type="button" class="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40" aria-label="Create share link" disabled={!activeId} onclick={() => void createShareLink()}><Share2 class="size-4" aria-hidden="true" /><span class="hidden @xl:inline">Share</span></button>{/if}
      {#if canvas}<span class="inline-flex min-h-8 items-center gap-1 rounded-full border border-border px-2 text-[0.68rem] text-muted-foreground"><FileText class="size-3" aria-hidden="true" /> Canvas open</span>{/if}
    </header>
    {#if shareUrl || shareError}
      <div class="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2">
        {#if shareUrl}<label for="assistant-share-link" class="sr-only">Share link</label><input id="assistant-share-link" readonly value={shareUrl} class="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs" /><button type="button" class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" aria-label="Copy share link" onclick={() => void copyShareLink()}>{#if copiedShare}<Check class="size-4" aria-hidden="true" />{:else}<Copy class="size-4" aria-hidden="true" />{/if}</button>{/if}
        {#if shareError}<p role="alert" class="text-xs text-destructive">{shareError}</p>{/if}
        <button type="button" class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Close share link" onclick={() => { shareUrl = ''; shareError = ''; }}><X class="size-4" aria-hidden="true" /></button>
      </div>
    {/if}
    {#if streaming}<p role="status" class="border-b border-border px-5 py-2 text-xs text-primary">Generating a simulated response… Press Esc to stop.</p>{/if}
    <div class="flex min-h-0 flex-1">
      <div class="flex min-w-0 flex-1 flex-col">
        {#if messages.length > 0}
          <MessageList
            {messages}
            conversationId={activeId}
            {streaming}
            {onRegenerate}
            {onEditMessage}
            {onBranchChange}
            {onFeedback}
          />
        {:else}
          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-5 @xl:px-8">
          {#if messages.length === 0}
            <div class="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-8">
              <div class="mb-8 text-center">
                <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessageSquarePlus class="size-5" aria-hidden="true" /></div>
                <h2 class="text-xl font-semibold tracking-tight @xl:text-2xl">What would you like to explore?</h2>
                <p class="mt-2 text-sm text-muted-foreground">Draft, reason, and experiment with a deterministic simulated assistant.</p>
              </div>
              <div class="grid gap-2 @xl:grid-cols-2">
                {#each suggestions as suggestion (suggestion)}
                  <button type="button" class="min-h-14 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm text-muted-foreground shadow-soft transition-colors hover:border-ring/50 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={!activeId || !activeModel || streaming} onclick={() => chooseSuggestion(suggestion)}><span>{suggestion}</span><ArrowDown class="mt-1 size-3 text-muted-foreground/60" aria-hidden="true" /></button>
                {/each}
              </div>
            </div>
          {/if}
          </div>
        {/if}
        <footer class="space-y-2 border-t border-border bg-background/90 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] @xl:px-5">
          <AssistantComposer models={models} modelId={modelId} streaming={streaming} disabled={!activeId} onModelChange={(id) => (modelId = id)} onStop={onStop} onSubmit={(input) => activeId ? onSend(activeId, input) : false} />
          <p class="text-center text-[0.65rem] text-muted-foreground">AI responses are generated by local deterministic simulation and may be inaccurate.</p>
        </footer>
      </div>
      {#if canvas}<div class="absolute inset-0 z-30 flex bg-background @3xl:static @3xl:z-auto @3xl:w-[min(42%,34rem)] @3xl:min-w-72"><CanvasPanel document={canvas} onChange={onCanvasChange} onClose={onCloseCanvas} /></div>{/if}
    </div>
  </section>
</div>
