<script lang="ts">
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Card, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import type { MapMarker } from '@protoyard/views-ui/map';
import { onMount } from 'svelte';
import { useMonitoring } from '../lib/context.svelte.ts';

const { db } = useMonitoring();
const clock = useClock();
const devices = liveQuery(() => db.devices.orderBy('name').toArray(), { initial: [] });
const alerts = liveQuery(() => db.alerts.where('status').equals('open').toArray(), { initial: [] });
const incidents = liveQuery(() => db.incidents.where('status').notEqual('resolved').toArray(), {
  initial: [],
});
let selectedDeviceId = $state('device_0001');
const telemetry = liveQuery(
  () => db.telemetry.where('deviceId').equals(selectedDeviceId).sortBy('at'),
  { initial: [], deps: () => [selectedDeviceId] }
);
type MapComponent = typeof import('@protoyard/views-ui/map').SimulatedMap;
type ChartComponent = typeof import('@protoyard/charts-ui/cartesian').LineChart;
let MapView = $state<MapComponent | null>(null);
let LineChart = $state<ChartComponent | null>(null);
onMount(() => {
  void import('@protoyard/views-ui/map').then((module) => {
    MapView = module.SimulatedMap;
  });
  void import('@protoyard/charts-ui/cartesian').then((module) => {
    LineChart = module.LineChart;
  });
});
const selected = $derived((devices.current ?? []).find((device) => device.id === selectedDeviceId));
const markers = $derived(
  (devices.current ?? []).map(
    (device): MapMarker => ({
      id: device.id,
      label: device.name,
      detail: `${device.kind} sensor · ${device.status}`,
      lat: device.point.lat,
      lng: device.point.lng,
      tone:
        device.status === 'offline'
          ? 'danger'
          : device.status === 'maintenance'
            ? 'warning'
            : 'success',
      shape:
        device.kind === 'temperature'
          ? 'circle'
          : device.kind === 'pressure'
            ? 'square'
            : 'triangle',
      glyph: device.kind === 'temperature' ? 'T' : device.kind === 'pressure' ? 'P' : 'V',
    })
  )
);
const series = $derived(
  selected
    ? [
        {
          id: selected.id,
          label: `${selected.name} (${selected.unit})`,
          points: (telemetry.current ?? []).map((sample) => ({
            x: Date.parse(sample.at),
            y: sample.value,
          })),
        },
      ]
    : []
);
const openAlerts = $derived(alerts.current?.length ?? 0);
</script>

<header class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <p class="text-sm font-medium text-primary">Harbor Bay · fictional sensor region</p>
    <h1 class="text-2xl font-semibold tracking-tight">Device monitoring</h1>
    <p class="mt-1 text-sm text-muted-foreground">Readings and incidents follow simulated time. No devices or network are contacted.</p>
  </div>
  <p class="rounded-full border border-border px-3 py-1 text-sm">{devices.current?.length ?? 0} devices · {openAlerts} open alerts</p>
</header>
<p class="mb-4 text-xs text-muted-foreground">Simulated time · {clock.now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</p>

{#if devices.loading}
  <Skeleton class="h-96 w-full rounded-xl" />
{:else if devices.error || alerts.error || incidents.error}
  <ErrorState title="Could not load monitoring data" message={String(devices.error ?? alerts.error ?? incidents.error)} />
{:else if !(devices.current?.length)}
  <EmptyState title="No devices in this scenario" description="Load a monitoring scenario in DevTools to seed a fictional field network." />
{:else}
  <div class="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.8fr)]">
    <Card class="min-w-0 overflow-hidden p-3 sm:p-4">
      {#if MapView}<MapView {markers} label="Harbor Bay device map" listLabel="Field monitoring devices" />{:else}<Skeleton class="h-[24rem] w-full" />{/if}
    </Card>
    <section class="space-y-3" aria-labelledby="device-list-title">
      <div class="flex items-center justify-between"><h2 id="device-list-title" class="text-lg font-semibold">Field devices</h2><span class="text-sm text-muted-foreground">{incidents.current?.length ?? 0} active incidents</span></div>
      <div class="max-h-[24rem] space-y-2 overflow-auto">
        {#each devices.current ?? [] as device (device.id)}
          <button class="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-pressed={selectedDeviceId === device.id} onclick={() => { selectedDeviceId = device.id; }}>
            <span class="min-w-0"><span class="block truncate font-medium">{device.name}</span><span class="text-xs text-muted-foreground">{device.kind} · {device.status}</span></span>
            <span class="shrink-0 text-sm tabular-nums">{(telemetry.current ?? []).find((row) => row.deviceId === device.id)?.value?.toFixed(1) ?? '—'} {device.unit}</span>
          </button>
        {/each}
      </div>
    </section>
  </div>
  <Card class="mt-4 min-w-0 p-3 sm:p-5">
    {#if selected && LineChart}
      <LineChart title={`${selected.name} telemetry`} description={`Threshold ${selected.threshold} ${selected.unit}; daily samples from this scenario.`} {series} xKind="time" height={260} emptyMessage="No telemetry in this scenario." />
    {:else if selected}<Skeleton class="h-64 w-full" />{:else}<EmptyState title="Select a device" description="Choose a device to inspect its telemetry history." />{/if}
  </Card>
{/if}
