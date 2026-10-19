<script lang="ts">
import type { AssistantSendInput } from '@protoyard/ai-ui';
import { AssistantWidget } from '@protoyard/ai-ui/widget';
import { ASSISTANT_MODELS } from '../domain/services.ts';
import { useAssistant } from '../lib/context.ts';

const { services, conversations, messages, settings } = useAssistant();
let selectedConversationId = $state('');
let streaming = $state(false);
const conversationList = $derived(conversations.current ?? []);
const activeConversationId = $derived(
  conversationList.some((conversation) => conversation.id === selectedConversationId)
    ? selectedConversationId
    : (conversationList[0]?.id ?? '')
);
const activeConversation = $derived(
  conversationList.find((conversation) => conversation.id === activeConversationId)
);
const activeMessages = $derived(
  (messages.current ?? []).filter((message) => message.conversationId === activeConversationId)
);
const folders = $derived(settings.current?.folders ?? []);

async function send(conversationId: string, input: AssistantSendInput) {
  const needsApproval =
    input.model.id === 'py-orbit-agent' && Boolean(settings.current?.agentApprovalRequired);
  const approved =
    needsApproval &&
    window.confirm('Approve this simulated agent tool call against the fictional local index?');
  if (needsApproval && !approved) return false;

  streaming = true;
  try {
    await services.send(conversationId, input.prompt, input.model, input.attachments, approved);
    return true;
  } finally {
    streaming = false;
  }
}

function modelFor(conversationId: string) {
  const conversation = conversationList.find((item) => item.id === conversationId);
  return (
    ASSISTANT_MODELS.find((model) => model.id === conversation?.modelId) ?? ASSISTANT_MODELS[0]
  );
}
</script>

<section class="relative h-full min-h-[32rem] overflow-hidden rounded-2xl border border-border bg-background p-5 sm:p-8" aria-label="Nova widget demo">
  <div class="mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-10">
    <p class="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Northstar Journal · fictional host site</p>
    <h1 class="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Ideas move further when they have a place to land.</h1>
    <p class="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Explore notes from the Nova product studio. The launcher in the corner opens a simulated assistant sidebar; expand it to see the full-screen experience.</p>
    <div class="mt-8 grid gap-4 sm:grid-cols-2">
      <article class="rounded-xl bg-muted p-4"><h2 class="text-sm font-semibold text-foreground">A quieter planning ritual</h2><p class="mt-2 text-xs leading-5 text-muted-foreground">Collect the useful questions before turning a rough thought into a plan.</p></article>
      <article class="rounded-xl bg-muted p-4"><h2 class="text-sm font-semibold text-foreground">Make room for review</h2><p class="mt-2 text-xs leading-5 text-muted-foreground">Keep every suggestion local, inspectable, and easy to reshape.</p></article>
    </div>
  </div>

  <AssistantWidget
    prototypeId="nova-assistant-demo"
    conversations={conversationList}
    messages={activeMessages}
    models={ASSISTANT_MODELS}
    selectedConversationId={activeConversationId}
    selectedModelId={activeConversation?.modelId}
    folders={folders}
    {streaming}
    canvas={settings.current?.canvas}
    onSend={send}
    onStop={() => services.stop(activeConversationId)}
    onSelectConversation={(id) => (selectedConversationId = id)}
    onRenameConversation={(id, title) => void services.rename(id, title)}
    onTogglePin={(id) => void services.togglePin(id)}
    onMoveToFolder={(id, folder) => void services.moveToFolder(id, folder)}
    onCreateFolder={(name) => void services.createFolder(name)}
    onRegenerate={() => void services.regenerate(activeConversationId)}
    onEditMessage={(id, content) => {
      const message = activeMessages.find((item) => item.id === id);
      const model = modelFor(activeConversationId);
      if (message && model) void services.editMessage(activeConversationId, id, content, model);
    }}
    onFeedback={(id, rating) => void services.feedback(id, rating)}
    onShare={(id) => services.share(id)}
    onCanvasChange={(content) => void services.updateCanvas(content)}
    onCloseCanvas={() => void services.closeCanvas()}
  />
</section>
