<script lang="ts">
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronUp,
  Copy,
  FileText,
  FolderPlus,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Pin,
  RefreshCw,
  Search,
  Share2,
  ThumbsDown,
  ThumbsUp,
  X,
} from '@lucide/svelte';
import { AI_MODELS, type AiModel } from '@protoyard/ai';
import { onMount } from 'svelte';
import type {
  AssistantCanvas,
  AssistantConversation,
  AssistantMessage,
  AssistantSendInput,
  FeedbackRating,
} from '../types.ts';
import AssistantComposer from './AssistantComposer.svelte';
import CanvasPanel from './CanvasPanel.svelte';
import RichAnswer from './RichAnswer.svelte';

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
let visibleMessageCount = $state(100);
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
const lastAssistant = $derived(
  [...messages].reverse().find((message) => message.role === 'assistant')
);
const visibleMessages = $derived(messages.slice(-visibleMessageCount));
const earlierMessageCount = $derived(messages.length - visibleMessages.length);
const activeModel = $derived(models.find((model) => model.id === modelId));

$effect(() => {
  if (selectedConversationId !== undefined && selectedConversationId !== activeId) {
    activeId = selectedConversationId;
    visibleMessageCount = 100;
  } else if (!conversations.some((conversation) => conversation.id === activeId)) {
    activeId = conversations[0]?.id ?? '';
    visibleMessageCount = 100;
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
  visibleMessageCount = 100;
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

<div class="relative flex h-full min-h-[32rem] min-w-0 overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-soft">
  {#if sidebarOpen}<button type="button" class="fixed inset-0 z-20 bg-black/30 lg:hidden" aria-label="Close conversation navigation" onclick={() => (sidebarOpen = false)}></button>{/if}
  <aside class={`absolute inset-y-0 left-0 z-30 flex w-[min(19rem,85vw)] min-w-0 flex-col border-r border-border bg-surface transition-transform lg:static lg:w-72 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`} aria-label="Conversation history">
    <div class="flex items-center gap-2 p-3">
      <button type="button" class="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 text-left text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" disabled={!onCreateConversation} onclick={newConversation}>
        <MessageSquarePlus class="size-4" aria-hidden="true" /> New chat
        <span class="ml-auto text-xs text-muted-foreground">⌘ K</span>
      </button>
      <button type="button" class="inline-flex size-11 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden" aria-label="Close conversation navigation" onclick={() => (sidebarOpen = false)}><X class="size-4" aria-hidden="true" /></button>
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
    <header class="flex min-h-14 items-center gap-2 border-b border-border px-3 sm:px-5">
      <button type="button" class="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden" aria-label="Open conversation history" onclick={() => (sidebarOpen = true)}><Menu class="size-4" aria-hidden="true" /></button>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-sm font-semibold">{activeConversation?.title || 'New conversation'}</h1>
        <p class="text-[0.68rem] text-muted-foreground">{activeModel?.name ?? 'Simulated assistant'} · Simulated</p>
      </div>
      {#if onShare}<button type="button" class="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40" aria-label="Create share link" disabled={!activeId} onclick={() => void createShareLink()}><Share2 class="size-4" aria-hidden="true" /><span class="hidden sm:inline">Share</span></button>{/if}
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
        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
          {#if messages.length === 0}
            <div class="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-8">
              <div class="mb-8 text-center">
                <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessageSquarePlus class="size-5" aria-hidden="true" /></div>
                <h2 class="text-xl font-semibold tracking-tight sm:text-2xl">What would you like to explore?</h2>
                <p class="mt-2 text-sm text-muted-foreground">Draft, reason, and experiment with a deterministic simulated assistant.</p>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                {#each suggestions as suggestion (suggestion)}
                  <button type="button" class="min-h-14 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm text-muted-foreground shadow-soft transition-colors hover:border-ring/50 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={!activeId || !activeModel || streaming} onclick={() => chooseSuggestion(suggestion)}><span>{suggestion}</span><ArrowDown class="mt-1 size-3 text-muted-foreground/60" aria-hidden="true" /></button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="mx-auto max-w-3xl space-y-8 pb-6">
              {#if earlierMessageCount > 0}
                <div class="flex justify-center pb-2">
                  <button type="button" class="min-h-10 rounded-full border border-border bg-surface px-4 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onclick={() => (visibleMessageCount += 100)}>Load {Math.min(100, earlierMessageCount)} earlier messages</button>
                </div>
              {/if}
              {#each visibleMessages as message, index (message.id)}
                <article class={`group min-w-0 ${message.role === 'user' ? 'ml-auto max-w-[92%] sm:max-w-[85%]' : 'max-w-full'}`} aria-label={message.role === 'user' ? 'Your message' : 'Assistant message'}>
                  <div class="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground">{message.role === 'user' ? 'You' : 'Assistant'}</span>
                    {#if message.role === 'assistant'}<span class="rounded-full border border-border px-2 py-0.5 text-[0.62rem]">Simulated</span>{/if}
                    <time class="ml-auto" datetime={message.createdAt}>{formatDate(message.createdAt)}</time>
                  </div>
                  {#if editingId === message.id}
                    <form class="space-y-2" onsubmit={(event) => { event.preventDefault(); onEditMessage?.(message.id, editDraft); editingId = ''; }}>
                      <label for={`edit-${message.id}`} class="sr-only">Edit your message</label>
                      <textarea id={`edit-${message.id}`} bind:value={editDraft} rows="4" class="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"></textarea>
                      <div class="flex justify-end gap-2"><button type="button" class="min-h-10 rounded-lg px-3 text-xs hover:bg-muted" onclick={() => (editingId = '')}>Cancel</button><button type="submit" class="min-h-10 rounded-lg bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40" disabled={!onEditMessage || !editDraft.trim()}>Save and resend</button></div>
                    </form>
                  {:else if message.role === 'user'}
                    <div class="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground whitespace-pre-wrap">{message.content}</div>
                    {#if onEditMessage}<button type="button" class="mt-1 min-h-9 rounded-lg px-2 text-xs text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" aria-label="Edit your message" onclick={() => { editingId = message.id; editDraft = message.content; }}><span class="inline-flex items-center gap-1"><ChevronUp class="size-3" aria-hidden="true" /> Edit</span></button>{/if}
                  {:else}
                    <RichAnswer content={message.content} />
                    <div class="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                      {#if onFeedback}<button type="button" class={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${message.feedback === 'up' ? 'text-primary' : ''}`} aria-label="Helpful response" aria-pressed={message.feedback === 'up'} onclick={() => onFeedback?.(message.id, 'up')}><ThumbsUp class="size-3.5" aria-hidden="true" />Helpful</button><button type="button" class={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${message.feedback === 'down' ? 'text-primary' : ''}`} aria-label="Unhelpful response" aria-pressed={message.feedback === 'down'} onclick={() => onFeedback?.(message.id, 'down')}><ThumbsDown class="size-3.5" aria-hidden="true" />Not helpful</button>{/if}
                      {#if message.branchCount && message.branchCount > 1}<span class="ml-1 inline-flex items-center gap-1"><button type="button" class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40" aria-label="Previous response version" disabled={message.branchIndex === 0 || !onBranchChange} onclick={() => onBranchChange?.(message.id, -1)}><ArrowLeft class="size-3.5" aria-hidden="true" /></button><span>{(message.branchIndex ?? 0) + 1} / {message.branchCount}</span><button type="button" class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40" aria-label="Next response version" disabled={(message.branchIndex ?? 0) >= message.branchCount - 1 || !onBranchChange} onclick={() => onBranchChange?.(message.id, 1)}><ArrowRight class="size-3.5" aria-hidden="true" /></button></span>{/if}
                      {#if lastAssistant?.id === message.id && onRegenerate}<button type="button" class="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={streaming} aria-label="Regenerate response" onclick={onRegenerate}><RefreshCw class="size-3.5" aria-hidden="true" /> Regenerate</button>{/if}
                    </div>
                  {/if}
                  {#if message.role === 'assistant' && index === visibleMessages.length - 1 && streaming}<p class="mt-2 text-xs text-muted-foreground" aria-live="polite">Writing…</p>{/if}
                </article>
              {/each}
            </div>
          {/if}
        </div>
        <footer class="space-y-2 border-t border-border bg-background/90 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <AssistantComposer models={models} modelId={modelId} streaming={streaming} disabled={!activeId} onModelChange={(id) => (modelId = id)} onStop={onStop} onSubmit={(input) => activeId ? onSend(activeId, input) : false} />
          <p class="text-center text-[0.65rem] text-muted-foreground">AI responses are generated by local deterministic simulation and may be inaccurate.</p>
        </footer>
      </div>
      {#if canvas}<div class="fixed inset-0 z-20 flex bg-background lg:static lg:z-auto lg:w-[min(42%,34rem)] lg:min-w-72"><CanvasPanel document={canvas} onChange={onCanvasChange} onClose={onCloseCanvas} /></div>{/if}
    </div>
  </section>
</div>
