<script lang="ts">
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import type { MapMarker } from '@protoyard/views-ui/map';
import { onMount } from 'svelte';
import { Heading, Text } from 'texuli/typography';
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
    <Text size="sm" weight="medium" tone="primary">Harbor Bay · fictional sensor region</Text>
    <Heading level={1} size="xl">Device monitoring</Heading>
    <Text size="sm" tone="muted" class="mt-1">Readings and incidents follow simulated time. No devices or network are contacted.</Text>
  </div>
  <Badge variant="outline">{devices.current?.length ?? 0} devices · {openAlerts} open alerts</Badge>
</header>
<Text size="xs" tone="muted" class="mb-4">Simulated time · {clock.now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</Text>

{#if devices.loading}
  <Skeleton class="h-96 w-full" />
{:else if devices.error || alerts.error || incidents.error}
  <ErrorState title="Could not load monitoring data" message={String(devices.error ?? alerts.error ?? incidents.error)} />
{:else if !(devices.current?.length)}
  <EmptyState title="No devices in this scenario" description="Load a monitoring scenario in DevTools to seed a fictional field network." />
{:else}
  <div class="grid gap-4 xl:grid-cols-5">
    <Card class="min-w-0 overflow-hidden p-3 sm:p-4 xl:col-span-3">
      {#if MapView}<MapView {markers} label="Harbor Bay device map" listLabel="Field monitoring devices" />{:else}<Skeleton class="h-96 w-full" />{/if}
    </Card>
    <section class="min-w-0 space-y-3 xl:col-span-2" aria-labelledby="device-list-title">
      <div class="flex items-center justify-between"><Heading level={2} size="md" id="device-list-title">Field devices</Heading><Text as="span" size="sm" tone="muted">{incidents.current?.length ?? 0} active incidents</Text></div>
      <div class="max-h-96 space-y-2 overflow-auto">
        {#each devices.current ?? [] as device (device.id)}
          <Button variant={selectedDeviceId === device.id ? 'secondary' : 'outline'} class="flex h-auto min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left whitespace-normal" aria-pressed={selectedDeviceId === device.id} onclick={() => { selectedDeviceId = device.id; }}>
            <span class="min-w-0"><Text as="span" weight="medium" truncate class="block">{device.name}</Text><Text as="span" size="xs" tone="muted">{device.kind} · {device.status}</Text></span>
            <Text as="span" size="sm" tabular class="shrink-0">{(telemetry.current ?? []).find((row) => row.deviceId === device.id)?.value?.toFixed(1) ?? '—'} {device.unit}</Text>
          </Button>
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
