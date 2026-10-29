<script lang="ts">
import {
  Archive,
  AudioLines,
  Bot,
  Folder,
  MessageSquarePlus,
  Settings2,
  Sparkles,
} from '@lucide/svelte';
import { AI_MODELS } from '@protoyard/ai';
import type { AssistantSendInput } from '@protoyard/ai-ui';
import { createRouter, Router } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import type { Component } from 'svelte';
import { onDestroy } from 'svelte';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { provideAssistant } from './lib/context.ts';
import Settings from './screens/Settings.svelte';
import Workspace from './screens/Workspace.svelte';

const { runtime, db, services, projects, conversations, messages, settings } = provideAssistant();
const router = createRouter(
  [
    { path: '/', component: Workspace, title: 'Assistant' },
    { path: '/settings', component: Settings, title: 'Settings' },
  ],
  { titleSuffix: runtime.manifest.name, scrollToTop: false }
);
onDestroy(() => router.destroy());

let activeProjectId = $state('');
let selectedConversationId = $state('');
let alertText = $state('');
let voiceLoaded = $state(false);
let VoiceMode = $state<typeof import('@protoyard/ai-ui/voice').VoiceMode | null>(null);
let WidgetDemo = $state<Component | null>(null);
let activeTab = $state<'assistant' | 'voice' | 'widget'>('assistant');
const allModels = [
  ...AI_MODELS,
  {
    id: 'py-orbit-agent',
    name: 'Orbit Agent',
    provider: 'Protoyard Simulations',
    contextWindow: 16_000,
    inputCostPerMillion: 0.2,
    outputCostPerMillion: 0.8,
    simulated: true as const,
  },
];
const projectConversations = $derived(
  (conversations.current ?? []).filter(
    (conversation) => !activeProjectId || conversation.projectId === activeProjectId
  )
);
const activeConversation = $derived(
  (conversations.current ?? []).find(
    (conversation) => conversation.id === selectedConversationId
  ) ?? projectConversations[0]
);
const activeMessages = $derived(
  (messages.current ?? []).filter((message) => message.conversationId === activeConversation?.id)
);
const latestAssistantReply = $derived(
  [...activeMessages].reverse().find((message) => message.role === 'assistant')?.content ?? ''
);
const usedTokens = $derived(
  (messages.current ?? [])
    .filter((message) =>
      message.createdAt.startsWith(runtime.clock.now().toISOString().slice(0, 7))
    )
    .reduce((sum, message) => sum + (message.usage?.totalTokens ?? 0), 0)
);
const monthlyLimit = $derived(settings.current?.monthlyLimit ?? 1_000_000);

async function createConversation() {
  alertText = '';
  try {
    selectedConversationId = await services.createConversation(activeProjectId || undefined);
  } catch (error) {
    alertText = messageOf(error);
  }
}

async function send(conversationId: string, input: AssistantSendInput) {
  alertText = '';
  try {
    await services.send(conversationId, input.prompt, input.model, input.attachments);
  } catch (error) {
    alertText = messageOf(error);
  }
}

async function loadVoice() {
  activeTab = 'voice';
  if (voiceLoaded) return;
  const module = await import('@protoyard/ai-ui/voice');
  VoiceMode = module.VoiceMode;
  voiceLoaded = true;
}

async function loadWidgetDemo() {
  activeTab = 'widget';
  if (WidgetDemo) return;
  WidgetDemo = (await import('./components/WidgetDemo.svelte')).default;
}

async function sendVoiceTranscript(prompt: string) {
  let conversation = activeConversation;
  if (!conversation) {
    const id = await services.createConversation(activeProjectId || undefined);
    selectedConversationId = id;
    conversation = (await db.conversations.get(id)) ?? undefined;
  }
  const model = allModels.find((item) => item.id === conversation?.modelId) ?? allModels[0];
  const needsApproval =
    model?.id === 'py-orbit-agent' && Boolean(settings.current?.agentApprovalRequired);
  const approved =
    !needsApproval ||
    window.confirm('Approve this simulated agent tool call against the fictional local index?');
  if (!conversation || !model || !approved) return;
  try {
    await services.send(conversation.id, prompt, model, [], approved);
  } catch (error) {
    alertText = messageOf(error);
  }
}

function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The simulated assistant could not complete that action.';
}
</script>

<div class="flex h-[var(--py-app-height,100dvh)] min-h-0 bg-background text-foreground">
  <aside class="hidden h-full min-h-0 w-64 shrink-0 flex-col border-r border-border bg-surface p-4 lg:flex overflow-y-auto" aria-label="Assistant workspace navigation">
    <a href="#/" class="mb-6 flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold">
      <span class="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><LucideIcon icon={Sparkles} class="size-5" /></span>
      <span>Nova <span class="font-normal text-muted-foreground">Assistant</span></span>
    </a>
    <Button type="button" variant="outline" class="mb-5 flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-left text-sm font-medium text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onclick={createConversation}>
      <LucideIcon icon={MessageSquarePlus} class="size-4" /> New conversation <span class="ml-auto text-xs text-muted-foreground">⌘ K</span>
    </Button>
    <p class="px-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Projects</p>
    <nav class="space-y-1" aria-label="Projects">
      {#each projects.current ?? [] as project (project.id)}
        <Button type="button" variant="ghost" class={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted ${activeProjectId === project.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`} aria-pressed={activeProjectId === project.id} onclick={() => (activeProjectId = activeProjectId === project.id ? '' : project.id)}>
          <span class="size-2 rounded-full" style={`background:${project.color}`}></span><span class="truncate">{project.name}</span>
        </Button>
      {/each}
    </nav>
    <div class="mt-6 flex items-center gap-2 px-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-muted-foreground"><LucideIcon icon={Folder} class="size-3.5" /> History</div>
    <div class="min-h-24 flex-1 overflow-y-auto">
      {#each projectConversations.slice(0, 10) as conversation (conversation.id)}
        <Button type="button" variant="ghost" class={`mb-1 w-full truncate rounded-lg px-2 py-2 text-left text-xs hover:bg-muted ${conversation.id === activeConversation?.id ? 'bg-muted text-foreground' : 'text-muted-foreground'}`} onclick={() => (selectedConversationId = conversation.id)}>{conversation.pinned ? '★ ' : ''}{conversation.title}</Button>
      {/each}
    </div>
    <div class="mt-3 rounded-xl border border-border bg-surface p-3">
      <div class="flex items-center justify-between text-xs"><span>Monthly usage</span><span class="tabular-nums">{Math.min(100, Math.round((usedTokens / monthlyLimit) * 100))}%</span></div>
      <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Simulated monthly token usage" aria-valuemin="0" aria-valuemax={monthlyLimit} aria-valuenow={usedTokens}><div class="h-full rounded-full bg-primary" style={`width:${Math.min(100, (usedTokens / monthlyLimit) * 100)}%`}></div></div>
      <p class="mt-1 text-[0.65rem] text-muted-foreground">{usedTokens.toLocaleString()} / {monthlyLimit.toLocaleString()} tokens · simulated</p>
    </div>
    <a href="#/settings" class="mt-3 flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted"><LucideIcon icon={Settings2} class="size-4" /> Settings</a>
  </aside>

  <main class="flex min-w-0 flex-1 flex-col p-2 sm:p-4 lg:p-6">
    <header class="mb-3 flex items-center justify-between rounded-2xl border border-border bg-surface/90 px-4 py-3 shadow-sm">
      <div><p class="text-sm font-semibold">{router.current.route?.title ?? 'Assistant'}</p><p class="text-[0.68rem] text-muted-foreground">A calm place to think, build, and explore</p></div>
      <div class="flex items-center gap-2">
        <Button type="button" variant="ghost" class={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs ${activeTab === 'assistant' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`} aria-pressed={activeTab === 'assistant'} onclick={() => (activeTab = 'assistant')}><LucideIcon icon={Bot} class="size-4" /> Assistant</Button>
        <Button type="button" variant="ghost" class={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs ${activeTab === 'voice' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`} aria-pressed={activeTab === 'voice'} onclick={() => void loadVoice()}><LucideIcon icon={AudioLines} class="size-4" /> Voice</Button>
        <Button type="button" variant="ghost" class={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs ${activeTab === 'widget' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`} aria-pressed={activeTab === 'widget'} onclick={() => void loadWidgetDemo()}><LucideIcon icon={MessageSquarePlus} class="size-4" /> Widget demo</Button>
        <a href="#/settings" class="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden" aria-label="Settings"><LucideIcon icon={Settings2} class="size-4" /></a>
      </div>
    </header>
    {#if alertText}<p class="mb-3 rounded-xl border border-destructive bg-surface px-4 py-3 text-sm text-destructive" role="alert">{alertText}</p>{/if}
    {#if activeTab === 'voice'}
      <section class="mx-auto my-auto w-full max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-sm">
        {#if VoiceMode}
          <VoiceMode clock={{ now: () => runtime.clock.now(), nowMs: () => runtime.clock.nowMs(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }} onTranscript={(text) => void sendVoiceTranscript(text)} reply={latestAssistantReply} />
        {:else}<div class="py-10 text-center text-sm text-muted-foreground" role="status">Loading voice mode…</div>{/if}
      </section>
    {:else if activeTab === 'widget'}
      <div class="min-h-0 flex-1"><WidgetDemo /></div>
    {:else}
      <!-- A definite-height, clipped box: the screen scrolls inside it and never runs under the footer. -->
      <div class="min-h-0 flex-1 overflow-hidden *:h-full">
        <Router {router} />
      </div>
    {/if}
    <footer class="flex shrink-0 items-center justify-center gap-1 pt-2 text-[0.65rem] text-muted-foreground"><LucideIcon icon={Archive} class="size-3" /> Simulation only · responses use deterministic local packs · no model provider is contacted <Icon icon="check" class="size-3" aria-hidden="true" /></footer>
  </main>
</div>
