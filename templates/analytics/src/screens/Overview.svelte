<script lang="ts">
import { Pencil, PencilLine } from '@lucide/svelte';
import type { DashboardLayout } from '@protoyard/analytics';
import { KpiRow, KpiTile } from '@protoyard/analytics-ui';
import { DashboardGrid, WidgetCard } from '@protoyard/analytics-ui/grid';
import { can, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Button, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import PageHeader from '../components/PageHeader.svelte';
import RangeBar from '../components/RangeBar.svelte';
import RenameDialog from '../components/RenameDialog.svelte';
import { activeUsersSeries, eventsInRange, kpis } from '../domain/metrics.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useAnalytics } from '../lib/context.ts';
import { resolveRange, sharedRange } from '../lib/range.svelte.ts';
import type { WidgetKey } from '../scenarios/seeds.ts';
import { WIDGET_LOADERS } from '../widgets/types.ts';

const { db, services } = useAnalytics();
const clock = useClock();

const resolved = $derived(resolveRange(sharedRange.value, clock.now));
const dashboard = liveQuery(() => db.dashboards.get('dashboard_overview'), { initial: undefined });
// Re-runs when rows change (scenario loads, timeline) and when the range changes.
const data = liveQuery(
  async () => {
    const { range, previous } = resolved;
    const [events, before, total] = await Promise.all([
      eventsInRange(db, range),
      previous ? eventsInRange(db, previous) : Promise.resolve([]),
      db.events.count(),
    ]);
    return { events, before, total };
  },
  {
    initial: undefined,
    deps: () => [resolved.range.start, resolved.range.end, resolved.previous?.start],
  }
);

let editing = $state(false);
let renameOpen = $state(false);
const current = $derived(data.current ? kpis(data.current.events) : null);
const previous = $derived(data.current && resolved.previous ? kpis(data.current.before) : null);
const spark = $derived(
  data.current
    ? activeUsersSeries(
        data.current.events,
        resolved.range,
        resolved.granularity === 'hour' ? 'hour' : 'day'
      )
    : []
);
const canEdit = $derived(can(CAPABILITIES.dashboardsEdit));
const save = (layout: DashboardLayout) =>
  services.dashboards.saveLayout('dashboard_overview', { layout });
</script>

<PageHeader title={dashboard.current?.name ?? 'Overview'} description="Product usage from tracked events. Everything here is simulated data.">
  {#snippet actions()}
    <RangeBar now={clock.now} />
    {#if canEdit && dashboard.current}
      <Button variant="outline" size="sm" onclick={() => (renameOpen = true)}><LucideIcon icon={PencilLine} class="size-4" />Rename</Button>
      <Button variant={editing ? 'secondary' : 'outline'} size="sm" aria-pressed={editing} onclick={() => (editing = !editing)}>
        <LucideIcon icon={Pencil} class="size-4" />{editing ? 'Done editing' : 'Edit layout'}
      </Button>
    {/if}
  {/snippet}
</PageHeader>

{#if data.error}
  <ErrorState title="Could not load the overview" message={String(data.error)} />
{:else if data.current === undefined}
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading overview">
    {#each [0, 1, 2, 3] as i (i)}<Skeleton class="h-28 rounded-xl" />{/each}
  </div>
  <Skeleton class="mt-6 h-72 rounded-xl" />
{:else if data.current.total === 0}
  <EmptyState
    title="No events tracked yet"
    description="Once the product sends events, this dashboard fills in by itself. Load the “Quarter of history” scenario from DevTools to see it with data."
  />
{:else}
  <KpiRow label="Key metrics">
    <KpiTile label="Active users" value={current?.activeUsers} previous={previous?.activeUsers} trend={spark} trendPeriod="the selected range" href="#/trends" />
    <KpiTile label="Signups" value={current?.signups} previous={previous?.signups} href="#/funnels" />
    <KpiTile label="Events" value={current?.events} previous={previous?.events} unit="compact" href="#/trends" />
    <KpiTile label="Upgrade rate" value={current?.upgradeRate} previous={previous?.upgradeRate} unit="percent" href="#/funnels" />
  </KpiRow>

  {#if dashboard.current}
    {@const events = data.current.events}
    <div class="mt-6">
      <DashboardGrid layout={dashboard.current.layout} label="{dashboard.current.name} widgets" editing={editing && canEdit} onchange={save}>
        {#snippet widget(item)}
          <WidgetCard title={item.title ?? item.widget} expandable>
            {#snippet children()}
              {@const load = WIDGET_LOADERS[item.widget as WidgetKey]}
              {#if load}
                {#await load()}
                  <Skeleton class="h-48 rounded-lg" />
                {:then { default: Widget }}
                  <Widget title={item.title ?? item.widget} {events} range={resolved.range} granularity={resolved.granularity} />
                {:catch}
                  <p role="note" class="text-sm text-muted-foreground">This widget's code did not load. Reload the page to try again.</p>
                {/await}
              {:else}
                <p role="note" class="text-sm text-muted-foreground">Unknown widget “{item.widget}”.</p>
              {/if}
            {/snippet}
          </WidgetCard>
        {/snippet}
      </DashboardGrid>
    </div>
    <RenameDialog bind:open={renameOpen} title="Rename dashboard" current={dashboard.current.name} save={(name) => services.dashboards.rename('dashboard_overview', { name })} />
  {/if}
{/if}
