<script lang="ts">
import { AlarmClock, ArrowLeft, ArrowRight, Flame, Inbox, TriangleAlert } from '@lucide/svelte';
import type { Persona } from '@protoyard/core';
import { avatarImage, can, liveQuery, runService, useClock } from '@protoyard/renderer-svelte';
import { Avatar, Badge, Button, EmptyState, Skeleton, StatCard } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { useCrudApp } from '../lib/context.ts';
import {
  helpdeskMetrics,
  neighborStatus,
  STATUS_LABELS,
  STATUSES,
  slaLabel,
  slaState,
  type TicketStatus,
} from '../lib/metrics.ts';
import { serviceOf } from '../lib/require.ts';

/** Hand-written dashboard (owned file): SLA overview, status board and agent load. */
const { services, runtime, blueprint } = useCrudApp();
const tickets$ = serviceOf(services, 'ticket');
const clock = useClock();

const tickets = liveQuery(() => tickets$.list(), { initial: [] });
const personas = liveQuery(
  () =>
    (runtime.db as { table(n: string): { toArray(): Promise<Persona[]> } })
      .table('py_personas')
      .toArray(),
  { initial: [] }
);
const metrics = $derived(helpdeskMetrics(tickets.current ?? [], clock.now));
const canMove = $derived(can('ticket:update'));
const nameOf = (id: unknown) =>
  (personas.current ?? []).find((p) => p.id === id)?.name ?? 'Unassigned';
/** The persona's face (or `{}`: initials show). */
const faceOf = (id: unknown) =>
  avatarImage((personas.current ?? []).find((p) => p.id === id)?.avatar);

const PRIORITY_VARIANT: Record<string, 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  urgent: 'destructive',
  high: 'warning',
  normal: 'secondary',
  low: 'outline',
};

function move(id: string, subject: string, status: TicketStatus) {
  return runService(() => tickets$.update(id, { status }), {
    success: `Moved “${subject}” to ${STATUS_LABELS[status]}`,
  });
}
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold">{blueprint.name}</h1>
    <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
      SLA overview and the ticket board. Times use the simulated clock; data is fictional.
    </p>
  </div>

  {#if tickets.loading}
    <Skeleton class="h-48 rounded-xl" />
  {:else if metrics.total === 0}
    <EmptyState
      icon={Inbox}
      title="No tickets yet"
      description="Create the first ticket from the Tickets list, or import a CSV."
    >
      {#snippet action()}<Button href="#/tickets">Open tickets</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Unsolved" value={metrics.unsolved} hint={`${metrics.total} tickets in total`} icon={Inbox} />
      <StatCard label="SLA breached" value={metrics.breached} hint="unsolved, past their due time" icon={TriangleAlert} />
      <StatCard label="Due in 24 h" value={metrics.dueSoon} hint="unsolved, still on time" icon={AlarmClock} />
      <StatCard label="Urgent" value={metrics.urgent} hint="unsolved, urgent priority" icon={Flame} />
    </div>

    <section aria-labelledby="board-title">
      <h2 id="board-title" class="mb-3 text-lg font-semibold">Ticket board</h2>
      <div class="-mx-4 overflow-x-auto px-4 pb-2">
        <ol class="grid min-w-[56rem] grid-cols-4 gap-3" aria-label="Ticket board by status">
          {#each STATUSES as status (status)}
            <li class="flex min-w-0 flex-col rounded-xl border border-border bg-muted/40 p-3" data-testid={`board-${status}`}>
              <h3 class="mb-2 flex items-center justify-between text-sm font-medium">
                {STATUS_LABELS[status]}
                <Badge variant="outline">{metrics.board[status].length}</Badge>
              </h3>
              <ul class="flex flex-col gap-2" aria-label={`${STATUS_LABELS[status]} tickets`}>
                {#each metrics.board[status].slice(0, 8) as ticket (ticket.id)}
                  {@const sla = slaState(ticket, clock.now)}
                  {@const left = neighborStatus(status, -1)}
                  {@const right = neighborStatus(status, 1)}
                  <li class="rounded-lg border border-border bg-surface p-3 shadow-soft">
                    <a class="line-clamp-2 text-sm font-medium hover:underline" href={`#/tickets/${encodeURIComponent(String(ticket.id))}/workspace`}>
                      {ticket.subject}
                    </a>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant={PRIORITY_VARIANT[String(ticket.priority)] ?? 'secondary'} class="capitalize">{ticket.priority}</Badge>
                      <span class={sla.kind === 'breached' ? 'font-medium text-destructive' : 'text-muted-foreground'}>{slaLabel(sla)}</span>
                    </div>
                    <div class="mt-2 flex items-center justify-between gap-2">
                      <span class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Avatar name={nameOf(ticket.assigneeId)} {...faceOf(ticket.assigneeId)} size="xs" />
                        <span class="truncate">{nameOf(ticket.assigneeId)}</span>
                      </span>
                      {#if canMove}
                        <span class="flex shrink-0 gap-1">
                          {#if left}
                            <Button variant="ghost" size="icon" class="size-7" aria-label={`Move “${ticket.subject}” to ${STATUS_LABELS[left]}`} onclick={() => move(String(ticket.id), String(ticket.subject), left)}>
                              <LucideIcon icon={ArrowLeft} class="size-3.5" />
                            </Button>
                          {/if}
                          {#if right}
                            <Button variant="ghost" size="icon" class="size-7" aria-label={`Move “${ticket.subject}” to ${STATUS_LABELS[right]}`} onclick={() => move(String(ticket.id), String(ticket.subject), right)}>
                              <LucideIcon icon={ArrowRight} class="size-3.5" />
                            </Button>
                          {/if}
                        </span>
                      {/if}
                    </div>
                  </li>
                {:else}
                  <li class="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No tickets.</li>
                {/each}
                {#if metrics.board[status].length > 8}
                  <li><a class="text-xs text-primary hover:underline" href="#/tickets">+{metrics.board[status].length - 8} more in the list</a></li>
                {/if}
              </ul>
            </li>
          {/each}
        </ol>
      </div>
    </section>

    <section aria-labelledby="load-title" class="rounded-xl border border-border bg-surface p-4 shadow-soft">
      <h2 id="load-title" class="text-lg font-semibold">Agent load</h2>
      <ul class="mt-3 divide-y divide-border">
        {#each metrics.agentLoad as agent (agent.personaId ?? 'unassigned')}
          <li class="flex items-center gap-3 py-2 text-sm">
            <Avatar name={nameOf(agent.personaId)} {...faceOf(agent.personaId)} size="sm" />
            <span class="min-w-0 flex-1 truncate">{nameOf(agent.personaId)}</span>
            <span class="tabular-nums">{agent.open} open</span>
            {#if agent.breached > 0}<Badge variant="destructive">{agent.breached} breached</Badge>{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
