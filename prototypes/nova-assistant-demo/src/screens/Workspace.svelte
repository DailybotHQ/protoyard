<script lang="ts">
import {
  ArrowUpRight,
  Bot,
  FileText,
  FolderPlus,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Star,
} from '@lucide/svelte';
import type { AssistantCanvas, AssistantSendInput } from '@protoyard/ai-ui';
import { AssistantComposer, MessageList } from '@protoyard/ai-ui';
import type { Component } from 'svelte';
import { ASSISTANT_MODELS } from '../domain/services.ts';
import { useAssistant } from '../lib/context.ts';

type LazyCanvasComponent = Component<{
  document: AssistantCanvas;
  onChange: (content: string) => void;
  onClose: () => void;
}>;
const { services, conversations, messages, projects, settings } = useAssistant();
let selectedConversationId = $state('');
let selectedProjectId = $state('');
let messageListRevision = $state(0);
let streamingConversation = $state('');
let search = $state('');
let folderFilter = $state('');
let folderDraft = $state('');
let notice = $state('');
let canvasOpen = $state(false);
let CanvasPanel = $state<LazyCanvasComponent | null>(null);
const visibleConversations = $derived(
  (conversations.current ?? []).filter(
    (conversation) =>
      (!selectedProjectId || conversation.projectId === selectedProjectId) &&
      (!folderFilter || conversation.folder === folderFilter) &&
      (!search.trim() || conversation.title.toLowerCase().includes(search.trim().toLowerCase()))
  )
);
const activeConversation = $derived(
  (conversations.current ?? []).find(
    (conversation) => conversation.id === selectedConversationId
  ) ?? visibleConversations[0]
);
const activeMessages = $derived(
  (messages.current ?? [])
    .filter((message) => message.conversationId === activeConversation?.id)
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        (left.role === right.role ? 0 : left.role === 'user' ? -1 : 1)
    )
);
const activeModelId = $derived(
  activeConversation?.modelId ?? ASSISTANT_MODELS[0]?.id ?? 'py-orbit-small'
);
const streaming = $derived(streamingConversation === activeConversation?.id);
const folders = $derived(settings.current?.folders ?? []);

async function createConversation() {
  notice = '';
  try {
    selectedConversationId = await services.createConversation(selectedProjectId || undefined);
  } catch (error) {
    notice = error instanceof Error ? error.message : 'Could not create a conversation.';
  }
}

async function send(conversationId: string, input: AssistantSendInput) {
  selectedConversationId = conversationId;
  messageListRevision += 1;
  streamingConversation = conversationId;
  notice = '';
  try {
    const requiresApproval =
      input.model.id === 'py-orbit-agent' && Boolean(settings.current?.agentApprovalRequired);
    const agentApproved =
      requiresApproval &&
      window.confirm(
        'This scenario asks the simulated agent to use a local tool. Approve this simulated tool run?'
      );
    if (requiresApproval && !agentApproved) {
      notice = 'The simulated agent run was not approved.';
      return false;
    }
    await services.send(
      conversationId,
      input.prompt,
      input.model,
      input.attachments,
      agentApproved
    );
    return true;
  } catch (error) {
    notice =
      error instanceof Error
        ? error.message
        : 'The simulated assistant could not complete that request.';
    return false;
  } finally {
    streamingConversation = '';
  }
}

async function regenerate(conversationId: string) {
  messageListRevision += 1;
  streamingConversation = conversationId;
  notice = '';
  try {
    await services.regenerate(conversationId);
  } catch (error) {
    notice =
      error instanceof Error
        ? error.message
        : 'The simulated assistant could not regenerate that reply.';
  } finally {
    streamingConversation = '';
  }
}

async function loadCanvas() {
  if (!CanvasPanel) CanvasPanel = (await import('../components/LazyCanvas.svelte')).default;
  if (!settings.current?.canvas)
    await services.updateCanvas('Start shaping an idea here. Changes are saved in this browser.');
  canvasOpen = true;
}

async function shareConversation() {
  if (!activeConversation) return;
  try {
    const link = await services.share(activeConversation.id);
    await navigator.clipboard.writeText(link);
    notice = 'Local conversation link copied.';
  } catch {
    notice = 'Clipboard access is unavailable; the local link was not copied.';
  }
}

async function createFolder() {
  if (!folderDraft.trim()) return;
  try {
    await services.createFolder(folderDraft);
    folderDraft = '';
  } catch (error) {
    notice = error instanceof Error ? error.message : 'Could not create this folder.';
  }
}

function report(error: unknown) {
  notice = error instanceof Error ? error.message : 'The action could not be completed.';
}
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="Assistant workspace">
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <div class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
      {#each projects.current ?? [] as project (project.id)}
        <button type="button" class={`min-h-9 shrink-0 rounded-full border px-3 text-xs transition-colors ${selectedProjectId === project.id ? 'border-primary bg-muted text-primary' : 'border-border bg-surface text-muted-foreground hover:bg-muted'}`} aria-pressed={selectedProjectId === project.id} onclick={() => (selectedProjectId = selectedProjectId === project.id ? '' : project.id)}><span class="mr-1.5 inline-block size-1.5 rounded-full" style={`background:${project.color}`}></span>{project.name}</button>
      {/each}
    </div>
    <button type="button" class="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-muted-foreground hover:bg-muted" onclick={createConversation}><Plus class="size-3.5" aria-hidden="true" /> New</button>
  </div>
  {#if notice}<p class="mb-2 rounded-lg border border-destructive bg-surface px-3 py-2 text-xs text-destructive" role="status">{notice}</p>{/if}
  {#if activeConversation}
    <div class="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <aside class="hidden w-64 shrink-0 flex-col border-r border-border bg-background p-3 md:flex" aria-label="Conversation history">
        <label for="history-search" class="sr-only">Search conversations</label>
        <div class="mb-3 flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3"><Search class="size-3.5 text-muted-foreground" aria-hidden="true" /><input id="history-search" bind:value={search} class="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Search history" /></div>
        <p class="mb-2 px-2 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recent conversations</p>
        <div class="min-h-0 flex-1 overflow-y-auto">
          {#each visibleConversations as conversation (conversation.id)}
            <button type="button" class={`mb-1 w-full truncate rounded-lg px-2 py-2 text-left text-xs ${conversation.id === activeConversation.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`} aria-current={conversation.id === activeConversation.id ? 'page' : undefined} onclick={() => (selectedConversationId = conversation.id)}>{conversation.pinned ? '★ ' : ''}{conversation.title}</button>
          {/each}
          {#if visibleConversations.length === 0}<p class="px-2 py-3 text-xs text-muted-foreground">No matching conversations.</p>{/if}
        </div>
        <div class="mt-3 border-t border-border pt-3">
          <div class="mb-2 flex items-center justify-between px-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><span>Folders</span><FolderPlus class="size-3.5" aria-hidden="true" /></div>
          {#each folders as folder (folder)}<button type="button" class={`mb-1 block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs ${folderFilter === folder ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`} aria-pressed={folderFilter === folder} onclick={() => (folderFilter = folderFilter === folder ? '' : folder)}>{folder}</button>{/each}
          <form class="mt-2 flex gap-1" onsubmit={(event) => { event.preventDefault(); void createFolder(); }}><label for="new-folder" class="sr-only">New folder name</label><input id="new-folder" bind:value={folderDraft} class="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-ring" placeholder="New folder" maxlength="40" /><button type="submit" class="rounded-md px-2 text-xs text-primary hover:bg-muted" aria-label="Create folder">+</button></form>
        </div>
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
          <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-foreground">{activeConversation.title}</p><p class="text-[0.65rem] text-muted-foreground">{activeConversation.folder ? `In ${activeConversation.folder} · ` : ''}Responses are simulated</p></div>
          <button type="button" class="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted" aria-label={activeConversation.pinned ? 'Unpin conversation' : 'Pin conversation'} aria-pressed={activeConversation.pinned ?? false} onclick={() => void services.togglePin(activeConversation.id).catch(report)}><Star class="size-3.5" aria-hidden="true" /> Pin</button>
          <label for="conversation-folder" class="sr-only">Move conversation to folder</label>
          <select id="conversation-folder" value={activeConversation.folder ?? ''} class="min-h-9 max-w-28 rounded-lg border border-border bg-surface px-2 text-xs text-muted-foreground" onchange={(event) => void services.moveToFolder(activeConversation.id, event.currentTarget.value || null).catch(report)}><option value="">No folder</option>{#each folders as folder (folder)}<option value={folder}>{folder}</option>{/each}</select>
          <button type="button" class="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted" onclick={() => void services.rename(activeConversation.id, window.prompt('Rename conversation', activeConversation.title) ?? activeConversation.title).catch(report)}><MoreHorizontal class="size-3.5" aria-hidden="true" /> Rename</button>
          <button type="button" class="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted" onclick={() => void shareConversation()}><ArrowUpRight class="size-3.5" aria-hidden="true" /> Share</button>
          <button type="button" class="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted" onclick={() => void loadCanvas()}><FileText class="size-3.5" aria-hidden="true" /> Canvas</button>
        </header>
        {#key messageListRevision}
          <MessageList
            messages={activeMessages}
            conversationId={activeConversation.id}
            {streaming}
            onRegenerate={() => void regenerate(activeConversation.id)}
            onEditMessage={(id, content) => void services.editMessage(activeConversation.id, id, content, ASSISTANT_MODELS.find((model) => model.id === activeModelId) ?? ASSISTANT_MODELS[0]!).catch(report)}
            onFeedback={(id, rating) => void services.feedback(id, rating).catch(report)}
          />
        {/key}
        <div class="border-t border-border p-3 sm:px-5">
          <AssistantComposer
            models={ASSISTANT_MODELS}
            modelId={activeModelId}
            {streaming}
            placeholder="Message Nova…"
            onModelChange={(modelId) => void services.setModel(activeConversation.id, modelId).catch(report)}
            onStop={() => services.stop(activeConversation.id)}
            onSubmit={(input) => send(activeConversation.id, input)}
          />
          <p class="mt-2 flex items-center justify-center gap-1 text-[0.62rem] text-muted-foreground"><Sparkles class="size-3" aria-hidden="true" /> Models and agent tools are simulated · <a href="#/settings" class="underline decoration-dotted underline-offset-2">Settings and data controls</a></p>
        </div>
      </div>
    </div>
    {#if canvasOpen && CanvasPanel && settings.current?.canvas}
      <div class="fixed inset-0 z-40 flex bg-black/20 p-3 sm:p-6" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) canvasOpen = false; }}>
        <div class="ml-auto flex h-full w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-xl" role="dialog" aria-modal="true" aria-label="Assistant canvas">
          <CanvasPanel document={settings.current.canvas} onChange={(content) => void services.updateCanvas(content).catch(report)} onClose={() => (canvasOpen = false)} />
        </div>
      </div>
    {/if}
  {:else}
    <div class="my-auto flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-5 text-center">
      <span class="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-primary"><Bot class="size-7" aria-hidden="true" /></span>
      <h1 class="text-xl font-semibold tracking-tight">A little room for big ideas</h1>
      <p class="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Start a conversation with a deterministic local assistant. Nothing is sent to a real model provider.</p>
      <button type="button" class="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onclick={createConversation}><Plus class="size-4" aria-hidden="true" /> Start a conversation</button>
    </div>
  {/if}
</section>
