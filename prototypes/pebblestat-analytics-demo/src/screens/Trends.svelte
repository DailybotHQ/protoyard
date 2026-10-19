<script lang="ts">
import { BookmarkPlus, Flag } from '@lucide/svelte';
import type { FilterGroup } from '@protoyard/analytics';
import { BreakdownSelect, FilterBuilder, SegmentPicker } from '@protoyard/analytics-ui/filters';
import { LineChart } from '@protoyard/charts-ui/cartesian';
import { can, liveQuery, runService, useClock } from '@protoyard/renderer-svelte';
import { Badge, Button, Card, ErrorState, Select } from '@protoyard/ui';
import AnnotationDialog from '../components/AnnotationDialog.svelte';
import AnnotationStrip from '../components/AnnotationStrip.svelte';
import PageHeader from '../components/PageHeader.svelte';
import RangeBar from '../components/RangeBar.svelte';
import SaveReportDialog from '../components/SaveReportDialog.svelte';
import { type Annotation, EVENT_TYPES, type ReportConfig } from '../database/schema.ts';
import { EVENT_LABELS, EVENT_PROPERTIES } from '../domain/catalog.ts';
import { applyFilter, eventsInRange, eventsOfType, trendSeries } from '../domain/metrics.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useAnalytics } from '../lib/context.ts';
import { currentProject } from '../lib/project.svelte.ts';
import { resolveRange, sharedRange } from '../lib/range.svelte.ts';

/** `?report=<id>` opens a saved report (the router passes the query). */
let { query }: { query?: URLSearchParams } = $props();

const { db, services } = useAnalytics();
const clock = useClock();

const EMPTY: FilterGroup = { combinator: 'and', conditions: [] };
let eventType = $state('all');
let measure = $state<'events' | 'users'>('events');
let breakdown = $state<string | null>(null);
let filter = $state<FilterGroup>(EMPTY);
let activeSegment = $state<string | null>(null);
let saveOpen = $state(false);
let annotateOpen = $state(false);

const reportId = $derived(query?.get('report') ?? null);
const report = liveQuery(() => (reportId ? db.reports.get(reportId) : undefined), {
  initial: undefined,
  deps: () => reportId,
});
// Opening a report applies its saved query once (later edits are the user's).
let applied = $state<string | null>(null);
$effect(() => {
  const r = report.current;
  if (!r || applied === r.id) return;
  applied = r.id;
  if (r.projectId !== currentProject.id) currentProject.set(r.projectId);
  eventType = r.config.eventType;
  measure = r.config.measure;
  breakdown = r.config.breakdown;
  filter = r.config.filter;
  activeSegment = null;
});

const resolved = $derived(resolveRange(sharedRange.value, clock.now));
// One event type uses the [type+at] index; "all events" scans the at index.
const events = liveQuery(
  () =>
    eventType === 'all'
      ? eventsInRange(db, resolved.range, currentProject.id)
      : eventsOfType(db, eventType, resolved.range, currentProject.id),
  {
    initial: undefined,
    deps: () => [eventType, resolved.range.start, resolved.range.end, currentProject.id],
  }
);
const context = liveQuery(
  async () => {
    const projectId = currentProject.id;
    const [project, segments, annotations] = await Promise.all([
      db.projects.get(projectId),
      db.segments.where('projectId').equals(projectId).sortBy('name'),
      db.annotations.where('projectId').equals(projectId).toArray(),
    ]);
    return { rate: project?.sampleRate ?? 1, segments, annotations };
  },
  { initial: undefined, deps: () => currentProject.id }
);

const rate = $derived(context.current?.rate ?? 1);
const filtered = $derived(events.current ? applyFilter(events.current, filter) : undefined);
// On a user-sampled project every count stands for 1 / rate of the full stream.
const series = $derived(
  filtered
    ? trendSeries(filtered, {
        range: resolved.range,
        granularity: resolved.granularity,
        breakdown,
        measure,
      }).map((s) =>
        rate < 1
          ? {
              ...s,
              points: s.points.map((p) => ({
                ...p,
                y: p.y === null ? null : Math.round(p.y / rate),
              })),
            }
          : s
      )
    : []
);
const eventLabel = $derived(
  eventType === 'all' ? 'All events' : (EVENT_LABELS[eventType] ?? eventType)
);
const title = $derived(
  `${measure === 'users' ? 'Unique users' : 'Events'}${eventType === 'all' ? '' : `: ${eventLabel}`}${rate < 1 ? ' (estimated)' : ''}`
);
const config = $derived<ReportConfig>({ eventType, measure, breakdown, filter });
const typeItems = [
  { value: 'all', label: 'All events' },
  ...EVENT_TYPES.map((t) => ({ value: t, label: EVENT_LABELS[t] ?? t })),
];
const removeAnnotation = (a: Annotation) =>
  runService(() => services.annotations.remove(a.id), { success: 'Annotation removed' });
</script>

<PageHeader title={report.current ? report.current.name : 'Trends'} description={report.current ? 'A saved report. Change anything and save it as a new report.' : 'How often things happen, filtered and broken down by event properties.'}>
  {#snippet actions()}
    {#if rate < 1}<Badge variant="outline">Estimated from a {Math.round(rate * 100)} % user sample</Badge>{/if}
    <RangeBar now={clock.now} />
    {#if can(CAPABILITIES.annotationsCreate)}
      <Button variant="outline" size="sm" onclick={() => (annotateOpen = true)}><Flag class="size-4" aria-hidden="true" />Annotate</Button>
    {/if}
    {#if can(CAPABILITIES.reportsSave)}
      <Button size="sm" onclick={() => (saveOpen = true)}><BookmarkPlus class="size-4" aria-hidden="true" />Save report</Button>
    {/if}
  {/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
  <Card class="grid gap-4 p-5">
    <div class="flex flex-wrap items-end gap-3">
      <label class="grid gap-1 text-xs text-muted-foreground">
        Event
        <Select items={typeItems} bind:value={eventType} aria-label="Event" />
      </label>
      <div class="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Measure">
        <Button size="sm" variant={measure === 'events' ? 'secondary' : 'ghost'} aria-pressed={measure === 'events'} onclick={() => (measure = 'events')}>Events</Button>
        <Button size="sm" variant={measure === 'users' ? 'secondary' : 'ghost'} aria-pressed={measure === 'users'} onclick={() => (measure = 'users')}>Unique users</Button>
      </div>
      <BreakdownSelect properties={EVENT_PROPERTIES.filter((p) => p.path !== 'type' || eventType === 'all')} value={breakdown} onchange={(path) => (breakdown = path)} />
    </div>
    {#if events.error}
      <ErrorState title="Could not load events" message={String(events.error)} />
    {:else}
      <LineChart {title} {series} xKind="time" loading={filtered === undefined} height={300} emptyMessage="No matching events in this period" />
      <AnnotationStrip annotations={context.current?.annotations ?? []} range={resolved.range} onremove={can(CAPABILITIES.annotationsCreate) ? removeAnnotation : undefined} />
    {/if}
  </Card>

  <Card class="grid content-start gap-4 p-5">
    <SegmentPicker
      segments={context.current?.segments ?? []}
      activeId={activeSegment}
      properties={EVENT_PROPERTIES}
      {filter}
      onapply={(segment) => {
        activeSegment = segment?.id ?? null;
        filter = segment ? segment.filter : EMPTY;
      }}
      onsave={can(CAPABILITIES.segmentsCreate)
        ? async (input) => {
            const saved = await services.segments.create({ ...input, projectId: currentProject.id });
            activeSegment = saved.id;
          }
        : undefined}
    />
    <FilterBuilder
      value={filter}
      properties={EVENT_PROPERTIES}
      onchange={(next) => {
        filter = next;
        activeSegment = null;
      }}
    />
  </Card>
</div>

<SaveReportDialog bind:open={saveOpen} projectId={currentProject.id} {config} suggestion={`${eventLabel}${breakdown ? ` by ${EVENT_PROPERTIES.find((p) => p.path === breakdown)?.label.toLowerCase() ?? 'property'}` : ''}`} />
<AnnotationDialog bind:open={annotateOpen} projectId={currentProject.id} />
