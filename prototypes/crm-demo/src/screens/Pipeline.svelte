<script lang="ts">
import { GripVertical, MoveRight, Plus } from '@lucide/svelte';
import { can, Link, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Button, Card, DropdownMenu, Input } from '@protoyard/ui';
import DealDialog from '../components/DealDialog.svelte';
import LostReasonDialog from '../components/LostReasonDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import { DEAL_STAGES, type Deal, type DealStage } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { STAGE_LABELS } from '../domain/services.ts';
import { useCrm } from '../lib/context.ts';
import { moneyCompact } from '../lib/format.ts';

/**
 * Kanban board. Cards move by drag-and-drop OR the "Move to…" menu (the
 * keyboard/screen-reader path). Moves go through `deals.moveStage`, so the
 * simulated policy decides — reps can only move their own deals.
 */
const { db, services } = useCrm();
const principal = usePrincipal();

const deals = liveQuery(() => db.deals.toArray(), { initial: [] });
const companies = liveQuery(
  async () => new Map((await db.companies.toArray()).map((c) => [c.id, c.name])),
  { initial: new Map() }
);
const people = liveQuery(
  async () =>
    new Map((await db.table('py_personas').toArray()).map((p) => [p.id, p.name as string])),
  { initial: new Map() }
);

let query = $state('');
let mineOnly = $state(false);
let showClosed = $state(false);
let createIn = $state<DealStage>('lead');
let createOpen = $state(false);
let dragging = $state<string | null>(null);
let dropTarget = $state<DealStage | null>(null);
let losing = $state<Deal | null>(null);

const stages = $derived(showClosed ? DEAL_STAGES : DEAL_STAGES.filter((s) => s !== 'lost'));
const columns = $derived.by(() => {
  const q = query.trim().toLowerCase();
  const me = principal.current?.persona.id;
  const visible = (deals.current ?? []).filter(
    (d) =>
      (!mineOnly || d.ownerId === me) &&
      (!q ||
        d.title.toLowerCase().includes(q) ||
        (companies.current?.get(d.companyId) ?? '').toLowerCase().includes(q))
  );
  return stages.map((stage) => {
    const items = visible.filter((d) => d.stage === stage).sort((a, b) => b.amount - a.amount);
    return { stage, items, total: items.reduce((s, d) => s + d.amount, 0) };
  });
});

async function move(deal: Deal, stage: DealStage) {
  if (deal.stage === stage) return;
  if (stage === 'lost') {
    losing = deal;
    return;
  }
  await runService(() => services.deals.moveStage(deal.id, stage), {
    success: `Moved to ${STAGE_LABELS[stage]}`,
  });
}

function onDrop(stage: DealStage) {
  const deal = (deals.current ?? []).find((d) => d.id === dragging);
  dragging = null;
  dropTarget = null;
  if (deal) void move(deal, stage);
}
</script>

<PageHeader title="Pipeline" description="Drag cards between stages, or use each card's menu.">
  {#snippet actions()}
    <Input type="search" placeholder="Filter deals…" aria-label="Filter deals" bind:value={query} class="w-56" />
    <label class="flex items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" bind:checked={mineOnly} class="size-4 accent-[var(--color-primary)]" /> Mine
    </label>
    <label class="flex items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" bind:checked={showClosed} class="size-4 accent-[var(--color-primary)]" /> Show lost
    </label>
  {/snippet}
</PageHeader>

<div class="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
  <div class="flex min-w-max gap-4" role="list" aria-label="Pipeline stages">
    {#each columns as column (column.stage)}
      <div
        role="listitem"
        aria-label={`${STAGE_LABELS[column.stage]}: ${column.items.length} deals`}
        class={[
          'flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors',
          dropTarget === column.stage ? 'border-primary bg-primary/5' : 'border-border',
        ]}
        ondragover={(e) => {
          if (!dragging) return;
          e.preventDefault();
          dropTarget = column.stage;
        }}
        ondragleave={() => (dropTarget = dropTarget === column.stage ? null : dropTarget)}
        ondrop={(e) => {
          e.preventDefault();
          onDrop(column.stage);
        }}
      >
        <header class="flex items-center justify-between px-3 pt-3 pb-2">
          <div>
            <h2 class="text-sm font-semibold">{STAGE_LABELS[column.stage]} <span class="font-normal text-muted-foreground">{column.items.length}</span></h2>
            <p class="text-xs tabular-nums text-muted-foreground">{moneyCompact(column.total)}</p>
          </div>
          {#if can(CAPABILITIES.dealsCreate) && column.stage !== 'won' && column.stage !== 'lost'}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`New deal in ${STAGE_LABELS[column.stage]}`}
              disabled={services.isPaywalled()}
              onclick={() => {
                createIn = column.stage;
                createOpen = true;
              }}
            >
              <Plus class="size-4" />
            </Button>
          {/if}
        </header>

        <ul class="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
          {#each column.items as deal (deal.id)}
            {@const editable = can(CAPABILITIES.dealsUpdate, deal)}
            <li
              draggable={editable}
              ondragstart={(e) => {
                dragging = deal.id;
                e.dataTransfer?.setData('text/plain', deal.id);
              }}
              ondragend={() => {
                dragging = null;
                dropTarget = null;
              }}
              class={[dragging === deal.id && 'opacity-50']}
            >
              <Card class="group p-3 shadow-sm transition-shadow hover:shadow-md">
                <div class="flex items-start gap-2">
                  {#if editable}
                    <GripVertical class="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground/50" aria-hidden="true" />
                  {/if}
                  <div class="min-w-0 flex-1">
                    <Link href={`/deals/${deal.id}`} class="block truncate text-sm font-medium hover:text-primary">{deal.title}</Link>
                    <p class="truncate text-xs text-muted-foreground">{companies.current?.get(deal.companyId) ?? '—'}</p>
                  </div>
                  {#if editable}
                    <DropdownMenu
                      align="end"
                      items={[
                        { type: 'label', label: 'Move to' },
                        ...DEAL_STAGES.filter((s) => s !== deal.stage).map((s) => ({
                          label: STAGE_LABELS[s],
                          destructive: s === 'lost',
                          onSelect: () => void move(deal, s),
                        })),
                      ]}
                    >
                      {#snippet trigger({ props })}
                        <Button {...props} variant="ghost" size="icon" class="size-7 shrink-0" aria-label={`Move ${deal.title}`}>
                          <MoveRight class="size-4" />
                        </Button>
                      {/snippet}
                    </DropdownMenu>
                  {/if}
                </div>
                <div class="mt-3 flex items-center justify-between">
                  <span class="text-sm font-semibold tabular-nums">{moneyCompact(deal.amount)}</span>
                  <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {deal.probability}%
                    <Avatar name={people.current?.get(deal.ownerId) ?? '?'} size="xs" />
                  </span>
                </div>
              </Card>
            </li>
          {:else}
            <li class="grid flex-1 place-items-center rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No deals here
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
</div>

<DealDialog bind:open={createOpen} stage={createIn} openAfterCreate={false} />
<LostReasonDialog bind:deal={losing} />
