<script lang="ts">
import {
  ArrowUpRight,
  Bot,
  Circle,
  FileText,
  FolderPlus,
  MoreHorizontal,
  Sparkles,
  Star,
} from '@lucide/svelte';
import type { AssistantCanvas, AssistantSendInput } from '@protoyard/ai-ui';
import { AssistantComposer, MessageList } from '@protoyard/ai-ui';
import { Button, Drawer, Input, Notice, Select, Separator } from '@protoyard/ui';
import type { Component } from 'svelte';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { InputGroup } from 'texuli/input';
import { Box, Heading, Text } from 'texuli/typography';
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
  (messages.current ?? []).filter((message) => message.conversationId === activeConversation?.id)
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

async function loadCanvas() {
  try {
    if (!CanvasPanel) CanvasPanel = (await import('../components/LazyCanvas.svelte')).default;
    if (!settings.current?.canvas)
      await services.updateCanvas('Start shaping an idea here. Changes are saved in this browser.');
    canvasOpen = true;
  } catch (error) {
    report(error);
  }
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
        <Button type="button" variant={selectedProjectId === project.id ? 'secondary' : 'outline'} size="sm" class="min-h-9 shrink-0 gap-1.5 px-3" aria-pressed={selectedProjectId === project.id} onclick={() => (selectedProjectId = selectedProjectId === project.id ? '' : project.id)}><Icon icon={Circle} size="xs" color={project.color} fill={project.color} aria-hidden="true" />{project.name}</Button>
      {/each}
    </div>
    <Button type="button" variant="outline" size="sm" class="min-h-9 gap-1.5 px-3" onclick={createConversation}><Icon icon="plus" class="size-3.5" aria-hidden="true" /> New</Button>
  </div>
  {#if notice}<Notice tone="info" text={notice} class="mb-2" />{/if}
  {#if activeConversation}
    <Box surface="default" border="default" radius="xl" elevation="sm" padding="none" class="flex min-h-0 flex-1 overflow-hidden">
      <Box as="aside" surface="subtle" radius="none" padding="sm" class="hidden w-64 shrink-0 flex-col md:flex" aria-label="Conversation history">
        <InputGroup bind:value={search} class="mb-3 min-h-10" inputProps={{ id: 'history-search', placeholder: 'Search history', 'aria-label': 'Search conversations' }}>
          {#snippet start()}<Icon icon="search" class="size-3.5" aria-hidden="true" />{/snippet}
        </InputGroup>
        <Text size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide" class="mb-2 px-2">Recent conversations</Text>
        <div class="min-h-0 flex-1 overflow-y-auto">
          {#each visibleConversations as conversation (conversation.id)}
            <Button type="button" variant={conversation.id === activeConversation.id ? 'secondary' : 'ghost'} size="sm" class="mb-1 h-auto w-full justify-start whitespace-normal px-2 py-2 text-left" aria-current={conversation.id === activeConversation.id ? 'page' : undefined} onclick={() => (selectedConversationId = conversation.id)}>{conversation.pinned ? '★ ' : ''}{conversation.title}</Button>
          {/each}
          {#if visibleConversations.length === 0}<Text size="xs" tone="muted" class="px-2 py-3">No matching conversations.</Text>{/if}
        </div>
        <Separator class="mt-3" />
        <div class="pt-3">
          <Text as="div" size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide" class="mb-2 flex items-center justify-between px-1"><span>Folders</span><LucideIcon icon={FolderPlus} class="size-3.5" /></Text>
          {#each folders as folder (folder)}<Button type="button" variant={folderFilter === folder ? 'secondary' : 'ghost'} size="sm" class="mb-1 h-auto w-full justify-start whitespace-normal px-2 py-1.5 text-left" aria-pressed={folderFilter === folder} onclick={() => (folderFilter = folderFilter === folder ? '' : folder)}>{folder}</Button>{/each}
          <form class="mt-2 flex gap-1" onsubmit={(event) => { event.preventDefault(); void createFolder(); }}><label for="new-folder" class="sr-only">New folder name</label><Input id="new-folder" bind:value={folderDraft} class="min-w-0 flex-1" placeholder="New folder" maxlength={40} /><Button type="submit" variant="ghost" size="sm" class="px-2" aria-label="Create folder">+</Button></form>
        </div>
      </Box>
      <Separator orientation="vertical" class="hidden md:block" />
      <div class="flex min-w-0 flex-1 flex-col">
        <Box as="header" border="block-end" radius="none" padding="none" class="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
          <div class="min-w-0 flex-1"><Text size="sm" weight="medium" truncate>{activeConversation.title}</Text><Text size="xs" tone="muted">{activeConversation.folder ? `In ${activeConversation.folder} · ` : ''}Responses are simulated</Text></div>
          <Button type="button" variant="ghost" size="sm" class="min-h-9 gap-1 px-2" aria-label={activeConversation.pinned ? 'Unpin conversation' : 'Pin conversation'} aria-pressed={activeConversation.pinned ?? false} onclick={() => services.togglePin(activeConversation.id).catch(report)}><LucideIcon icon={Star} class="size-3.5" /> Pin</Button>
          <label for="conversation-folder" class="sr-only">Move conversation to folder</label>
          <Select id="conversation-folder" value={activeConversation.folder ?? ''} class="min-h-9 max-w-28" items={[{ value: '', label: 'No folder' }, ...folders.map((folder) => ({ value: folder, label: folder }))]} onValueChange={(value) => void services.moveToFolder(activeConversation.id, value || null).catch(report)} />
          <Button type="button" variant="ghost" size="sm" class="min-h-9 gap-1 px-2" onclick={() => services.rename(activeConversation.id, window.prompt('Rename conversation', activeConversation.title) ?? activeConversation.title).catch(report)}><LucideIcon icon={MoreHorizontal} class="size-3.5" /> Rename</Button>
          <Button type="button" variant="ghost" size="sm" class="min-h-9 gap-1 px-2" onclick={shareConversation}><LucideIcon icon={ArrowUpRight} class="size-3.5" /> Share</Button>
          <Button type="button" variant="ghost" size="sm" class="min-h-9 gap-1 px-2" onclick={loadCanvas}><LucideIcon icon={FileText} class="size-3.5" /> Canvas</Button>
        </Box>
        <MessageList
          messages={activeMessages}
          conversationId={activeConversation.id}
          {streaming}
          onRegenerate={() => void services.regenerate(activeConversation.id).catch(report)}
          onEditMessage={(id, content) => void services.editMessage(activeConversation.id, id, content, ASSISTANT_MODELS.find((model) => model.id === activeModelId) ?? ASSISTANT_MODELS[0]!).catch(report)}
          onFeedback={(id, rating) => void services.feedback(id, rating).catch(report)}
        />
        <Box border="block-start" radius="none" padding="none" class="p-3 sm:px-5">
          <AssistantComposer
            models={ASSISTANT_MODELS}
            modelId={activeModelId}
            {streaming}
            placeholder="Message Orbit…"
            onModelChange={(modelId) => void services.setModel(activeConversation.id, modelId).catch(report)}
            onStop={() => services.stop(activeConversation.id)}
            onSubmit={(input) => send(activeConversation.id, input)}
          />
          <Text as="div" size="xs" tone="muted" class="mt-2 flex flex-wrap items-center justify-center gap-1"><LucideIcon icon={Sparkles} class="size-3" /> Models and agent tools are simulated · <Button href="#/settings" variant="link" size="sm" class="h-auto p-0">Settings and data controls</Button></Text>
        </Box>
      </div>
    </Box>
    {#if CanvasPanel && settings.current?.canvas}
      {@const Panel = CanvasPanel}
      {@const canvas = settings.current.canvas}
      <Drawer bind:open={canvasOpen} title="Assistant canvas" hideTitle hideClose modal placement="right" size={672}>
        <Panel document={canvas} onChange={(content) => void services.updateCanvas(content).catch(report)} onClose={() => (canvasOpen = false)} />
      </Drawer>
    {/if}
  {:else}
    <Box surface="default" border="default" radius="xl" padding="none" class="my-auto flex min-h-0 flex-1 flex-col items-center justify-center px-5 text-center">
      <Box surface="muted" radius="xl" padding="none" class="mb-4 flex size-14 items-center justify-center"><LucideIcon icon={Bot} tone="primary" class="size-7" /></Box>
      <Heading level={1} size="lg">A little room for big ideas</Heading>
      <Text size="sm" tone="muted" align="center" class="mt-2 max-w-sm">Start a conversation with a deterministic local assistant. Nothing is sent to a real model provider.</Text>
      <Button type="button" size="lg" class="mt-5 min-h-11 gap-2 px-4" onclick={createConversation}><Icon icon="plus" class="size-4" aria-hidden="true" /> Start a conversation</Button>
    </Box>
  {/if}
</section>
