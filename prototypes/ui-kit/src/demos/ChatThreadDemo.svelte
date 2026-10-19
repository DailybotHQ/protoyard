<script lang="ts">
import { Avatar, type ChatMessage, ChatThread } from '@protoyard/ui';
import { ANA, ME, messageId, scriptedReply, seedThread } from './chat.ts';
import { sampleFace } from './faces.ts';
import { wait } from './nav.ts';

let messages = $state<ChatMessage[]>(seedThread());
let draft = $state('');
let typing = $state<string[]>([]);
let replies = 0;

async function send(body: string): Promise<void> {
  const id = messageId();
  messages.push({ id, author: ME, body, at: new Date(), status: 'sending' });
  await wait(250);
  const sent = messages.find((message) => message.id === id);
  if (sent) sent.status = 'delivered';
  void reply();
}

async function reply(): Promise<void> {
  typing = [ANA.name];
  await wait(800);
  typing = [];
  const lastOwn = [...messages].reverse().find((message) => message.author.id === ME.id);
  if (lastOwn) lastOwn.status = 'read';
  messages.push({ id: messageId(), author: ANA, body: scriptedReply(replies), at: new Date() });
  replies += 1;
}
</script>

<div class="h-[420px] overflow-hidden rounded-xl border border-border">
  <ChatThread {messages} currentUserId={ME.id} {typing} bind:draft onSend={send} placeholder="Message Ana…">
    {#snippet header()}
      <div class="flex items-center gap-3 border-b border-border px-4 py-3">
        <Avatar name={ANA.name} {...sampleFace(ANA.name)} size="sm" decorative />
        <div class="grid">
          <p class="text-sm font-medium">{ANA.name}</p>
          <p class="text-xs text-muted-foreground">Replies in about a second (scripted)</p>
        </div>
      </div>
    {/snippet}
  </ChatThread>
</div>
<p class="mt-2 text-xs text-muted-foreground">
  Enter sends, Shift+Enter adds a line. Draft: {draft.length} characters.
</p>
