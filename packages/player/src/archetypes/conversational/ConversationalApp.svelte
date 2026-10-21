<script lang="ts">
import type { AssistantSendInput } from '@protoyard/ai-ui';
import { type Blueprint, createEntityServices } from '@protoyard/blueprint';
import { getRuntime, liveQuery } from '@protoyard/renderer-svelte';
import { ErrorState, LoadingState } from '@protoyard/ui';
import { createConversationalAdapter } from './adapter.ts';
import { scriptedReply } from './reply.ts';

let { blueprint }: { blueprint: Blueprint } = $props();
const runtime = getRuntime();
const services = $derived(createEntityServices(runtime, blueprint));
const adapter = $derived(createConversationalAdapter(blueprint));
const conversationService = $derived(services[adapter.conversationEntity]);
const messageService = $derived(services[adapter.messageEntity]);
const memberService = $derived(adapter.memberEntity ? services[adapter.memberEntity] : undefined);

const conversationRows = liveQuery(() => conversationService?.list() ?? Promise.resolve([]), {
  initial: [],
});
const messageRows = liveQuery(() => messageService?.list() ?? Promise.resolve([]), {
  initial: [],
});
const memberRows = liveQuery(() => memberService?.list() ?? Promise.resolve([]), {
  initial: [],
});
const conversations = $derived(adapter.conversations(conversationRows.current ?? []));
let selectedId = $state('');
const actorId = $derived(memberRows.current?.[0] ? String(memberRows.current[0].id) : undefined);
const messages = $derived(adapter.messages(messageRows.current ?? [], selectedId, actorId));
const kit = import('@protoyard/ai-ui');

$effect(() => {
  if (!conversations.some((conversation) => conversation.id === selectedId)) {
    selectedId = conversations[0]?.id ?? '';
  }
});

async function send(conversationId: string, input: AssistantSendInput): Promise<boolean> {
  if (!messageService) return false;
  const prompt = input.prompt.trim();
  if (!prompt) return false;
  const now = runtime.clock.now().toISOString();
  await messageService.create(adapter.messageInput(conversationId, prompt, now, 'user', actorId));
  const reply = await scriptedReply(runtime, conversationId, prompt);
  await messageService.create(
    adapter.messageInput(conversationId, reply, runtime.clock.now().toISOString(), 'assistant')
  );
  return true;
}

async function rename(conversationId: string, title: string): Promise<void> {
  if (!conversationService) return;
  const clean = title.trim();
  if (!clean) return;
  await conversationService.update(
    conversationId,
    adapter.id === 'team-chat' ? { name: clean } : { title: clean }
  );
}

function selectConversation(id: string): void {
  selectedId = id;
}
</script>

<!--
  The CRUD app paints its surface through LayoutHost; this archetype has no layout,
  so it paints the theme background itself (otherwise dark mode shows the browser's
  white canvas behind dark-theme text).
-->
<div class="min-h-full bg-background text-foreground" data-testid="player-conversational-surface">
  <section
    class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8"
    data-testid="player-conversational-archetype"
    data-archetype={adapter.id}
    data-route={adapter.path}
  >
    <div class="mb-4">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{adapter.id === 'team-chat' ? 'Team chat' : 'Assistant workspace'} · Simulated</p>
      <h1 class="text-2xl font-semibold">{blueprint.name}</h1>
    </div>
    {#if conversationRows.error || messageRows.error}
      <ErrorState title="The conversation could not be loaded" message="The simulated conversation data is unavailable." />
    {:else if conversationRows.loading || messageRows.loading}
      <LoadingState label="Loading conversations" class="py-16" />
    {:else}
      {#await kit then { AssistantWorkspace }}
        <AssistantWorkspace
          {conversations}
          {messages}
          selectedConversationId={selectedId}
          onSend={send}
          onSelectConversation={selectConversation}
          onRenameConversation={rename}
        />
      {:catch error}
        <ErrorState
          title="The conversational kit could not be loaded"
          message={error instanceof Error ? error.message : String(error)}
        />
      {/await}
    {/if}
  </section>
</div>
