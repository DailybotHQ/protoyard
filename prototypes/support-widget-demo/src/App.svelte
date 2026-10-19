<script lang="ts">
import { Headset, Package, RotateCcw, UserRound } from '@lucide/svelte';
import {
  can,
  DEMO_BADGE_ENABLED,
  liveQuery,
  runService,
  useEnvironment,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Button, Composer, Input, TypingIndicator } from '@protoyard/ui';
import { onMount, untrack } from 'svelte';
import ConditionBanner from './components/ConditionBanner.svelte';
import MessageList from './components/MessageList.svelte';
import type { Order, ReturnRequest } from './database/schema.ts';
import { ASSISTANT } from './domain/assistant.ts';
import { CAPABILITIES } from './domain/policy.ts';
import { provideChat } from './lib/context.ts';
import { formatDay, formatMoney } from './lib/format.ts';
import { createUnreadSync } from './lib/unread.ts';
import { WidgetPanel } from './lib/widget-panel.svelte.ts';

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
// Scoped to the active persona's orders by the service.
const returnsQuery = liveQuery(
  () => (runtime.session.can(CAPABILITIES.readReturns) ? chat.listReturns() : Promise.resolve([])),
  { initial: [] as ReturnRequest[], deps: () => principal.current?.persona.id }
);
// The persona's most recent order prefills the lookup, so the default exists in every world.
const latestOrder = liveQuery(() => chat.latestOrder(), {
  initial: null,
  deps: () => principal.current?.persona.id,
});

const list = $derived(messages.current ?? []);
const canSend = $derived(can(CAPABILITIES.send) && environment.current.network !== 'offline');
const streaming = $derived(list.some((m) => m.status === 'streaming' && chat.isLive(m.id)));
const handoffDone = $derived(Boolean(conversation.current?.handoffJoined));
const canLookup = $derived(can(CAPABILITIES.lookupOrder));
const canReturn = $derived(can(CAPABILITIES.requestReturn));

let draft = $state('');
let handoffBusy = $state(false);
let orderQuery = $state('');
let prefilledOrder = '';
let orderBusy = $state(false);
let orderError = $state<string | null>(null);
let lookedUp = $state<Order | null>(null);
let returnReason = $state('Wrong size');
let returnBusy = $state(false);
let returnError = $state<string | null>(null);

const panel = new WidgetPanel(runtime.manifest.preview.shell === 'widget-host');
const unreadSync = createUnreadSync({
  unreadCount: async () => {
    const me = principal.current?.persona.id;
    return me ? chat.unreadCount(supportId, me) : 0;
  },
  markRead: () => chat.markRead(supportId),
  setUnread: (count) => panel.host?.setUnread(count),
});

onMount(() => {
  void chat.ensureSupportThread();
  return panel.watch();
});

$effect(() => {
  // Prefill only while the field still holds the previous default (or nothing).
  const number = latestOrder.current?.number;
  if (!number) return;
  untrack(() => {
    if (orderQuery === '' || orderQuery === prefilledOrder) {
      orderQuery = number;
      prefilledOrder = number;
    }
  });
});

const readKey = $derived(`${list.length}:${list.at(-1)?.status}:${list.at(-1)?.id}`);
// One ordered update per change: read while the panel is open, count while it is closed.
$effect(() => {
  void readKey;
  const viewing = panel.viewing;
  if (!principal.current || !conversation.current) return;
  void unreadSync.sync(viewing);
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

async function lookupOrder() {
  if (!canLookup) return;
  orderBusy = true;
  orderError = null;
  const result = await runService(() => chat.lookupOrder(orderQuery), {
    errorTitle: 'Order lookup failed',
  });
  orderBusy = false;
  if (result.ok) {
    lookedUp = result.value;
  } else {
    lookedUp = null;
    const err = result.error;
    orderError =
      err && typeof err === 'object' && 'issues' in err
        ? String((err as { issues: Record<string, string> }).issues.order ?? 'Lookup failed')
        : err instanceof Error
          ? err.message
          : 'Lookup failed';
  }
}

async function startReturn() {
  if (!lookedUp || !canReturn) return;
  returnBusy = true;
  returnError = null;
  const result = await runService(
    () =>
      chat.requestReturn({
        orderId: lookedUp!.id,
        reason: returnReason,
      }),
    { errorTitle: 'Could not start return' }
  );
  returnBusy = false;
  if (!result.ok) {
    const err = result.error;
    returnError =
      err && typeof err === 'object' && 'issues' in err
        ? String(
            (err as { issues: Record<string, string> }).issues.reason ??
              (err as { issues: Record<string, string> }).issues.order ??
              'Return failed'
          )
        : err instanceof Error
          ? err.message
          : 'Return failed';
  }
}
</script>

<div class="flex h-app min-h-0 flex-col overflow-hidden bg-background text-foreground">
  <header class="flex items-center gap-2 border-b border-border px-3 py-2.5">
    <span
      class="grid size-9 place-items-center rounded-full bg-primary/15 text-primary"
      aria-hidden="true"
    >
      <Headset class="size-4" />
    </span>
    <div class="min-w-0 flex-1">
      <h1 class="truncate text-sm font-semibold">{runtime.manifest.name}</h1>
      <p class="truncate text-xs text-muted-foreground">
        {#if handoffDone}
          Human agent connected (simulated)
        {:else}
          Northwind Outfitters · fictional demo
        {/if}
      </p>
    </div>
  </header>

  <ConditionBanner />

  {#if canLookup}
    <section
      class="shrink-0 space-y-2 border-b border-border bg-muted/30 px-3 py-2.5"
      aria-label="Order tools"
      data-testid="order-tools"
    >
      <div class="flex flex-wrap items-end gap-2">
        <label class="min-w-0 flex-1 text-xs">
          <span class="mb-1 block font-medium text-muted-foreground">Order number</span>
          <Input
            bind:value={orderQuery}
            placeholder="NW-10040"
            aria-label="Order number"
            data-testid="order-lookup-input"
            disabled={environment.current.network === 'offline'}
          />
        </label>
        <Button
          size="sm"
          loading={orderBusy}
          loadingLabel="Looking up…"
          onclick={lookupOrder}
          disabled={environment.current.network === 'offline'}
          data-testid="order-lookup-submit"
        >
          <Package class="size-3.5" aria-hidden="true" /> Look up order
        </Button>
      </div>
      {#if orderError}
        <p class="text-xs text-destructive" role="alert" data-testid="order-lookup-error">{orderError}</p>
      {/if}
      {#if lookedUp}
        <article
          class="rounded-lg border border-border bg-surface p-3 text-sm shadow-soft"
          data-testid="order-card"
          data-order-number={lookedUp.number}
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p class="font-semibold" data-testid="order-number">{lookedUp.number}</p>
              <p class="text-muted-foreground">{lookedUp.itemSummary}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {formatDay(lookedUp.orderedAt)} · <span class="capitalize">{lookedUp.status}</span>
                {#if lookedUp.trackingCode}
                  · Track {lookedUp.trackingCode}
                {/if}
              </p>
            </div>
            <p class="font-semibold tabular-nums" data-testid="order-total">
              {formatMoney(lookedUp.totalCents)}
            </p>
          </div>
          {#if canReturn && lookedUp.status !== 'cancelled'}
            <div class="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <label class="min-w-0 flex-1 text-xs">
                <span class="mb-1 block font-medium text-muted-foreground">Return reason</span>
                <Input
                  bind:value={returnReason}
                  aria-label="Return reason"
                  data-testid="return-reason"
                  disabled={environment.current.network === 'offline'}
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                loading={returnBusy}
                loadingLabel="Starting…"
                onclick={startReturn}
                disabled={environment.current.network === 'offline'}
                data-testid="start-return"
              >
                <RotateCcw class="size-3.5" aria-hidden="true" /> Start return
              </Button>
            </div>
            {#if returnError}
              <p class="mt-2 text-xs text-destructive" role="alert" data-testid="return-error">
                {returnError}
              </p>
            {/if}
          {/if}
        </article>
      {/if}
      {#if (returnsQuery.current ?? []).length > 0}
        <ul class="space-y-1 text-xs" data-testid="returns-list" aria-label="Returns">
          {#each returnsQuery.current ?? [] as ret (ret.id)}
            <li
              class="rounded-md border border-border bg-background px-2 py-1.5"
              data-testid="return-row"
              data-return-id={ret.id}
            >
              Return <span class="font-mono">{ret.id}</span>
              · {ret.status} · {formatMoney(ret.amountCents)}
              <span class="text-muted-foreground">— {ret.reason}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

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
            data-testid="handoff"
          >
            <UserRound class="size-3.5" aria-hidden="true" /> Talk to a human
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
