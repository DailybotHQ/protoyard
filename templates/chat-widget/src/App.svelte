<script lang="ts">
import { Headset, UserRound } from '@lucide/svelte';
import {
  can,
  DEMO_BADGE_ENABLED,
  liveQuery,
  runService,
  tryGetWidgetHost,
  useEnvironment,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Button, Composer, TypingIndicator } from '@protoyard/ui';
import { onMount } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
import ConditionBanner from './components/ConditionBanner.svelte';
import MessageList from './components/MessageList.svelte';
import { ASSISTANT } from './domain/assistant.ts';
import { CAPABILITIES } from './domain/policy.ts';
import { provideChat } from './lib/context.ts';

const { runtime, db, chat, people, supportId } = provideChat();
const principal = usePrincipal();
const environment = useEnvironment();

const conversation = liveQuery(() => db.conversations.get(supportId), {
  deps: () => principal.current?.persona.id,
});
const messages = liveQuery(
  () =>
    db.messages.where('[conversationId+at]').between([supportId, ''], [supportId, '￿']).toArray(),
  { initial: [], deps: () => supportId }
);

const list = $derived(messages.current ?? []);
const canSend = $derived(can(CAPABILITIES.send) && environment.current.network !== 'offline');
const streaming = $derived(list.some((m) => m.status === 'streaming' && chat.isLive(m.id)));
const handoffDone = $derived(Boolean(conversation.current?.handoffJoined));

let draft = $state('');
let handoffBusy = $state(false);

onMount(() => {
  void chat.ensureSupportThread();
});

// Drive the widget-host launcher badge when framed.
const readKey = $derived(`${list.length}:${list.at(-1)?.status}:${list.at(-1)?.id}`);
$effect(() => {
  void readKey;
  const me = principal.current?.persona.id;
  if (!me) return;
  void (async () => {
    const unread = await chat.unreadCount(supportId, me);
    tryGetWidgetHost()?.setUnread(unread);
  })();
});

$effect(() => {
  void readKey;
  if (conversation.current && principal.current) void chat.markRead(supportId);
});

async function send(text: string): Promise<boolean> {
  const result = await runService(() => chat.send(supportId, text), {
    errorTitle: 'Message not sent',
  });
  return result.ok;
}

async function handoff() {
  handoffBusy = true;
  try {
    await runService(() => chat.requestHandoff(supportId), {
      errorTitle: 'Could not request a human',
    });
  } finally {
    handoffBusy = false;
  }
}
</script>

<div class="flex h-app min-h-0 flex-col overflow-hidden bg-background text-foreground">
  <header class="flex items-center gap-2 border-b border-border px-3 py-2.5">
    <span
      class="grid size-9 place-items-center rounded-full bg-primary/15 text-primary"
      aria-hidden="true"
    >
      <LucideIcon icon={Headset} class="size-4" />
    </span>
    <div class="min-w-0 flex-1">
      <h1 class="truncate text-sm font-semibold">{runtime.manifest.name}</h1>
      <p class="truncate text-xs text-muted-foreground">
        {#if handoffDone}
          Human agent connected (simulated)
        {:else}
          Scripted support bot · fictional demo
        {/if}
      </p>
    </div>
  </header>

  <ConditionBanner />

  <main id="main-content" class="flex min-h-0 flex-1 flex-col">
    {#if list.length === 0 && !messages.loading}
      <p class="m-auto px-6 text-center text-sm text-muted-foreground">Starting support chat…</p>
    {:else}
      <MessageList
        messages={list}
        people={people.current}
        meId={principal.current?.persona.id}
        {canSend}
        isLive={chat.isLive}
        onStop={(messageId) => void chat.cancel(messageId)}
        onRetry={(messageId) =>
          void runService(() => chat.retry(messageId), { errorTitle: 'Could not retry' })}
      />
    {/if}

    <div
      class={[
        'border-t border-border px-3 pt-1',
        DEMO_BADGE_ENABLED ? 'pb-11' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
      ]}
    >
      <TypingIndicator names={streaming ? [ASSISTANT.name] : []} showLabel class="px-1" />
      {#if can(CAPABILITIES.handoff) && !handoffDone}
        <div class="mb-2 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            loading={handoffBusy}
            loadingLabel="Connecting…"
            onclick={handoff}
            disabled={environment.current.network === 'offline'}
          >
            <LucideIcon icon={UserRound} class="size-3.5" /> Talk to a human
          </Button>
        </div>
      {/if}
      <Composer
        bind:value={draft}
        onSubmit={send}
        disabled={!canSend}
        placeholder={environment.current.network === 'offline'
          ? 'Offline — messages cannot be sent (simulated)'
          : canSend
            ? 'Message support…'
            : 'Read-only'}
        maxLength={4000}
      />
    </div>
  </main>
</div>
