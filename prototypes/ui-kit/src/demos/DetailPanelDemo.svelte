<script lang="ts">
import { Badge, Button, DetailPanel, Select, toast } from '@protoyard/ui';

interface Ticket {
  id: string;
  title: string;
  requester: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
}

let tickets = $state<Ticket[]>([
  {
    id: 'T-1042',
    title: 'Cannot export invoices to CSV',
    requester: 'mia@example.com',
    priority: 'high',
    status: 'open',
  },
  {
    id: 'T-1043',
    title: 'Dark mode flickers on load',
    requester: 'leo@example.com',
    priority: 'medium',
    status: 'open',
  },
  {
    id: 'T-1044',
    title: 'Typo on the pricing page',
    requester: 'ivy@example.com',
    priority: 'low',
    status: 'resolved',
  },
]);
let selectedId = $state<string | null>(null);
let open = $state(false);
const selected = $derived(tickets.find((ticket) => ticket.id === selectedId));

function show(id: string): void {
  selectedId = id;
  open = true;
}

function resolve(): void {
  if (!selected) return;
  selected.status = 'resolved';
  open = false;
  toast.success(`${selected.id} resolved`);
}
</script>

<ul class="grid max-w-lg gap-2">
  {#each tickets as ticket (ticket.id)}
    <li>
      <Button
        type="button"
        variant="ghost"
        class="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onclick={() => show(ticket.id)}
      >
        <span class="grid min-w-0">
          <span class="truncate font-medium">{ticket.title}</span>
          <span class="text-xs text-muted-foreground">{ticket.id} · {ticket.requester}</span>
        </span>
        <Badge variant={ticket.status === 'open' ? 'info' : 'success'}>{ticket.status}</Badge>
      </Button>
    </li>
  {/each}
</ul>
<p class="mt-3 text-xs text-muted-foreground">
  Click a ticket. The panel is a right-hand sheet on desktop and a bottom sheet on phones.
</p>

<DetailPanel
  bind:open
  title={selected?.title ?? 'Ticket'}
  description={selected ? `${selected.id} · opened by ${selected.requester}` : undefined}
>
  {#snippet headerActions()}
    {#if selected}
      <Badge variant={selected.status === 'open' ? 'info' : 'success'}>{selected.status}</Badge>
    {/if}
  {/snippet}
  {#if selected}
    {@const ticket = selected}
    <div class="grid gap-4">
      <div class="grid gap-1.5">
        <label for="detail-demo-priority" class="text-sm font-medium">Priority</label>
        <Select
          id="detail-demo-priority"
          bind:value={() => ticket.priority, (value) => (ticket.priority = value as Ticket['priority'])}
          items={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
        />
      </div>
      <p class="text-muted-foreground">
        The customer reports the issue happens every time on the latest version. Steps to reproduce
        are attached in the original email.
      </p>
    </div>
  {/if}
  {#snippet footer()}
    <Button variant="outline" onclick={() => (open = false)}>Close</Button>
    <Button onclick={resolve} disabled={selected?.status === 'resolved'}>Mark resolved</Button>
  {/snippet}
</DetailPanel>
