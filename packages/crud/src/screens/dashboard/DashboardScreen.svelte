<script lang="ts">
import { KpiTile } from '@protoyard/analytics-ui';
import type { Blueprint, EntityServices } from '@protoyard/blueprint';
import { dashboardWidgets, inputProperty } from '@protoyard/blueprint';
import { PermissionDeniedError, type PrototypeRuntime, type Row } from '@protoyard/core';
import { liveQuery, navigate, useClock, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Select } from '@protoyard/ui';
import { formatEntityHeading } from '../../format.ts';
import {
  aggregateWidget,
  type DashboardScreenSpec,
  type DashboardWidget,
  dashboardPeriods,
  groupLabel,
  listRows,
  rowsInPeriod,
} from './model.ts';

let {
  runtime,
  blueprint,
  services,
  screen,
  title,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  services: EntityServices;
  screen: DashboardScreenSpec;
  title?: string;
} = $props();

// svelte-ignore state_referenced_locally
const widgets = dashboardWidgets(screen);
// svelte-ignore state_referenced_locally
const principal = usePrincipal(runtime);
// svelte-ignore state_referenced_locally
const clock = useClock(runtime);
let periodDays = $state<7 | 30 | 90>(30);
let attempt = $state(0);
const entities = $derived(
  [...new Set(widgets.map((widget) => widget.entity))].flatMap((name) => {
    const entity = blueprint.entities.find((candidate) => candidate.name === name);
    const service = services[name];
    return entity && service ? [{ name, entity, service }] : [];
  })
);
const records = liveQuery(
  async () => {
    const result: Record<string, Row[] | null> = {};
    for (const { name, service } of entities) {
      try {
        result[name] = await service.list();
      } catch (error) {
        if (error instanceof PermissionDeniedError) result[name] = null;
        else throw error;
      }
    }
    return result;
  },
  {
    initial: undefined,
    deps: () => [attempt, principal.current?.persona.id, periodDays, clock.now.getTime()],
  }
);

const periods = $derived(dashboardPeriods(periodDays, clock.now));
const titleText = $derived(title ?? screen.title ?? 'Dashboard');
const boards = $derived(
  new Map(
    blueprint.screens.filter((item) => item.type === 'board').map((item) => [item.entity, item])
  )
);

function entityFor(widget: DashboardWidget) {
  return blueprint.entities.find((entity) => entity.name === widget.entity);
}

function rowsFor(widget: DashboardWidget): Row[] | null | undefined {
  return records.current?.[widget.entity];
}

function valueFor(widget: DashboardWidget, previous = false) {
  const entity = entityFor(widget);
  const rows = rowsFor(widget);
  if (!entity || !rows) return null;
  const range = previous ? periods.previous : periods.current;
  const bucket = widget.kind === 'chart' ? widget.bucket : undefined;
  const inPeriod = rowsInPeriod(rows, bucket?.field ?? 'createdAt', range, entity);
  return aggregateWidget(inPeriod, widget as Exclude<DashboardWidget, { kind: 'list' }>, entity, {
    ...(bucket ? { bucket } : {}),
    ...(bucket ? { range: { from: new Date(range.start), to: new Date(range.end - 1) } } : {}),
  });
}

function numberValue(
  widget: Exclude<DashboardWidget, { kind: 'list' }>,
  previous = false
): number | null {
  return valueFor(widget, previous)?.total.value ?? null;
}

function trendFor(widget: Extract<DashboardWidget, { kind: 'kpi' }>): number[] {
  const entity = entityFor(widget);
  const rows = rowsFor(widget);
  if (!entity || !rows) return [];
  const range = periods.current;
  const result = aggregateWidget(rowsInPeriod(rows, 'createdAt', range, entity), widget, entity, {
    bucket: { field: 'createdAt', unit: 'day' },
    range: { from: new Date(range.start), to: new Date(range.end - 1) },
  });
  return result.series.map((cell) => cell.value ?? 0);
}

function widgetClass(widget: DashboardWidget): string {
  if (widget.span === 2) return 'sm:col-span-2';
  if (widget.span === 3) return 'sm:col-span-2 xl:col-span-3';
  if (widget.span === 4) return 'sm:col-span-2 xl:col-span-4';
  return '';
}

function unitFor(widget: Exclude<DashboardWidget, { kind: 'list' }>) {
  const entity = entityFor(widget);
  const field =
    widget.kind !== 'board-summary' && widget.field
      ? entity?.fields.find((candidate) => candidate.name === widget.field)
      : undefined;
  return field?.kind === 'money' ? ('cents' as const) : ('number' as const);
}

function chartSeries(widget: Extract<DashboardWidget, { kind: 'chart' }>) {
  const result = valueFor(widget);
  const entity = entityFor(widget);
  if (!result || !entity) return [];
  const groups = result.groups.length ? result.groups : [null];
  return groups.map((group, index) => ({
    id: group ?? 'total',
    label: group === null ? widget.label : groupLabel(entity, widget.groupBy ?? '', group),
    points: result.buckets.map((bucket) => {
      const cell = result.series.find((item) => item.bucket === bucket && item.group === group);
      return { x: Date.parse(bucket), y: cell?.value ?? 0 };
    }),
    color: `var(--tx-chart-${(index % 6) + 1})`,
  }));
}

function chartSlices(widget: Extract<DashboardWidget, { kind: 'chart' }>) {
  const result = valueFor(widget);
  const entity = entityFor(widget);
  if (!result || !entity) return [];
  return result.groups.map((group, index) => ({
    id: group,
    label: groupLabel(entity, widget.groupBy ?? '', group),
    value: result.series.find((item) => item.group === group)?.value ?? 0,
    color: `var(--tx-chart-${(index % 6) + 1})`,
  }));
}

function open(widget: DashboardWidget, row: Row) {
  const entity = entityFor(widget);
  if (entity) navigate(`/${entity.plural}/${encodeURIComponent(String(row.id))}`);
}

function openBoard(widget: Extract<DashboardWidget, { kind: 'board-summary' }>, value: string) {
  const entity = entityFor(widget);
  if (!entity) return;
  const board = boards.get(entity.name);
  if (board) {
    navigate(`/${entity.plural}/board`);
    return;
  }
  navigate(`/${entity.plural}`);
  void value;
}

function listLabel(row: Row, widget: Extract<DashboardWidget, { kind: 'list' }>) {
  const entity = entityFor(widget);
  const titleField = entity?.fields.find((field) => field.name === entity.titleField);
  return String(
    row[titleField ? inputProperty(titleField) : (entity?.titleField ?? 'id')] ?? 'Untitled'
  );
}
</script>

<section class="grid gap-5" data-dashboard-screen>
  <header class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="m-0 font-heading text-2xl font-semibold">{titleText}</h1>
    <label class="flex items-center gap-2 text-sm text-muted-foreground">
      Period
      <Select
        class="w-40"
        value={String(periodDays)}
        items={[
          { value: '7', label: 'Last 7 days' },
          { value: '30', label: 'Last 30 days' },
          { value: '90', label: 'Last 90 days' },
        ]}
        onValueChange={(value) => {
          if (value === '7' || value === '30' || value === '90') periodDays = Number(value) as 7 | 30 | 90;
        }}
      />
    </label>
  </header>

  {#if records.error}
    <div role="alert" class="rounded-lg border border-destructive/40 p-4 text-destructive">
      Dashboard data could not be loaded.
      <Button variant="outline" onclick={() => attempt++}>Retry</Button>
    </div>
  {:else if records.current === undefined}
    <p role="status" aria-live="polite" class="text-muted-foreground">Loading dashboard…</p>
  {:else if widgets.length === 0}
    <p class="rounded-lg border border-border p-5 text-muted-foreground">No dashboard widgets are configured yet.</p>
  {:else}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {#each widgets as widget, index (`${widget.kind}-${widget.entity}-${widget.label}-${index}`)}
        {@const entity = entityFor(widget)}
        {@const rows = rowsFor(widget)}
        <article class={`min-w-0 rounded-xl border border-border bg-surface p-4 text-surface-foreground ${widgetClass(widget)}`} data-dashboard-widget={widget.kind}>
          <h2 class="mb-3 text-sm font-semibold">{widget.label}</h2>
          {#if !entity}
            <p class="text-sm text-destructive">Unknown entity: {widget.entity}</p>
          {:else if rows === null}
            <p class="text-sm text-muted-foreground" role="status">You do not have permission to view {formatEntityHeading(entity).toLowerCase()} data.</p>
          {:else if widget.kind === 'kpi'}
            <KpiTile label={widget.label} value={numberValue(widget)} previous={numberValue(widget, true)} unit={unitFor(widget)} comparisonLabel={`vs previous ${periodDays} days`} trend={trendFor(widget)} trendPeriod={`${periodDays} days`} empty={rows?.length === 0} />
          {:else if widget.kind === 'chart'}
            {#if widget.chart === 'donut'}
              {#await import('@protoyard/charts-ui/part-whole') then { DonutChart }}
              <DonutChart title={widget.label} data={chartSlices(widget)} unit={unitFor(widget)} />
              {:catch}
                <p role="alert">Chart could not be loaded.</p>
              {/await}
            {:else}
              {#await import('@protoyard/charts-ui/cartesian') then { LineChart, AreaChart, BarChart }}
                {#if widget.chart === 'line'}
                  <LineChart title={widget.label} series={chartSeries(widget)} showTable={true} unit={unitFor(widget)} />
                {:else if widget.chart === 'area'}
                  <AreaChart title={widget.label} series={chartSeries(widget)} showTable={true} unit={unitFor(widget)} />
                {:else}
                  <BarChart title={widget.label} series={chartSeries(widget)} showTable={true} unit={unitFor(widget)} />
                {/if}
              {:catch}
                <p role="alert">Chart could not be loaded.</p>
              {/await}
            {/if}
          {:else if widget.kind === 'list'}
            {@const list = listRows(rows ?? [], widget, entity)}
            {#if list.length === 0}
              <p class="text-sm text-muted-foreground">No matching records yet.</p>
            {:else}
              <ul class="m-0 grid list-none gap-2 p-0">
                {#each list as row (String(row.id))}
                  <li><Button variant="link" class="h-auto min-h-0 px-0 py-0 text-left" onclick={() => open(widget, row)}>{listLabel(row, widget)}</Button></li>
                {/each}
              </ul>
            {/if}
          {:else}
            {@const result = valueFor(widget)}
            {#if (result?.groups.length ?? 0) === 0}
              <p class="text-sm text-muted-foreground">No matching records yet.</p>
            {:else}
              <ul class="m-0 grid list-none gap-2 p-0">
                {#each result?.groups ?? [] as value (value)}
                  {@const count = result?.series.find((item) => item.group === value)?.value ?? 0}
                  <li><Button variant="ghost" class="flex h-auto min-h-0 w-full justify-between gap-2 px-0 py-0 text-left" onclick={() => openBoard(widget, value)}><span>{groupLabel(entity, widget.groupBy, value)}</span><span class="tabular-nums">{count}</span></Button></li>
                {/each}
              </ul>
            {/if}
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>
