<script lang="ts">
import {
  Building2,
  CircleCheck,
  CircleDollarSign,
  Handshake,
  Target,
  TrendingUp,
  Trophy,
} from '@lucide/svelte';
import { can, Link, liveQuery, useClock, usePrincipal } from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, StatCard } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import CompanyDialog from '../components/CompanyDialog.svelte';
import DealDialog from '../components/DealDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import StageBadge from '../components/StageBadge.svelte';
import { OPEN_STAGES } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { STAGE_LABELS } from '../domain/services.ts';
import { useCrm } from '../lib/context.ts';
import { fromNow, money, moneyCompact } from '../lib/format.ts';

const { db, services } = useCrm();
const clock = useClock();
const principal = usePrincipal();

const deals = liveQuery(() => db.deals.toArray(), { initial: [] });
const companyCount = liveQuery(() => db.companies.count(), { initial: 0 });
const contactCount = liveQuery(() => db.contacts.count(), { initial: 0 });
const recent = liveQuery(() => db.activities.orderBy('at').reverse().limit(8).toArray(), {
  initial: [],
});
const people = liveQuery(
  async () =>
    new Map((await db.table('py_personas').toArray()).map((p) => [p.id, p.name as string])),
  { initial: new Map() }
);

let dealOpen = $state(false);
let companyOpen = $state(false);

const stats = $derived.by(() => {
  const all = deals.current ?? [];
  const open = all.filter((d) => OPEN_STAGES.includes(d.stage));
  const now = clock.now.getTime();
  const monthAgo = now - 30 * 86_400_000;
  const closedRecently = all.filter(
    (d) =>
      (d.stage === 'won' || d.stage === 'lost') && Date.parse(d.closedAt ?? d.updatedAt) >= monthAgo
  );
  const wonRecently = closedRecently.filter((d) => d.stage === 'won');
  const closed = all.filter((d) => d.stage === 'won' || d.stage === 'lost');
  return {
    openValue: open.reduce((s, d) => s + d.amount, 0),
    openCount: open.length,
    weighted: open.reduce((s, d) => s + (d.amount * d.probability) / 100, 0),
    wonValue: wonRecently.reduce((s, d) => s + d.amount, 0),
    wonCount: wonRecently.length,
    winRate: closed.length
      ? Math.round((closed.filter((d) => d.stage === 'won').length / closed.length) * 100)
      : null,
    byStage: OPEN_STAGES.map((stage) => {
      const inStage = open.filter((d) => d.stage === stage);
      return { stage, count: inStage.length, value: inStage.reduce((s, d) => s + d.amount, 0) };
    }),
    mine: open
      .filter((d) => d.ownerId === principal.current?.persona.id)
      .sort((a, b) => a.closeDate.localeCompare(b.closeDate))
      .slice(0, 5),
  };
});
const maxStage = $derived(Math.max(1, ...stats.byStage.map((s) => s.value)));
const isEmpty = $derived((deals.current ?? []).length === 0 && (companyCount.current ?? 0) === 0);
const firstName = $derived(principal.current?.persona.name.split(' ')[0] ?? 'there');
const checklist = $derived([
  { label: 'Add your first company', done: (companyCount.current ?? 0) > 0 },
  { label: 'Add a contact', done: (contactCount.current ?? 0) > 0 },
  { label: 'Open your first deal', done: (deals.current ?? []).length > 0 },
  { label: 'Win a deal', done: (deals.current ?? []).some((d) => d.stage === 'won') },
]);
</script>

<PageHeader title={`Good to see you, ${firstName}`} description="Your pipeline at a glance.">
  {#snippet actions()}
    {#if can(CAPABILITIES.companiesWrite)}
      <Button variant="outline" onclick={() => (companyOpen = true)}><LucideIcon icon={Building2} class="size-4" /> Company</Button>
    {/if}
    {#if can(CAPABILITIES.dealsCreate)}
      <Button onclick={() => (dealOpen = true)} disabled={services.isPaywalled() || (!companyCount.loading && companyCount.current === 0)}>
        <Icon icon="plus" class="size-4" /> New deal
      </Button>
    {/if}
  {/snippet}
</PageHeader>

{#if services.isPaywalled()}
  <div role="status" class="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
    <p class="font-medium text-foreground">Your subscription has expired.</p>
    <p class="mt-1 text-muted-foreground">
      Existing data stays readable, but new companies, contacts and deals are paywalled (simulated).
    </p>
  </div>
{/if}

{#if isEmpty}
  <div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
    <EmptyState
      title="Your pipeline is empty"
      description="Start by adding a company you're talking to. Deals and contacts hang off companies."
      icon={Handshake}
    >
      {#snippet action()}
        {#if can(CAPABILITIES.companiesWrite)}
          <Button onclick={() => (companyOpen = true)} disabled={services.isPaywalled()}>
            <Icon icon="plus" class="size-4" /> Add your first company
          </Button>
        {:else}
          <p class="text-sm text-muted-foreground">Ask an admin to add companies — your role is read-only.</p>
        {/if}
      {/snippet}
    </EmptyState>
    <Card class="p-5">
      <h2 class="text-sm font-semibold">Getting started</h2>
      <ol class="mt-4 space-y-3">
        {#each checklist as step (step.label)}
          <li class="flex items-center gap-3 text-sm">
            <LucideIcon icon={CircleCheck} class={['size-5 shrink-0', step.done ? 'text-success' : 'text-muted-foreground/40']} />
            <span class={step.done ? 'text-muted-foreground line-through' : ''}>{step.label}</span>
            <span class="sr-only">{step.done ? '(done)' : '(to do)'}</span>
          </li>
        {/each}
      </ol>
    </Card>
  </div>
{:else}
  <section aria-label="Key metrics" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Open pipeline" value={moneyCompact(stats.openValue)} hint={`${stats.openCount} open deals`} icon={CircleDollarSign} />
    <StatCard label="Weighted forecast" value={moneyCompact(stats.weighted)} hint="Amount × stage probability" icon={Target} />
    <StatCard label="Won · last 30 days" value={moneyCompact(stats.wonValue)} hint={`${stats.wonCount} deals`} icon={Trophy} />
    <StatCard label="Win rate" value={stats.winRate === null ? '—' : `${stats.winRate}%`} hint="All closed deals" icon={TrendingUp} />
  </section>

  <div class="mt-6 grid gap-6 lg:grid-cols-5">
    <Card class="p-5 lg:col-span-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">Pipeline by stage</h2>
        <Link href="/pipeline" class="text-sm font-medium text-primary hover:underline">Open board</Link>
      </div>
      <ul class="mt-5 space-y-4">
        {#each stats.byStage as row (row.stage)}
          <li>
            <div class="mb-1.5 flex items-center justify-between text-sm">
              <span class="font-medium">{STAGE_LABELS[row.stage]} <span class="text-muted-foreground">· {row.count}</span></span>
              <span class="tabular-nums text-muted-foreground">{money(row.value)}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div class="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style:width={`${(row.value / maxStage) * 100}%`}></div>
            </div>
          </li>
        {/each}
      </ul>
    </Card>

    <Card class="p-5 lg:col-span-2">
      <h2 class="text-sm font-semibold">Your next closes</h2>
      {#if stats.mine.length === 0}
        <p class="mt-4 text-sm text-muted-foreground">No open deals assigned to you.</p>
      {:else}
        <ul class="mt-3 divide-y divide-border">
          {#each stats.mine as deal (deal.id)}
            <li>
              <Link href={`/deals/${deal.id}`} class="flex items-center justify-between gap-3 py-3 hover:text-primary">
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{deal.title}</span>
                  <span class="block text-xs text-muted-foreground">closes {fromNow(deal.closeDate, clock.now)}</span>
                </span>
                <span class="flex shrink-0 items-center gap-2">
                  <span class="text-sm tabular-nums">{moneyCompact(deal.amount)}</span>
                  <StageBadge stage={deal.stage} />
                </span>
              </Link>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
  </div>

  <Card class="mt-6 p-5">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold">Recent activity</h2>
      <Link href="/activity" class="text-sm font-medium text-primary hover:underline">View all</Link>
    </div>
    <ul class="mt-3 divide-y divide-border">
      {#each recent.current ?? [] as item (item.id)}
        <li class="flex items-start justify-between gap-4 py-3 text-sm">
          <span class="min-w-0">
            <span class="font-medium">{people.current?.get(item.actorId) ?? 'Someone'}</span>
            <span class="text-muted-foreground"> · {item.body}</span>
          </span>
          <span class="flex shrink-0 items-center gap-2">
            <Badge variant="outline">{item.type}</Badge>
            <time class="text-xs text-muted-foreground" datetime={item.at}>{fromNow(item.at, clock.now)}</time>
          </span>
        </li>
      {/each}
    </ul>
  </Card>
{/if}

<DealDialog bind:open={dealOpen} />
<CompanyDialog bind:open={companyOpen} />
