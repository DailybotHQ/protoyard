<script lang="ts">
import { Button, type ChatMessage, MessageList } from '@protoyard/ui';
import { ANA, KAI, ME, messageId, OMAR, today } from './chat.ts';

function yesterday(hours: number, minutes: number): Date {
  const date = today(hours, minutes);
  date.setDate(date.getDate() - 1);
  return date;
}

let messages = $state<ChatMessage[]>([
  { id: 'ml-1', author: OMAR, body: 'Deploy finished. 🎉', at: yesterday(17, 40) },
  { id: 'ml-2', author: KAI, body: 'Nice! Any errors in the logs?', at: yesterday(17, 42) },
  { id: 'ml-3', author: OMAR, body: 'None so far.', at: yesterday(17, 43) },
  { id: 'ml-4', author: ME, body: 'Great work, both of you.', at: today(8, 55), status: 'read' },
  { id: 'ml-5', author: ME, body: 'Retro at 4pm?', at: today(8, 56), status: 'failed' },
  { id: 'ml-6', author: ANA, body: 'Works for me.\nI will book the room.', at: today(9, 20) },
]);
const others = [ANA, OMAR, KAI];
let next = 0;

function addIncoming(): void {
  const author = others[next % others.length] ?? ANA;
  next += 1;
  messages.push({
    id: messageId(),
    author,
    body: `Update #${next} from ${author.name}.`,
    at: new Date(),
  });
}

function retryFailed(): void {
  const failed = messages.find((message) => message.status === 'failed');
  if (failed) failed.status = 'delivered';
}
</script>

<div class="grid gap-3">
  <div class="flex h-[360px] flex-col overflow-hidden rounded-xl border border-border bg-background">
    <MessageList {messages} currentUserId={ME.id} label="Team messages" />
  </div>
  <div class="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" onclick={addIncoming}>Add incoming message</Button>
    <Button size="sm" variant="outline" onclick={retryFailed} disabled={!messages.some((m) => m.status === 'failed')}>
      Retry failed message
    </Button>
  </div>
  <p class="text-xs text-muted-foreground">
    Consecutive messages within 5 minutes are grouped; day dividers separate dates. New messages
    keep the list pinned to the bottom unless you scrolled up.
  </p>
</div>
