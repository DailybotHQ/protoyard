<script lang="ts">
import { ChevronLeft, Hash } from '@lucide/svelte';
import {
  Avatar,
  Badge,
  Button,
  type ChatAuthor,
  type ChatMessage,
  ChatThread,
  cn,
} from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { ANA, KAI, ME, messageId, OMAR, scriptedReply, today } from './chat.ts';
import { sampleFace } from './faces.ts';
import { wait } from './nav.ts';

interface Conversation {
  id: string;
  name: string;
  kind: 'channel' | 'direct';
  responder: ChatAuthor;
  unread: number;
  messages: ChatMessage[];
  typing: string[];
  replies: number;
  draft: string;
}

let conversations = $state<Conversation[]>([
  {
    id: 'general',
    name: 'general',
    kind: 'channel',
    responder: OMAR,
    unread: 0,
    typing: [],
    replies: 0,
    draft: '',
    messages: [
      { id: 'g1', author: OMAR, body: 'Reminder: all-hands at 3pm.', at: today(8, 30) },
      { id: 'g2', author: KAI, body: 'Will there be a recording?', at: today(8, 41) },
      { id: 'g3', author: OMAR, body: 'Yes, in the shared drive.', at: today(8, 43) },
    ],
  },
  {
    id: 'design',
    name: 'design-review',
    kind: 'channel',
    responder: ANA,
    unread: 2,
    typing: [],
    replies: 1,
    draft: '',
    messages: [
      { id: 'd1', author: ANA, body: 'New icons are in Figma.', at: today(9, 5) },
      { id: 'd2', author: ANA, body: 'Feedback welcome before Friday!', at: today(9, 6) },
    ],
  },
  {
    id: 'kai',
    name: 'Kai Moreno',
    kind: 'direct',
    responder: KAI,
    unread: 1,
    typing: [],
    replies: 2,
    draft: '',
    messages: [
      { id: 'k1', author: KAI, body: 'Got a minute to pair on the export bug?', at: today(9, 40) },
    ],
  },
]);
let activeId = $state('general');
let showThreadOnMobile = $state(false);
const active = $derived(conversations.find((c) => c.id === activeId));

function select(id: string): void {
  activeId = id;
  showThreadOnMobile = true;
  const conversation = conversations.find((c) => c.id === id);
  if (conversation) conversation.unread = 0;
}

async function send(conversation: Conversation, body: string): Promise<void> {
  const id = messageId();
  conversation.messages.push({ id, author: ME, body, at: new Date(), status: 'sending' });
  await wait(250);
  const sent = conversation.messages.find((m) => m.id === id);
  if (sent) sent.status = 'delivered';
  void reply(conversation);
}

async function reply(conversation: Conversation): Promise<void> {
  conversation.typing = [conversation.responder.name];
  await wait(800);
  conversation.typing = [];
  conversation.messages.push({
    id: messageId(),
    author: conversation.responder,
    body: scriptedReply(conversation.replies),
    at: new Date(),
  });
  conversation.replies += 1;
  if (conversation.id !== activeId) conversation.unread += 1;
}
</script>

<div class="relative flex h-[560px] overflow-hidden rounded-xl border border-border bg-background">
  <nav
    aria-label="Conversations"
    class={cn(
      'w-full shrink-0 flex-col border-r border-border bg-sidebar sm:flex sm:w-60',
      showThreadOnMobile ? 'hidden' : 'flex'
    )}
  >
    <p class="px-4 pt-4 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Acme team</p>
    <ul class="grid gap-0.5 px-2">
      {#each conversations as conversation (conversation.id)}
        <li>
          <Button
            type="button"
            aria-current={conversation.id === activeId ? 'true' : undefined}
            class="flex min-h-touch w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=true]:bg-primary/10 aria-[current=true]:font-semibold aria-[current=true]:text-foreground sm:min-h-9"
            onclick={() => select(conversation.id)}
          >
            {#if conversation.kind === 'channel'}
              <LucideIcon icon={Hash} class="size-4 shrink-0" />
            {:else}
              <Avatar name={conversation.name} {...sampleFace(conversation.name)} size="xs" decorative />
            {/if}
            <span class="flex-1 truncate">{conversation.name}</span>
            {#if conversation.unread > 0}
              <Badge>{conversation.unread}<span class="sr-only"> unread</span></Badge>
            {/if}
          </Button>
        </li>
      {/each}
    </ul>
  </nav>
  {#if active}
    {@const conversation = active}
    <section
      aria-label={`Conversation: ${conversation.name}`}
      class={cn('min-w-0 flex-1 flex-col sm:flex', showThreadOnMobile ? 'flex' : 'hidden')}
    >
      <ChatThread
        messages={conversation.messages}
        currentUserId={ME.id}
        typing={conversation.typing}
        bind:draft={conversation.draft}
        onSend={(body) => send(conversation, body)}
        placeholder={conversation.kind === 'channel' ? `Message #${conversation.name}` : `Message ${conversation.name}`}
      >
        {#snippet header()}
          <div class="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Button
              type="button"
              class="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:hidden"
              aria-label="Back to conversations"
              onclick={() => (showThreadOnMobile = false)}
            >
              <LucideIcon icon={ChevronLeft} class="size-5" />
            </Button>
            <p class="font-medium">
              {conversation.kind === 'channel' ? `#${conversation.name}` : conversation.name}
            </p>
          </div>
        {/snippet}
      </ChatThread>
    </section>
  {/if}
</div>
