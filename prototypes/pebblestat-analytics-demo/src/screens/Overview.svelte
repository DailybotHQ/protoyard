<script lang="ts">
import { Pencil, PencilLine } from '@lucide/svelte';
import type { DashboardLayout } from '@protoyard/analytics';
import { KpiRow, KpiTile } from '@protoyard/analytics-ui';
import { DashboardGrid, WidgetCard } from '@protoyard/analytics-ui/grid';
import { can, liveQuery, runService, useClock } from '@protoyard/renderer-svelte';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import AnnotationStrip from '../components/AnnotationStrip.svelte';
import PageHeader from '../components/PageHeader.svelte';
import RangeBar from '../components/RangeBar.svelte';
import RenameDialog from '../components/RenameDialog.svelte';
import type { Annotation } from '../database/schema.ts';
import {
  activeUsersSeries,
  eventsInRange,
  kpis,
  rollupsInRange,
  rollupTotal,
} from '../domain/metrics.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useAnalytics } from '../lib/context.ts';
import { currentProject } from '../lib/project.svelte.ts';
import { resolveRange, sharedRange } from '../lib/range.svelte.ts';
import type { WidgetKey } from '../scenarios/seeds.ts';
import { WIDGET_LOADERS } from '../widgets/types.ts';

const { db, services } = useAnalytics();
const clock = useClock();

const resolved = $derived(resolveRange(sharedRange.value, clock.now));
const dashboardId = $derived(`dashboard_${currentProject.id}`);
const dashboard = liveQuery(() => db.dashboards.get(dashboardId), {
  initial: undefined,
  deps: () => dashboardId,
});
// Re-runs when rows change (scenario loads, timeline) and when the range or project changes.
const data = liveQuery(
  async () => {
    const { range, previous } = resolved;
    const projectId = currentProject.id;
    const project = await db.projects.get(projectId);
    const sampled = (project?.sampleRate ?? 1) < 1;
    const [events, before, total, rollups, rollupsBefore, annotations] = await Promise.all([
      eventsInRange(db, range, projectId),
      previous ? eventsInRange(db, previous, projectId) : Promise.resolve([]),
      db.events.where('projectId').equals(projectId).count(),
      sampled ? rollupsInRange(db, range, projectId) : Promise.resolve([]),
      sampled && previous ? rollupsInRange(db, previous, projectId) : Promise.resolve([]),
      db.annotations.where('projectId').equals(projectId).toArray(),
    ]);
    return {
      rate: project?.sampleRate ?? 1,
      events,
      before,
      total,
      rollups,
      rollupsBefore,
      annotations,
    };
  },
  {
    initial: undefined,
    deps: () => [
      resolved.range.start,
      resolved.range.end,
      resolved.previous?.start,
      currentProject.id,
    ],
  }
);

let editing = $state(false);
let renameOpen = $state(false);
const rate = $derived(data.current?.rate ?? 1);
const sampled = $derived(rate < 1);
/** KPIs from the raw events; on a sampled project, counts are scaled estimates and events are exact rollups. */
const figures = $derived.by(() => {
  const d = data.current;
  if (!d) return null;
  const scale = (n: number) => Math.round(n / rate);
  const now = kpis(d.events);
  const then = resolved.previous ? kpis(d.before) : null;
  return {
    activeUsers: [scale(now.activeUsers), then ? scale(then.activeUsers) : null],
    signups: [scale(now.signups), then ? scale(then.signups) : null],
    events: sampled
      ? [rollupTotal(d.rollups), then ? rollupTotal(d.rollupsBefore) : null]
      : [now.events, then?.events ?? null],
    upgradeRate: [now.upgradeRate, then?.upgradeRate ?? null],
  } as const;
});
const spark = $derived(
  data.current
    ? activeUsersSeries(
        data.current.events,
        resolved.range,
        resolved.granularity === 'hour' ? 'hour' : 'day'
      ).map((n) => Math.round(n / rate))
    : []
);
const canEdit = $derived(can(CAPABILITIES.dashboardsEdit));
const canAnnotate = $derived(can(CAPABILITIES.annotationsCreate));
const save = (layout: DashboardLayout) => services.dashboards.saveLayout(dashboardId, { layout });
const removeAnnotation = (a: Annotation) =>
  runService(() => services.annotations.remove(a.id), { success: 'Annotation removed' });
</script>

<PageHeader title={dashboard.current?.name ?? 'Overview'} description="Product usage from tracked events. Everything here is simulated data.">
  {#snippet actions()}
    {#if sampled}<Badge variant="outline" title="Counts are estimated from a user sample; event totals come from exact daily rollups">Sampled · {Math.round(rate * 100)} % of users</Badge>{/if}
    <RangeBar now={clock.now} />
    {#if canEdit && dashboard.current}
      <Button variant="outline" size="sm" onclick={() => (renameOpen = true)}><PencilLine class="size-4" aria-hidden="true" />Rename</Button>
      <Button variant={editing ? 'secondary' : 'outline'} size="sm" aria-pressed={editing} onclick={() => (editing = !editing)}>
        <Pencil class="size-4" aria-hidden="true" />{editing ? 'Done editing' : 'Edit layout'}
      </Button>
    {/if}
  {/snippet}
</PageHeader>

{#if data.error}
  <ErrorState title="Could not load the overview" message={String(data.error)} />
{:else if data.current === undefined || !figures}
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading overview">
    {#each [0, 1, 2, 3] as i (i)}<Skeleton class="h-28 rounded-xl" />{/each}
  </div>
  <Skeleton class="mt-6 h-72 rounded-xl" />
{:else if data.current.total === 0}
  <EmptyState
    title="No events tracked yet"
    description="Once the product sends events, this dashboard fills in by itself. Load the “Healthy growth” scenario from DevTools to see it with data."
  />
{:else}
  <KpiRow label="Key metrics">
    <KpiTile label={sampled ? 'Active users (est.)' : 'Active users'} value={figures.activeUsers[0]} previous={figures.activeUsers[1]} trend={spark} trendPeriod="the selected range" href="#/trends" />
    <KpiTile label={sampled ? 'Signups (est.)' : 'Signups'} value={figures.signups[0]} previous={figures.signups[1]} href="#/funnels" />
    <KpiTile label="Events" value={figures.events[0]} previous={figures.events[1]} unit="compact" href="#/trends" />
    <KpiTile label="Upgrade rate" value={figures.upgradeRate[0]} previous={figures.upgradeRate[1]} unit="percent" href="#/funnels" />
  </KpiRow>

  <div class="mt-4">
    <AnnotationStrip annotations={data.current.annotations} range={resolved.range} onremove={canAnnotate ? removeAnnotation : undefined} />
  </div>

  {#if dashboard.current}
    {@const events = data.current.events}
    {@const rollups = data.current.rollups}
    <div class="mt-6">
      <DashboardGrid layout={dashboard.current.layout} label="{dashboard.current.name} widgets" editing={editing && canEdit} onchange={save}>
        {#snippet widget(item)}
          <WidgetCard title={item.title ?? item.widget} description={sampled && item.widget !== 'trend' ? `From a ${Math.round(rate * 100)} % user sample` : undefined} expandable>
            {#snippet children()}
              {@const load = WIDGET_LOADERS[item.widget as WidgetKey]}
              {#if load}
                {#await load()}
                  <Skeleton class="h-48 rounded-lg" />
                {:then { default: Widget }}
                  <Widget title={item.title ?? item.widget} {events} {rollups} sampleRate={rate} range={resolved.range} granularity={resolved.granularity} />
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
    <RenameDialog bind:open={renameOpen} title="Rename dashboard" current={dashboard.current.name} save={(name) => services.dashboards.rename(dashboardId, { name })} />
  {/if}
{/if}
