<script lang="ts">
import { KpiRow, KpiTile } from '@protoyard/analytics-ui';
import {
  DateRangePicker,
  type DateRangeValue,
  DEFAULT_DATE_RANGE,
} from '@protoyard/analytics-ui/date-range';
import { DashboardGrid, type DashboardLayout, WidgetCard } from '@protoyard/analytics-ui/grid';
import type { Row } from '@protoyard/core';
import { useBlueprintApp } from '@protoyard/crud/app';
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Button, ErrorState, Input, Label, LoadingState } from '@protoyard/ui';
import { untrack } from 'svelte';
import { createBusinessAdapter } from './adapter.ts';
import { dashboardNumbers } from './metrics.ts';

/**
 * The analytics archetype's dashboard: a date range with comparison, KPI
 * tiles, events by type and the metrics list, on the analytics-ui kit. Events
 * and metrics are the blueprint's own simulated rows; recording a metric goes
 * through its entity service, so it persists like any other record.
 */
const app = useBlueprintApp();
const fields = untrack(() => {
  const adapter = createBusinessAdapter(app.blueprint);
  if (!adapter.analytics) throw new Error('The analytics dashboard needs an analytics archetype.');
  return adapter.analytics;
});
const events = app.services[fields.eventEntity];
const metrics = app.services[fields.metricEntity];
const clock = useClock(app.runtime);

const eventRows = liveQuery<Row[]>(() => events?.list() ?? Promise.resolve([]), { initial: [] });
const metricRows = liveQuery<Row[]>(() => metrics?.list() ?? Promise.resolve([]), { initial: [] });

let range = $state<DateRangeValue>(DEFAULT_DATE_RANGE);
let layout = $state<DashboardLayout>([
  { id: 'by-type', widget: 'by-type', title: 'Events by type', x: 0, y: 0, w: 6, h: 4 },
  { id: 'metrics', widget: 'metrics', title: 'Metrics', x: 6, y: 0, w: 6, h: 4 },
]);
let editing = $state(false);
let metricName = $state('');
// A number input binds a number (or null when empty).
let metricValue = $state<number | string | null>(null);
let metricError = $state<string | null>(null);

const numbers = $derived(
  dashboardNumbers(eventRows.current ?? [], fields, range, clock.now.getTime())
);
const maxType = $derived(Math.max(1, ...numbers.byType.map((entry) => entry.count)));

async function recordMetric(): Promise<void> {
  if (!metrics) return;
  metricError = null;
  const name = metricName.trim();
  const raw = metricValue === null ? '' : String(metricValue).trim();
  const value = Number(raw);
  if (!name) {
    metricError = 'Name the metric.';
    return;
  }
  try {
    await metrics.create({
      [fields.metricNameField]: name,
      ...(fields.metricValueField && raw !== '' && Number.isFinite(value)
        ? { [fields.metricValueField]: value }
        : {}),
    });
    metricName = '';
    metricValue = null;
  } catch (error) {
    metricError = error instanceof Error ? error.message : String(error);
  }
}

const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');
</script>

<section class="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="player-analytics-archetype">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Analytics · Simulated data</p>
      <h1 class="text-2xl font-semibold">{app.blueprint.name}</h1>
    </div>
    <div class="flex items-center gap-2">
      <DateRangePicker value={range} now={clock.now} onchange={(next) => (range = next)} />
      <Button variant="outline" size="sm" aria-pressed={editing} onclick={() => (editing = !editing)}>
        {editing ? 'Done' : 'Edit layout'}
      </Button>
    </div>
  </div>

  {#if eventRows.error}
    <ErrorState title="The events could not be loaded" message="The simulated event data is unavailable." />
  {:else if eventRows.loading}
    <LoadingState label="Loading events" class="py-16" />
  {:else}
    <KpiRow label="Key numbers">
      <KpiTile label="Events" value={numbers.events.current} previous={numbers.events.previous ?? undefined} />
      {#each numbers.byType.slice(0, 2) as entry (entry.type)}
        <KpiTile label={label(entry.type)} value={entry.count} previous={entry.previous ?? undefined} />
      {/each}
      {#if numbers.value}
        <KpiTile
          label={fields.valueLabel}
          value={numbers.value.current}
          unit={fields.valueUnit}
          previous={numbers.value.previous ?? undefined}
        />
      {/if}
    </KpiRow>

    <DashboardGrid {layout} {editing} label="Analytics dashboard" onchange={(next) => (layout = next)}>
      {#snippet widget(item)}
        {#if item.widget === 'by-type'}
          <WidgetCard title="Events by type" empty={numbers.byType.length === 0}>
            <ul class="space-y-2 text-sm" aria-label="Events by type">
              {#each numbers.byType as entry (entry.type)}
                <li class="grid grid-cols-[8rem_1fr_3rem] items-center gap-2">
                  <span>{label(entry.type)}</span>
                  <span class="h-2 rounded bg-muted" aria-hidden="true">
                    <span class="block h-2 rounded bg-primary" style:width={`${(entry.count / maxType) * 100}%`}></span>
                  </span>
                  <span class="text-right tabular-nums">{entry.count}</span>
                </li>
              {/each}
            </ul>
          </WidgetCard>
        {:else}
          <WidgetCard title="Metrics" loading={metricRows.loading}>
            <ul class="mb-3 max-h-40 space-y-1 overflow-auto text-sm" aria-label="Metrics">
              {#each metricRows.current ?? [] as row (row.id)}
                <li class="flex justify-between gap-2">
                  <span>{String(row[fields.metricNameField] ?? '')}</span>
                  {#if fields.metricValueField}
                    <span class="tabular-nums text-muted-foreground">{String(row[fields.metricValueField] ?? '—')}</span>
                  {/if}
                </li>
              {/each}
            </ul>
            <form class="grid gap-2 sm:grid-cols-[1fr_6rem_auto] sm:items-end" onsubmit={(event) => event.preventDefault()}>
              <div>
                <Label for="py-metric-name">Metric name</Label>
                <Input id="py-metric-name" bind:value={metricName} maxlength={200} />
              </div>
              {#if fields.metricValueField}
                <div>
                  <Label for="py-metric-value">Metric value</Label>
                  <Input id="py-metric-value" type="number" bind:value={metricValue} />
                </div>
              {/if}
              <Button type="submit" onclick={recordMetric}>Record metric</Button>
            </form>
            {#if metricError}
              <p class="mt-2 text-sm text-destructive" role="alert">{metricError}</p>
            {/if}
          </WidgetCard>
        {/if}
      {/snippet}
    </DashboardGrid>
  {/if}
</section>
