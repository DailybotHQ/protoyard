<script lang="ts">
import { ArrowLeft, Mail, MessageSquare, Pencil, Phone, Trash2, Users } from '@lucide/svelte';
import type { RouteProps } from '@protoyard/renderer-svelte';
import {
  avatarImage,
  back,
  can,
  Link,
  liveQuery,
  navigate,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import {
  AlertDialog,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Select,
  Tabs,
  Textarea,
} from '@protoyard/ui';
import DealDialog from '../components/DealDialog.svelte';
import LostReasonDialog from '../components/LostReasonDialog.svelte';
import StageBadge from '../components/StageBadge.svelte';
import { DEAL_STAGES, type Deal, type DealStage } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { STAGE_LABELS } from '../domain/services.ts';
import { useCrm } from '../lib/context.ts';
import { formatDate, fromNow, money } from '../lib/format.ts';

let { params }: RouteProps = $props();
const { db, services } = useCrm();
const clock = useClock();

const id = () => params.id ?? '';
const deal = liveQuery(() => db.deals.get(id()), { deps: id });
const company = liveQuery(
  async () => {
    const d = await db.deals.get(id());
    return d ? db.companies.get(d.companyId) : undefined;
  },
  { deps: id }
);
const contact = liveQuery(
  async () => {
    const d = await db.deals.get(id());
    return d?.contactId ? db.contacts.get(d.contactId) : undefined;
  },
  { deps: id }
);
const activities = liveQuery(
  () => db.activities.where('dealId').equals(id()).reverse().sortBy('at'),
  { initial: [], deps: id }
);
const people = liveQuery(
  async () =>
    new Map((await db.table('py_personas').toArray()).map((p) => [p.id, p.name as string])),
  { initial: new Map() }
);

let editOpen = $state(false);
let deleteOpen = $state(false);
let losing = $state<Deal | null>(null);
let noteType = $state<'note' | 'call' | 'email' | 'meeting'>('note');
let note = $state('');
let noteError = $state<string | null>(null);
let posting = $state(false);
let tab = $state('activity');

const editable = $derived(deal.current ? can(CAPABILITIES.dealsUpdate, deal.current) : false);
const deletable = $derived(deal.current ? can(CAPABILITIES.dealsDelete, deal.current) : false);

async function changeStage(stage: string) {
  const current = deal.current;
  if (!current || stage === current.stage) return;
  if (stage === 'lost') {
    losing = current;
    return;
  }
  await runService(() => services.deals.moveStage(current.id, stage as DealStage), {
    success: `Moved to ${STAGE_LABELS[stage as DealStage]}`,
  });
}

async function logActivity(event: SubmitEvent) {
  event.preventDefault();
  const current = deal.current;
  if (!current) return;
  posting = true;
  noteError = null;
  const result = await runService(
    () =>
      services.activities.log(noteType, note, { dealId: current.id, companyId: current.companyId }),
    { success: 'Activity logged' }
  );
  posting = false;
  if (result.ok) note = '';
  else if (result.error instanceof Error && 'issues' in result.error)
    noteError = result.error.message;
}

const ICONS = { note: MessageSquare, call: Phone, email: Mail, meeting: Users } as const;
</script>

{#if deal.loading}
  <LoadingState label="Loading deal…" />
{:else if !deal.current}
  <EmptyState title="Deal not found" description="It may have been deleted, or a different scenario is loaded.">
    {#snippet action()}<Button href="#/deals">Back to deals</Button>{/snippet}
  </EmptyState>
{:else}
  {@const d = deal.current}
  <button type="button" onclick={() => back('/deals')} class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
    <ArrowLeft class="size-4" /> Back
  </button>

  <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-semibold tracking-tight">{d.title}</h1>
        <StageBadge stage={d.stage} />
      </div>
      <p class="mt-1 text-sm text-muted-foreground">
        {#if company.current}<Link href={`/companies/${company.current.id}`} class="hover:text-primary hover:underline">{company.current.name}</Link> · {/if}
        Owned by {people.current?.get(d.ownerId) ?? 'Unknown'}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if editable}
        <Select
          aria-label="Change stage"
          class="w-40"
          items={DEAL_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
          value={d.stage}
          onValueChange={changeStage}
        />
        <Button variant="outline" onclick={() => (editOpen = true)}><Pencil class="size-4" /> Edit</Button>
      {/if}
      {#if deletable}
        <Button variant="outline" class="text-destructive" onclick={() => (deleteOpen = true)}><Trash2 class="size-4" /> Delete</Button>
      {/if}
      {#if !editable}
        <Badge variant="outline">Read-only for your role</Badge>
      {/if}
    </div>
  </div>

  <div class="mt-6 grid gap-6 lg:grid-cols-3">
    <Card class="p-5 lg:col-span-1">
      <dl class="grid grid-cols-2 gap-4 text-sm lg:grid-cols-1">
        <div><dt class="text-muted-foreground">Amount</dt><dd class="text-xl font-semibold tabular-nums">{money(d.amount)}</dd></div>
        <div><dt class="text-muted-foreground">Win probability</dt><dd class="font-medium">{d.probability}%</dd></div>
        <div><dt class="text-muted-foreground">Expected close</dt><dd class="font-medium">{formatDate(d.closeDate)} <span class="text-muted-foreground">({fromNow(d.closeDate, clock.now)})</span></dd></div>
        <div><dt class="text-muted-foreground">Primary contact</dt><dd class="font-medium">{contact.current ? `${contact.current.firstName} ${contact.current.lastName}` : '—'}</dd></div>
        {#if d.lostReason}
          <div><dt class="text-muted-foreground">Lost reason</dt><dd class="font-medium text-destructive">{d.lostReason}</dd></div>
        {/if}
        <div><dt class="text-muted-foreground">Created</dt><dd>{formatDate(d.createdAt)}</dd></div>
      </dl>
    </Card>

    <div class="lg:col-span-2">
      <Tabs
        bind:value={tab}
        items={[
          { value: 'activity', label: 'Activity', badge: (activities.current ?? []).length },
          { value: 'contact', label: 'Contact' },
        ]}
      >
        {#snippet content(item)}
          {#if item.value === 'activity'}
            {#if can(CAPABILITIES.activitiesCreate)}
              <form class="mb-4 rounded-lg border border-border bg-surface p-3" onsubmit={logActivity}>
                <label for="note" class="sr-only">Log an activity</label>
                <Textarea id="note" bind:value={note} rows={2} placeholder="Log a call, email, meeting or note…" aria-invalid={noteError ? true : undefined} />
                {#if noteError}<p class="mt-1 text-xs text-destructive" role="alert">{noteError}</p>{/if}
                <div class="mt-2 flex items-center justify-between gap-2">
                  <Select
                    aria-label="Activity type"
                    class="w-32"
                    items={[
                      { value: 'note', label: 'Note' },
                      { value: 'call', label: 'Call' },
                      { value: 'email', label: 'Email' },
                      { value: 'meeting', label: 'Meeting' },
                    ]}
                    bind:value={noteType}
                  />
                  <Button type="submit" size="sm" loading={posting} disabled={!note.trim()}>Log activity</Button>
                </div>
              </form>
            {/if}
            <ol class="relative space-y-4 border-l border-border pl-5">
              {#each activities.current ?? [] as item (item.id)}
                {@const Icon = ICONS[item.type as keyof typeof ICONS] ?? MessageSquare}
                <li class="relative">
                  <span class="absolute -left-[1.6rem] grid size-6 place-items-center rounded-full border border-border bg-background">
                    <Icon class="size-3 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <p class="text-sm">{item.body}</p>
                  <p class="text-xs text-muted-foreground">
                    {people.current?.get(item.actorId) ?? 'Someone'} · <time datetime={item.at}>{fromNow(item.at, clock.now)}</time>
                  </p>
                </li>
              {:else}
                <li class="text-sm text-muted-foreground">No activity yet.</li>
              {/each}
            </ol>
          {:else if contact.current}
            {@const c = contact.current}
            <div class="flex items-center gap-3">
              <Avatar name={`${c.firstName} ${c.lastName}`} {...avatarImage(c.avatar)} size="lg" />
              <div>
                <p class="font-medium">{c.firstName} {c.lastName}</p>
                <p class="text-sm text-muted-foreground">{c.title}</p>
                <p class="mt-1 text-sm"><a class="text-primary hover:underline" href={`mailto:${c.email}`}>{c.email}</a> · {c.phone}</p>
              </div>
            </div>
          {:else}
            <p class="text-sm text-muted-foreground">No primary contact on this deal.</p>
          {/if}
        {/snippet}
      </Tabs>
    </div>
  </div>

  <DealDialog bind:open={editOpen} deal={d} />
  <LostReasonDialog bind:deal={losing} />
  <AlertDialog
    bind:open={deleteOpen}
    title="Delete this deal?"
    description="The deal and its activity history are removed from this browser. You can restore a snapshot from DevTools if you saved one."
    confirmLabel="Delete deal"
    destructive
    onConfirm={async () => {
      const result = await runService(() => services.deals.remove(d.id), { success: 'Deal deleted' });
      if (result.ok) navigate('/deals', { replace: true });
      else throw result.error;
    }}
  />
{/if}
