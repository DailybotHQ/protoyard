<script lang="ts">
import { ArrowLeft, CheckCircle2, Lock, MessageSquare, Pencil } from '@lucide/svelte';
import { createFileServices } from '@protoyard/blueprint';
import type { Persona, Row } from '@protoyard/core';
import { EntityDetail } from '@protoyard/crud';
import {
  can,
  isValidationError,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  type DropzoneFile,
  type DropzoneReject,
  EmptyState,
  FileDropzone,
  formatDay,
  formatTime,
  Textarea,
} from '@protoyard/ui';
import { useCrudApp } from '../lib/context.ts';
import { STATUS_LABELS, slaLabel, slaState, type TicketStatus } from '../lib/metrics.ts';
import { serviceOf } from '../lib/require.ts';

/**
 * Hand-written ticket workspace (owned file): the generated detail view plus
 * the agent's tools — drag-and-drop attachments, replies and internal notes,
 * and a one-click "mark solved". Every change goes through blueprint services.
 */
let { params = {} }: RouteProps = $props();

const { services, runtime, blueprint } = useCrudApp();
const files = serviceOf(createFileServices(runtime, blueprint), 'ticket');
const tickets$ = serviceOf(services, 'ticket');
const replies$ = serviceOf(services, 'reply');
const clock = useClock();
const id = $derived(params.id ?? '');

const ticket = liveQuery(() => tickets$.get(id), { deps: () => id });
const replies = liveQuery(
  async () =>
    (await replies$.list())
      .filter((r) => r.ticketId === id)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
  { initial: [], deps: () => id }
);
const personas = liveQuery(
  () =>
    (runtime.db as { table(n: string): { toArray(): Promise<Persona[]> } })
      .table('py_personas')
      .toArray(),
  { initial: [] }
);
const customer = liveQuery(
  async () => {
    const row = ticket.current;
    return row ? serviceOf(services, 'customer').get(String(row.customerId)) : undefined;
  },
  { deps: () => ticket.current?.customerId }
);
const nameOf = (pid: unknown) =>
  (personas.current ?? []).find((p) => p.id === pid)?.name ?? 'Someone';

const canUpdate = $derived(can('ticket:update'));
const canReply = $derived(can('reply:create'));

// EntityDetail reads once per key: bump it after uploads and replies.
let version = $state(0);
let uploads = $state<DropzoneFile[]>([]);
let rejects = $state<DropzoneReject[]>([]);
let message = $state('');
let internal = $state(false);
let replyError = $state<string | undefined>();
let sending = $state(false);

async function upload(added: File[]) {
  for (const file of added) {
    const result = await runService(
      () => files.upload({ entity: 'ticket', recordId: id, field: 'attachments', file }),
      { success: `Attached ${file.name}`, errorTitle: 'Upload failed' }
    );
    if (result.ok) version++;
  }
  uploads = [];
}

async function sendReply(event: SubmitEvent) {
  event.preventDefault();
  sending = true;
  replyError = undefined;
  const result = await runService(() => replies$.create({ message, ticketId: id, internal }), {
    success: internal ? 'Internal note added' : 'Reply sent (simulated)',
  });
  sending = false;
  if (result.ok) {
    message = '';
    internal = false;
    version++;
  } else if (isValidationError(result.error)) {
    replyError = result.error.issues.message ?? Object.values(result.error.issues)[0];
  }
}

function markSolved(row: Row) {
  return runService(() => tickets$.update(String(row.id), { status: 'solved' }), {
    success: 'Ticket solved',
  }).then((r) => {
    if (r.ok) version++;
  });
}
</script>

<a href="#/" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft class="size-4" aria-hidden="true" />Dashboard
</a>

{#if ticket.loading}
  <p class="text-sm text-muted-foreground">Loading ticket…</p>
{:else if !ticket.current}
  <EmptyState title="Ticket not found" description="It may have been deleted, or another scenario is loaded.">
    {#snippet action()}<Button href="#/tickets">Open tickets</Button>{/snippet}
  </EmptyState>
{:else}
  {@const t = ticket.current}
  {@const sla = slaState(t, clock.now)}
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight">{t.subject}</h1>
      <p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{STATUS_LABELS[t.status as TicketStatus] ?? t.status}</Badge>
        <span class="capitalize">{t.priority} priority</span>·
        <span class={sla.kind === 'breached' ? 'font-medium text-destructive' : ''}>{slaLabel(sla)}</span>
        {#if customer.current}·
          <span>for <span class="font-medium text-foreground">{customer.current.name}</span> ({customer.current.plan})</span>
        {/if}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if canUpdate}
        <Button variant="outline" onclick={() => navigate(`/tickets/${encodeURIComponent(id)}`)}>
          <Pencil class="size-4" aria-hidden="true" />Edit
        </Button>
        {#if t.status !== 'solved'}
          <Button onclick={() => markSolved(t)}><CheckCircle2 class="size-4" aria-hidden="true" />Mark solved</Button>
        {/if}
      {/if}
    </div>
  </div>

  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <div class="space-y-6">
      <section aria-labelledby="conversation-title" class="rounded-xl border border-border bg-surface p-4 shadow-soft">
        <h2 id="conversation-title" class="flex items-center gap-2 font-medium">
          <MessageSquare class="size-4" aria-hidden="true" />Conversation
        </h2>
        <ol class="mt-3 space-y-3" aria-label="Replies">
          {#each replies.current ?? [] as reply (reply.id)}
            <li class={reply.internal ? 'rounded-lg border border-warning/40 bg-warning/10 p-3' : 'rounded-lg border border-border p-3'}>
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar name={nameOf(reply.authorId)} size="xs" />
                <span class="font-medium text-foreground">{nameOf(reply.authorId)}</span>
                <span>{formatDay(String(reply.createdAt))} {formatTime(String(reply.createdAt))}</span>
                {#if reply.internal}<Badge variant="warning"><Lock aria-hidden="true" />Internal</Badge>{/if}
              </div>
              <p class="mt-1.5 text-sm whitespace-pre-wrap">{reply.message}</p>
            </li>
          {:else}
            <li class="text-sm text-muted-foreground">No replies yet.</li>
          {/each}
        </ol>
        {#if canReply}
          <form class="mt-4 space-y-2" onsubmit={sendReply} novalidate>
            <label for="reply-message" class="text-sm font-medium">Reply</label>
            <Textarea id="reply-message" rows={3} bind:value={message} placeholder="Thanks for reaching out…" aria-invalid={replyError ? 'true' : undefined} aria-describedby={replyError ? 'reply-error' : undefined} />
            {#if replyError}<p id="reply-error" class="text-sm text-destructive">{replyError}</p>{/if}
            <div class="flex flex-wrap items-center justify-between gap-2">
              <Checkbox bind:checked={internal} label="Internal note (not sent to the customer)" />
              <Button type="submit" loading={sending}>{internal ? 'Add note' : 'Send reply'}</Button>
            </div>
          </form>
        {/if}
      </section>

      {#key version}
        <EntityDetail {runtime} {blueprint} {services} entityName="ticket" recordId={id} />
      {/key}
    </div>

    <aside class="space-y-4">
      <section aria-labelledby="attachments-title" class="rounded-xl border border-border bg-surface p-4 shadow-soft">
        <h2 id="attachments-title" class="font-medium">Add attachments</h2>
        {#if canUpdate}
          <FileDropzone
            class="mt-3"
            accept="image/*,application/pdf,text/plain"
            maxSize={2 * 1024 * 1024}
            multiple
            bind:files={uploads}
            bind:rejects
            label="Drop files here"
            description="Images, PDF or text, up to 2 MB. Stored in this browser only."
            browseLabel="Choose files"
            onAdd={(added) => void upload(added)}
          />
        {:else}
          <p class="mt-2 text-sm text-muted-foreground">Your role can view attachments but not add them.</p>
        {/if}
      </section>
    </aside>
  </div>
{/if}
