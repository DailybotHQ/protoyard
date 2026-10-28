<script lang="ts">
import { comparisonRange } from '@protoyard/analytics';
import {
  aggregate,
  type Blueprint,
  CAPABILITIES,
  type EntityServices,
  fieldLabel,
  inputProperty,
} from '@protoyard/blueprint';
import { PermissionDeniedError, type PrototypeRuntime } from '@protoyard/core';
import {
  can,
  liveQuery,
  navigate,
  parseHash,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import type { DataTableColumn, DataTableSort } from '@protoyard/ui';
import { Button, DataTable, Select } from '@protoyard/ui';
import { onMount } from 'svelte';
import { formatEntityHeading, formatMoney } from '../../format.ts';
import {
  type AnalyticsPoint,
  type AnalyticsQueryState,
  type AnalyticsScreenSpec,
  analyticsCsv,
  analyticsPoints,
  analyticsRange,
  formatDimension,
  parseAnalyticsQuery,
  serializeAnalyticsQuery,
} from './model.ts';

let {
  runtime,
  blueprint,
  services,
  screen,
  query,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  services: EntityServices;
  screen: AnalyticsScreenSpec;
  query?: URLSearchParams;
} = $props();

// svelte-ignore state_referenced_locally
const entity = blueprint.entities.find((candidate) => candidate.name === screen.entity);
// svelte-ignore state_referenced_locally
if (!entity) throw new RangeError(`analytics screen: unknown entity "${screen.entity}"`);
// svelte-ignore state_referenced_locally
const service = services[screen.entity];
// svelte-ignore state_referenced_locally
if (!service) throw new RangeError(`analytics screen: no service for "${screen.entity}"`);
// svelte-ignore state_referenced_locally
const principal = usePrincipal(runtime);
// svelte-ignore state_referenced_locally
const clock = useClock(runtime);
const caps = $derived(CAPABILITIES(blueprint)[screen.entity]);
const canExport = $derived(
  Boolean(caps && principal.current && can(caps.export, undefined, runtime))
);
const dimensions = $derived(
  screen.dimensions.map((name) => {
    const field = entity.fields.find((candidate) => candidate.name === name);
    return {
      path: name,
      label: field ? fieldLabel(field) : name,
      type: field?.kind === 'boolean' ? ('boolean' as const) : ('string' as const),
      ...(field?.kind === 'enum'
        ? {
            options: field.values.map((value) => ({
              value,
              label: field.labels?.[value] ?? value,
            })),
          }
        : {}),
    };
  })
);
let routeState = $state<AnalyticsQueryState>(
  parseAnalyticsQuery(
    query ?? (typeof location === 'undefined' ? '' : parseHash(location.hash).query),
    screen
  )
);
let attempt = $state(0);
let scenarioId = $state(runtime.scenarios.active()?.scenario.id ?? '');
let sort = $state<DataTableSort | null>(null);
function measureAt(index: number) {
  const measure = screen.measures[index] ?? screen.measures[0];
  if (!measure) throw new RangeError('analytics screen needs at least one measure');
  return measure;
}
const selectedMeasure = $derived(measureAt(routeState.measure));
const selectedValueField = $derived(
  selectedMeasure.field
    ? entity.fields.find((candidate) => candidate.name === selectedMeasure.field)
    : undefined
);
const locale = $derived(principal.current?.persona.locale ?? 'en-US');
const currentRange = $derived(analyticsRange(routeState.dateRange, clock.now));
const previousRange = $derived(
  routeState.dateRange.comparison === 'none'
    ? null
    : comparisonRange(currentRange, routeState.dateRange.comparison)
);
const data = liveQuery(
  async () => {
    try {
      const rows = await service.list();
      const current = analyticsPoints(
        rows,
        entity,
        selectedMeasure,
        screen.dateField,
        routeState.dimension,
        currentRange,
        routeState.dateRange.granularity
      );
      const currentRows = rows.filter((row) => {
        const field = entity.fields.find((candidate) => candidate.name === screen.dateField);
        const value = row[field ? inputProperty(field) : screen.dateField];
        const at =
          value instanceof Date
            ? value.getTime()
            : typeof value === 'string'
              ? Date.parse(value)
              : Number.NaN;
        return at >= currentRange.start && at < currentRange.end;
      });
      const currentTotal = aggregate(
        currentRows,
        {
          aggregate: selectedMeasure.aggregate,
          ...(selectedMeasure.field ? { field: selectedMeasure.field } : {}),
          ...(routeState.dimension ? { groupBy: routeState.dimension } : {}),
        },
        entity
      ).total.value;
      if (!previousRange)
        return { current, previous: [] as AnalyticsPoint[], currentTotal, previousTotal: null };
      const previous = analyticsPoints(
        rows,
        entity,
        selectedMeasure,
        screen.dateField,
        routeState.dimension,
        previousRange,
        routeState.dateRange.granularity
      );
      const previousRows = rows.filter((row) => {
        const field = entity.fields.find((candidate) => candidate.name === screen.dateField);
        const value = row[field ? inputProperty(field) : screen.dateField];
        const at =
          value instanceof Date
            ? value.getTime()
            : typeof value === 'string'
              ? Date.parse(value)
              : Number.NaN;
        return at >= previousRange.start && at < previousRange.end;
      });
      const previousTotal = aggregate(
        previousRows,
        {
          aggregate: selectedMeasure.aggregate,
          ...(selectedMeasure.field ? { field: selectedMeasure.field } : {}),
          ...(routeState.dimension ? { groupBy: routeState.dimension } : {}),
        },
        entity
      ).total.value;
      return { current, previous, currentTotal, previousTotal };
    } catch (error) {
      if (error instanceof PermissionDeniedError) return null;
      throw error;
    }
  },
  {
    initial: undefined,
    deps: () => [
      attempt,
      scenarioId,
      principal.current?.persona.id,
      routeState.measure,
      routeState.dimension,
      routeState.dateRange.range,
      routeState.dateRange.comparison,
      routeState.dateRange.granularity,
      clock.now.getTime(),
    ],
  }
);

const rows = $derived(data.current?.current ?? []);
const chartSeries = $derived.by(() => {
  const result = data.current;
  if (!result || !entity) return [];
  const names = routeState.dimension
    ? [
        ...new Set([
          ...result.current.map((point) => point.dimension),
          ...result.previous.map((point) => point.dimension),
        ]),
      ]
    : [null];
  const previousOffset = previousRange ? currentRange.start - previousRange.start : 0;
  return names.flatMap((dimension, index) => {
    const current = result.current.filter((point) => point.dimension === dimension);
    const previous = result.previous.filter((point) => point.dimension === dimension);
    const label = formatDimension(entity, routeState.dimension, dimension);
    const color = `var(--tx-chart-${(index % 6) + 1})`;
    return [
      {
        id: `current-${dimension ?? 'all'}`,
        label,
        color,
        points: current.map((point) => ({ x: Date.parse(point.bucket), y: point.value })),
      },
      ...(previousRange
        ? [
            {
              id: `previous-${dimension ?? 'all'}`,
              label: `${label} (previous period)`,
              color,
              comparison: true,
              points: previous.map((point) => ({
                x: Date.parse(point.bucket) + previousOffset,
                y: point.value,
              })),
            },
          ]
        : []),
    ];
  });
});
const tableRows = $derived(
  rows.map((point) => ({
    ...point,
    dimensionLabel: formatDimension(entity, routeState.dimension, point.dimension),
    valueLabel:
      selectedValueField?.kind === 'money'
        ? formatMoney(point.value, selectedValueField.currency, locale)
        : (point.value ?? '—'),
  }))
);
const columns: DataTableColumn<(typeof tableRows)[number]>[] = $derived([
  { key: 'bucket', header: 'Bucket', sortable: true, accessor: (row) => row.bucket },
  ...(routeState.dimension
    ? [
        {
          key: 'dimensionLabel',
          header: 'Dimension',
          sortable: true,
          accessor: (row: (typeof tableRows)[number]) => row.dimensionLabel,
        },
      ]
    : []),
  {
    key: 'value',
    header: selectedMeasure.label ?? 'Value',
    sortable: true,
    align: 'right',
    accessor: (row) => row.value,
    cell: valueCell,
  },
  {
    key: 'records',
    header: 'Records',
    sortable: true,
    align: 'right',
    accessor: (row) => row.records,
  },
]);

function queryFromHash() {
  if (typeof location === 'undefined') return;
  routeState = parseAnalyticsQuery(parseHash(location.hash).query, screen);
}

function persistState(next: AnalyticsQueryState) {
  routeState = next;
  if (typeof location === 'undefined') return;
  const current = parseHash(location.hash);
  const params = serializeAnalyticsQuery(next, current.query);
  navigate(`${current.path}?${params.toString()}`, { replace: true });
}

function chooseMeasure(raw: string) {
  const value = Number(raw);
  if (Number.isInteger(value) && screen.measures[value])
    persistState({ ...routeState, measure: value });
}

function chooseDimension(value: string | null) {
  persistState({ ...routeState, dimension: value });
}

function chooseDateRange(value: AnalyticsQueryState['dateRange']) {
  persistState({ ...routeState, dateRange: value });
}

function exportCsv() {
  if (!canExport || !data.current || !entity) return;
  const csv = analyticsCsv(data.current.current, entity, routeState.dimension);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${entity.plural}-analytics.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

onMount(() => {
  if (!query) queryFromHash();
  const offScenario = runtime.scenarios.subscribe((info) => {
    scenarioId = info?.scenario.id ?? '';
  });
  window.addEventListener('hashchange', queryFromHash);
  return () => {
    offScenario();
    window.removeEventListener('hashchange', queryFromHash);
  };
});
</script>

{#snippet valueCell(row: (typeof tableRows)[number])}
  {row.valueLabel}
{/snippet}

<section class="grid gap-5" data-analytics-screen={entity.name}>
  <header class="grid gap-3">
    <h1 class="m-0 font-heading text-2xl font-semibold">{screen.title ?? `${formatEntityHeading(entity)} analytics`}</h1>
    <div class="flex flex-wrap items-center gap-3">
      <label class="grid gap-1 text-xs text-muted-foreground">
        Measure
        <Select
          class="min-w-48"
          value={String(routeState.measure)}
          items={screen.measures.map((measure, index) => ({
            value: String(index),
            label: measure.label ?? measure.field ?? measure.aggregate,
          }))}
          onValueChange={chooseMeasure}
        />
      </label>
      {#await import('@protoyard/analytics-ui/filters') then { BreakdownSelect }}
        <BreakdownSelect properties={dimensions} value={routeState.dimension} onchange={chooseDimension} />
      {:catch}
        <p role="alert">Breakdown controls could not be loaded.</p>
      {/await}
      {#await import('@protoyard/analytics-ui/date-range') then { DateRangePicker }}
        <DateRangePicker value={routeState.dateRange} now={clock.now.getTime()} onchange={chooseDateRange} />
      {:catch}
        <p role="alert">Date range controls could not be loaded.</p>
      {/await}
    </div>
  </header>

  {#if data.error}
    <div role="alert" class="rounded-lg border border-destructive/40 p-4 text-destructive">
      Analytics could not be loaded.
      <Button variant="outline" onclick={() => attempt++}>Retry</Button>
    </div>
  {:else if data.current === undefined}
    <p role="status" aria-live="polite" class="text-muted-foreground">Loading analytics…</p>
  {:else if data.current === null}
    <p role="status" class="rounded-lg border border-border p-4 text-muted-foreground">You do not have permission to view {entity.plural} analytics.</p>
  {:else}
    <section class="grid gap-3 rounded-xl border border-border bg-surface p-4" aria-label="Analytics chart">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-base font-semibold">{selectedMeasure.label ?? selectedMeasure.field ?? 'Records'}</h2>
        <p class="m-0 text-sm text-muted-foreground">
          Total: {selectedValueField?.kind === 'money'
            ? formatMoney(data.current.currentTotal, selectedValueField.currency, locale)
            : (data.current.currentTotal ?? '—')}
          {#if data.current.previousTotal !== null}
            <span> · previous: {selectedValueField?.kind === 'money'
              ? formatMoney(data.current.previousTotal, selectedValueField.currency, locale)
              : (data.current.previousTotal ?? '—')}</span>
          {/if}
        </p>
      </div>
      {#await import('@protoyard/charts-ui/cartesian') then { LineChart }}
        <LineChart title={selectedMeasure.label ?? selectedMeasure.field ?? 'Records'} description="Aggregated by the selected date range and dimension." series={chartSeries} showTable={true} unit={selectedValueField?.kind === 'money' ? 'cents' : 'number'} currency={selectedValueField?.kind === 'money' ? selectedValueField.currency : undefined} />
      {:catch}
        <p role="alert">Analytics chart could not be loaded.</p>
      {/await}
    </section>

    <section class="grid gap-3" aria-label="Analytics data">
      <div class="flex items-center justify-between gap-2">
        <h2 class="m-0 text-base font-semibold">Series data</h2>
        {#if canExport}
          <Button variant="outline" onclick={exportCsv}>Export CSV</Button>
        {/if}
      </div>
      <DataTable
        {columns}
        rows={tableRows}
        getRowId={(row) => `${row.bucket}:${row.dimension ?? 'all'}`}
        bind:sort
        pageSize={10}
        caption="Aggregated analytics series"
        emptyTitle="No data for this range"
        emptyDescription="Choose another date range or measure."
      />
    </section>
  {/if}
</section>
