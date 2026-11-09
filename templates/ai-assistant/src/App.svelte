<script lang="ts">
import {
  Archive,
  AudioLines,
  Bot,
  Circle,
  Folder,
  MessageSquarePlus,
  Settings2,
  Sparkles,
} from '@lucide/svelte';
import { AI_MODELS } from '@protoyard/ai';
import type { AssistantSendInput } from '@protoyard/ai-ui';
import { AssistantWorkspace } from '@protoyard/ai-ui';
import { createRouter, Router } from '@protoyard/renderer-svelte';
import { Button, Kbd, Notice, Progress, Separator } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
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
let activeTab = $state<'assistant' | 'voice'>('assistant');
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
  alertText = '';
  try {
    const module = await import('@protoyard/ai-ui/voice');
    VoiceMode = module.VoiceMode;
    voiceLoaded = true;
  } catch (error) {
    alertText = messageOf(error);
  }
}

async function sendVoiceTranscript(prompt: string) {
  let conversation = activeConversation;
  if (!conversation) {
    const id = await services.createConversation(activeProjectId || undefined);
    selectedConversationId = id;
    conversation = (await db.conversations.get(id)) ?? undefined;
  }
  const model = allModels.find((item) => item.id === conversation?.modelId) ?? allModels[0];
  if (conversation && model) await services.send(conversation.id, prompt, model);
}

function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The simulated assistant could not complete that action.';
}
</script>

<div class="app-frame flex min-h-0">
  <Box as="aside" surface="subtle" radius="none" padding="md" class="hidden w-64 shrink-0 flex-col overflow-y-auto lg:flex" aria-label="Assistant workspace navigation">
    <Button href="#/" variant="ghost" class="mb-6 h-auto justify-start gap-3 px-2 py-2">
      <Box padding="none" radius="lg" surface="muted" class="flex size-9 items-center justify-center"><LucideIcon icon={Sparkles} tone="primary" class="size-5" /></Box>
      <Text as="span" size="sm" weight="semibold">Orbit <Text as="span" size="sm" tone="muted">Assistant</Text></Text>
    </Button>
    <Button type="button" variant="outline" class="mb-5 min-h-11 justify-start gap-2 px-3" onclick={createConversation}>
      <LucideIcon icon={MessageSquarePlus} class="size-4" /> New conversation <Kbd class="ml-auto">⌘ K</Kbd>
    </Button>
    <Text size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide" class="px-2 pb-2">Projects</Text>
    <nav class="space-y-1" aria-label="Projects">
      {#each projects.current ?? [] as project (project.id)}
        <Button type="button" variant={activeProjectId === project.id ? 'secondary' : 'ghost'} class="min-h-10 w-full justify-start gap-2 whitespace-normal px-2" aria-pressed={activeProjectId === project.id} onclick={() => (activeProjectId = activeProjectId === project.id ? '' : project.id)}>
          <Icon icon={Circle} size="xs" color={project.color} fill={project.color} aria-hidden="true" /><span class="truncate">{project.name}</span>
        </Button>
      {/each}
    </nav>
    <Text as="div" size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide" class="mt-6 flex items-center gap-2 px-2 pb-2"><LucideIcon icon={Folder} class="size-3.5" /> History</Text>
    <div class="min-h-24 flex-1 overflow-y-auto">
      {#each projectConversations.slice(0, 10) as conversation (conversation.id)}
        <Button type="button" variant={conversation.id === activeConversation?.id ? 'secondary' : 'ghost'} size="sm" class="mb-1 h-auto w-full justify-start whitespace-normal px-2 py-2 text-left" onclick={() => (selectedConversationId = conversation.id)}>{conversation.pinned ? '★ ' : ''}{conversation.title}</Button>
      {/each}
    </div>
    <Box surface="default" border="default" radius="lg" padding="sm" class="mt-3">
      <div class="flex items-center justify-between"><Text as="span" size="xs">Monthly usage</Text><Text as="span" size="xs" tabular>{Math.min(100, Math.round((usedTokens / monthlyLimit) * 100))}%</Text></div>
      <Progress value={Math.min(usedTokens, monthlyLimit)} max={monthlyLimit} ariaLabel="Simulated monthly token usage" size="sm" class="mt-2" />
      <Text size="xs" tone="muted" class="mt-1">{usedTokens.toLocaleString()} / {monthlyLimit.toLocaleString()} tokens · simulated</Text>
    </Box>
    <Button href="#/settings" variant="ghost" class="mt-3 min-h-10 justify-start gap-2 px-2"><LucideIcon icon={Settings2} class="size-4" /> Settings</Button>
  </Box>
  <Separator orientation="vertical" class="hidden lg:block" />

  <main class="flex min-w-0 flex-1 flex-col p-2 sm:p-4 lg:p-6">
    <Box as="header" surface="default" border="default" radius="xl" elevation="sm" padding="none" class="mb-3 flex items-center justify-between px-4 py-3">
      <div><Text size="sm" weight="semibold">{router.current.route?.title ?? 'Assistant'}</Text><Text size="xs" tone="muted">A calm place to think, build, and explore</Text></div>
      <div class="flex items-center gap-2">
        <Button type="button" variant={activeTab === 'assistant' ? 'secondary' : 'ghost'} size="sm" class="min-h-10 gap-2 px-3" aria-pressed={activeTab === 'assistant'} onclick={() => (activeTab = 'assistant')}><LucideIcon icon={Bot} class="size-4" /> Assistant</Button>
        <Button type="button" variant={activeTab === 'voice' ? 'secondary' : 'ghost'} size="sm" class="min-h-10 gap-2 px-3" aria-pressed={activeTab === 'voice'} onclick={loadVoice}><LucideIcon icon={AudioLines} class="size-4" /> Voice</Button>
        <Button href="#/settings" variant="ghost" size="icon" class="size-10 lg:hidden" aria-label="Settings"><LucideIcon icon={Settings2} class="size-4" /></Button>
      </div>
    </Box>
    {#if alertText}<Notice tone="error" text={alertText} class="mb-3" />{/if}
    {#if activeTab === 'voice'}
      <Box as="section" surface="default" border="default" radius="xl" elevation="sm" padding="lg" class="mx-auto my-auto w-full max-w-xl">
        {#if VoiceMode}
          <VoiceMode clock={{ now: () => runtime.clock.now(), nowMs: () => runtime.clock.nowMs(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }} onTranscript={(text) => void sendVoiceTranscript(text)} reply={activeMessages.at(-1)?.role === 'assistant' ? activeMessages.at(-1)?.content : ''} />
        {:else}<Text as="div" size="sm" tone="muted" align="center" class="py-10" role="status">Loading voice mode…</Text>{/if}
      </Box>
    {:else}
      <!-- A definite-height, clipped box: the screen scrolls inside it and never runs under the footer. -->
      <div class="screen-host min-h-0 flex-1 overflow-hidden">
        <Router {router} />
      </div>
    {/if}
    <footer class="flex shrink-0 items-center justify-center pt-2"><Text as="span" size="xs" tone="muted" class="flex items-center gap-1"><LucideIcon icon={Archive} class="size-3" /> Simulation only · responses use deterministic local packs · no model provider is contacted <Icon icon="check" class="size-3" aria-hidden="true" /></Text></footer>
  </main>
</div>

<style>
  /* The renderer writes the frame height (device and browser frames); layout only. */
  .app-frame {
    height: var(--py-app-height, 100dvh);
  }

  /* The routed screen fills the clipped host. */
  .screen-host > :global(*) {
    height: 100%;
  }
</style>
