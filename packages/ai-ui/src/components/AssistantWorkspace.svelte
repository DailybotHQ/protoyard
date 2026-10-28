<script lang="ts">
import {
  ArrowDown,
  Copy,
  FileText,
  FolderPlus,
  MessageSquarePlus,
  MoreHorizontal,
  Pin,
  Share2,
} from '@lucide/svelte';
import { AI_MODELS, type AiModel } from '@protoyard/ai';
import { onMount } from 'svelte';
import { Badge } from 'texuli/badge';
import { Button, IconButton } from 'texuli/button';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Input } from 'texuli/input';
import { Kbd } from 'texuli/kbd-code';
import { DropdownMenu } from 'texuli/menus';
import { Select } from 'texuli/select';
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
let searchInput = $state<HTMLElement | null>(null);
/** Texuli's Select keeps "" as "nothing chosen", so "all conversations" has its own value. */
const ALL_FOLDERS = '__all';
const folderItems = $derived([
  { value: ALL_FOLDERS, label: 'All conversations' },
  { value: '__unfiled', label: 'Unfiled' },
  ...folders.map((folder) => ({ value: folder, label: folder })),
]);
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
  {#if sidebarOpen}<Button variant="ghost" class="absolute inset-0 z-20 h-auto rounded-none bg-black/30 hover:bg-black/30 @3xl:hidden" aria-label="Close conversation navigation" onclick={() => (sidebarOpen = false)} />{/if}
  <aside class={`absolute inset-y-0 left-0 z-30 flex w-[min(19rem,85%)] min-w-0 flex-col border-r border-border bg-surface transition-transform @3xl:static @3xl:w-72 @3xl:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full @3xl:translate-x-0'}`} aria-label="Conversation history">
    <div class="flex items-center gap-2 p-3">
      <Button variant="outline" class="min-h-11 flex-1 justify-start gap-2" disabled={!onCreateConversation} onclick={newConversation}>
        <LucideIcon icon={MessageSquarePlus} size="sm" /> New chat
        <Kbd class="ml-auto" aria-hidden="true">⌘ K</Kbd>
      </Button>
      <IconButton variant="ghost" class="@3xl:hidden" label="Close conversation navigation" onclick={() => (sidebarOpen = false)}><Icon icon="close" size="sm" /></IconButton>
    </div>
    <div class="px-3 pb-2">
      <label for="conversation-search" class="sr-only">Search conversations</label>
      <div class="relative">
        <Icon icon="search" size="sm" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input bind:ref={searchInput} bind:value={query} id="conversation-search" class="pl-9" placeholder="Search conversations" aria-keyshortcuts="Meta+K Control+K" />
      </div>
      <Select.Root
        value={folderFilter || ALL_FOLDERS}
        items={folderItems}
        onValueChange={(value) => (folderFilter = value === ALL_FOLDERS ? '' : value)}
      >
        <Select.Trigger id="conversation-folder-filter" aria-label="Filter by folder" size="sm" class="mt-2 w-full text-xs text-muted-foreground">
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {#each folderItems as item (item.value)}<Select.Item value={item.value} label={item.label}>{item.label}</Select.Item>{/each}
        </Select.Content>
      </Select.Root>
    </div>
    <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Conversations">
      {#if sortedConversations.length === 0}<p class="px-3 py-6 text-center text-xs text-muted-foreground">No conversations found.</p>{/if}
      <ul class="space-y-1">
        {#each sortedConversations as conversation (conversation.id)}
          <li class={`rounded-xl p-1 ${activeId === conversation.id ? 'bg-muted' : 'hover:bg-muted/60'}`}>
            {#if editingId === conversation.id}
              <form class="flex gap-1" onsubmit={(event) => { event.preventDefault(); saveRename(conversation.id); }}>
                <label class="sr-only" for={`rename-${conversation.id}`}>Conversation title</label>
                <Input id={`rename-${conversation.id}`} bind:value={editDraft} class="min-w-0 flex-1" maxlength={80} />
                <IconButton type="submit" variant="ghost" label="Save conversation title"><Icon icon="check" size="sm" /></IconButton>
              </form>
            {:else}
              <div class="flex min-w-0 items-center gap-1">
                <Button variant="ghost" class="h-auto min-h-10 min-w-0 flex-1 flex-col items-stretch justify-center gap-0 px-2 py-1 text-left font-normal" aria-current={activeId === conversation.id ? 'page' : undefined} onclick={() => selectConversation(conversation.id)}>
                  <span class="flex items-center gap-1.5 truncate text-sm">{#if conversation.pinned}<LucideIcon icon={Pin} size="xs" label="Pinned" class="shrink-0 text-primary" />{/if}<span class="truncate">{conversation.title || 'New conversation'}</span></span>
                  <span class="mt-0.5 block truncate text-[0.68rem] text-muted-foreground">{conversation.folder ?? 'Personal'} · {formatDate(conversation.updatedAt)}</span>
                </Button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="shrink-0" aria-label={`Actions for ${conversation.title}`}><LucideIcon icon={MoreHorizontal} size="sm" /></DropdownMenu.Trigger>
                  <DropdownMenu.Content class="w-48">
                    <DropdownMenu.Item disabled={!onRenameConversation} onSelect={() => { editingId = conversation.id; editDraft = conversation.title; }}>{conversation.title ? 'Rename' : 'Name conversation'}</DropdownMenu.Item>
                    <DropdownMenu.Item disabled={!onTogglePin} onSelect={() => onTogglePin?.(conversation.id)}>{conversation.pinned ? 'Unpin' : 'Pin'} conversation</DropdownMenu.Item>
                    {#if folders.length > 0}
                      <DropdownMenu.Separator />
                      <DropdownMenu.Group>
                        <DropdownMenu.Label>Move {conversation.title} to folder</DropdownMenu.Label>
                        <DropdownMenu.RadioGroup value={conversation.folder ?? ''} onValueChange={(folder) => onMoveToFolder?.(conversation.id, folder || null)}>
                          {#each folders as folder (folder)}<DropdownMenu.RadioItem value={folder} disabled={!onMoveToFolder}>{folder}</DropdownMenu.RadioItem>{/each}
                        </DropdownMenu.RadioGroup>
                        {#if conversation.folder}<DropdownMenu.Item disabled={!onMoveToFolder} onSelect={() => onMoveToFolder?.(conversation.id, null)}>Remove from folder</DropdownMenu.Item>{/if}
                      </DropdownMenu.Group>
                    {/if}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>
    <form class="flex gap-2 border-t border-border p-3" onsubmit={(event) => { event.preventDefault(); addFolder(); }}>
      <label for="new-conversation-folder" class="sr-only">New folder name</label>
      <Input id="new-conversation-folder" bind:value={folderDraft} maxlength={40} class="min-w-0 flex-1 text-xs" placeholder="New folder" disabled={!onCreateFolder} />
      <IconButton type="submit" variant="ghost" label="Create folder" disabled={!onCreateFolder || !folderDraft.trim()}><LucideIcon icon={FolderPlus} size="sm" /></IconButton>
    </form>
    <p class="px-4 pb-3 text-[0.65rem] text-muted-foreground">All conversations and models are simulated.</p>
  </aside>

  <section class="flex min-w-0 flex-1 flex-col" aria-label="Assistant conversation">
    <header class="flex min-h-14 items-center gap-2 border-b border-border px-3 @xl:px-5">
      <IconButton variant="ghost" class="@3xl:hidden" label="Open conversation history" onclick={() => (sidebarOpen = true)}><Icon icon="menu" size="sm" /></IconButton>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-sm font-semibold">{activeConversation?.title || 'New conversation'}</h1>
        <p class="text-[0.68rem] text-muted-foreground">{activeModel?.name ?? 'Simulated assistant'} · Simulated</p>
      </div>
      {#if onShare}<Button variant="ghost" size="sm" aria-label="Create share link" disabled={!activeId} onclick={createShareLink}><LucideIcon icon={Share2} size="sm" /><span class="hidden @xl:inline">Share</span></Button>{/if}
      {#if canvas}<Badge variant="outline" class="gap-1"><LucideIcon icon={FileText} size="xs" /> Canvas open</Badge>{/if}
    </header>
    {#if shareUrl || shareError}
      <div class="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2">
        {#if shareUrl}<label for="assistant-share-link" class="sr-only">Share link</label><Input id="assistant-share-link" readonly value={shareUrl} class="min-w-0 flex-1 text-xs" /><IconButton variant="ghost" size="sm" label="Copy share link" onclick={copyShareLink}>{#if copiedShare}<Icon icon="check" size="sm" />{:else}<LucideIcon icon={Copy} size="sm" />{/if}</IconButton>{/if}
        {#if shareError}<p role="alert" class="text-xs text-destructive">{shareError}</p>{/if}
        <IconButton variant="ghost" size="sm" label="Close share link" onclick={() => { shareUrl = ''; shareError = ''; }}><Icon icon="close" size="sm" /></IconButton>
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
            <div class="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-8">
              <div class="mb-8 text-center">
                <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LucideIcon icon={MessageSquarePlus} size="md" /></div>
                <h2 class="text-xl font-semibold tracking-tight @xl:text-2xl">What would you like to explore?</h2>
                <p class="mt-2 text-sm text-muted-foreground">Draft, reason, and experiment with a deterministic simulated assistant.</p>
              </div>
              <div class="grid gap-2 @xl:grid-cols-2">
                {#each suggestions as suggestion (suggestion)}
                  <Button variant="outline" class="h-auto min-h-14 flex-col items-start justify-start whitespace-normal px-4 py-3 text-left font-normal text-muted-foreground hover:text-foreground" disabled={!activeId || !activeModel || streaming} onclick={() => chooseSuggestion(suggestion)}><span>{suggestion}</span><LucideIcon icon={ArrowDown} size="xs" class="mt-1 text-muted-foreground/60" /></Button>
                {/each}
              </div>
            </div>
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
