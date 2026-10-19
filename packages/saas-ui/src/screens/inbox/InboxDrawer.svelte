<script lang="ts">
import { createInbox, type InboxService, type SaasInboxMessage } from '@protoyard/saas';
import { Dialog } from '@protoyard/ui';
import { onMount } from 'svelte';
import InboxBadge from '../../components/InboxBadge.svelte';
import { getSaas } from '../../context.ts';

interface Props {
  /** Renders the inbox inline for the `/inbox` route instead of as a floating drawer. */
  embedded?: boolean;
  /** Optional address for signed-out screens; must be a fictional example.com address. */
  recipient?: string;
  /** Override the service in isolated hosts or tests. */
  service?: InboxService;
  /**
   * Show only `recipient`'s mailbox: hides the address form (e.g. a signed-out
   * account waiting to confirm its email). Default false.
   */
  lockRecipient?: boolean;
}

let { embedded = false, recipient, service, lockRecipient = false }: Props = $props();
const { runtime } = getSaas();
const inbox = $derived(service ?? createInbox(runtime));
const principalEmail = runtime.session.principal()?.persona.email ?? '';
let address = $state('');
let appliedAddress = $state('');
let messages = $state<SaasInboxMessage[]>([]);
let unreadCount = $state(0);
let loading = $state(false);
let error = $state('');
let open = $state(false);

const isFictionalEmail = (value: string) => /^[^\s@]+@example\.com$/i.test(value.trim());

async function refresh() {
  if (!isFictionalEmail(address)) {
    appliedAddress = '';
    messages = [];
    unreadCount = 0;
    error = '';
    return;
  }
  loading = true;
  error = '';
  try {
    appliedAddress = address.trim().toLowerCase();
    messages = await inbox.list({ recipient: appliedAddress });
    unreadCount = messages.filter((message) => !message.readAt).length;
  } catch {
    error = 'The simulated inbox could not load. Try again.';
  } finally {
    loading = false;
  }
}

function showDrawer() {
  open = true;
  void refresh();
}

function handleOpenChange(next: boolean) {
  open = next;
  if (next) void refresh();
}

async function markRead(message: SaasInboxMessage) {
  try {
    await inbox.markRead(message.id);
    await refresh();
  } catch {
    error = 'This message could not be marked as read. Try again.';
  }
}

async function archive(message: SaasInboxMessage) {
  try {
    await inbox.archive(message.id);
    await refresh();
  } catch {
    error = 'This message could not be archived. Try again.';
  }
}

async function openAction(message: SaasInboxMessage) {
  if (!message.action) return;
  try {
    await inbox.markRead(message.id);
    await refresh();
    window.location.hash = message.action.href;
    open = false;
  } catch {
    error = 'The message link could not be opened. Try again.';
  }
}

onMount(() => {
  address = recipient ?? principalEmail;
  if (isFictionalEmail(address)) void refresh();
});
</script>

{#snippet content()}
  <div class="grid gap-4" data-testid="inbox-content">
    <p class="text-sm text-muted-foreground">Simulation only — these messages are stored in this prototype.</p>
    {#if lockRecipient}
      <p class="text-sm text-foreground" data-testid="inbox-locked-recipient">Messages for <strong class="font-medium">{appliedAddress || address}</strong></p>
    {:else}
      <form class="flex flex-wrap gap-2" onsubmit={(event) => { event.preventDefault(); void refresh(); }}>
        <label class="sr-only" for="simulated-inbox-email">Fictional inbox email</label>
        <input
          id="simulated-inbox-email"
          class="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
          bind:value={address}
          aria-describedby="inbox-email-help"
        />
        <button class="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" type="submit">
          Open inbox
        </button>
      </form>
      <p id="inbox-email-help" class="text-xs text-muted-foreground">Use a fictional @example.com address.</p>
    {/if}
    {#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
    {#if loading}
      <p class="text-sm text-muted-foreground" role="status">Loading simulated messages…</p>
    {:else if appliedAddress === ''}
      <p class="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Enter the address used by this prototype to view its simulated messages.</p>
    {:else if messages.length === 0}
      <p class="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No messages for {appliedAddress}.</p>
    {:else}
      <ul class="grid gap-3" aria-label="Simulated messages">
        {#each messages as message (message.id)}
          <li class="grid gap-3 rounded-xl border border-border bg-background p-4" data-testid="inbox-message">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-foreground">{message.subject}</p>
                <p class="mt-1 text-xs text-muted-foreground">{message.kind} · {new Date(message.at).toLocaleString()}</p>
              </div>
              {#if !message.readAt}<span class="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Unread</span>{/if}
            </div>
            <p class="whitespace-pre-wrap break-words text-sm text-muted-foreground">{message.body}</p>
            <div class="flex flex-wrap gap-2">
              {#if message.action}
                <button class="min-h-11 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" type="button" onclick={() => void openAction(message)}>
                  Open {message.action.label}
                </button>
              {/if}
              {#if !message.readAt}
                <button class="min-h-11 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" type="button" onclick={() => void markRead(message)}>
                  Mark as read
                </button>
              {/if}
              <button class="min-h-11 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" type="button" onclick={() => void archive(message)}>
                Archive
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

{#if embedded}
  <main class="mx-auto grid min-h-app w-full max-w-2xl content-start gap-5 p-6" aria-labelledby="inbox-title">
    <header class="grid gap-1">
      <h1 id="inbox-title" class="font-heading text-2xl font-semibold text-foreground">Simulated inbox</h1>
      <p class="text-sm text-muted-foreground">Read messages and open their in-app action links.</p>
    </header>
    {@render content()}
  </main>
{:else}
  <div class="fixed right-4 bottom-4 z-40">
    <InboxBadge {unreadCount} onopen={showDrawer} />
  </div>
  <Dialog
    bind:open
    title="Simulated inbox"
    description="Messages and links stay inside this prototype."
    size="md"
    onOpenChange={handleOpenChange}
    class="max-h-[min(42rem,calc(var(--py-app-height)-2rem))]"
  >
    {#snippet children()}
      {@render content()}
    {/snippet}
  </Dialog>
{/if}
