<script lang="ts">
import { Truck } from '@lucide/svelte';
import { can, liveQuery, runService, useClock } from '@protoyard/renderer-svelte';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import { etaSeconds, pointAlong, routeLength } from '@protoyard/views/map';
import type { MapMarker, MapRoute } from '@protoyard/views-ui/map';
import { onMount } from 'svelte';
import { CAPABILITIES } from '../domain/policy.ts';
import { useLogistics } from '../lib/context.svelte.ts';

const { db, services } = useLogistics();
const clock = useClock();
const depots = liveQuery(() => db.depots.toArray(), { initial: [] });
const vehicles = liveQuery(() => db.vehicles.toArray(), { initial: [] });
const shipments = liveQuery(() => db.shipments.orderBy('reference').toArray(), { initial: [] });
let error = $state('');
type SimulatedMapComponent = typeof import('@protoyard/views-ui/map').SimulatedMap;
let MapView = $state<SimulatedMapComponent | null>(null);
let reassignment = $state<Record<string, string>>({});
const canDispatch = $derived(can(CAPABILITIES.manage));
const active = $derived((shipments.current ?? []).filter((s) => s.status !== 'delivered'));

function progress(shipment: (typeof active)[number]) {
  if (shipment.status !== 'in-transit' || !shipment.dispatchedAt) return 0;
  const elapsed = Math.max(0, clock.now.getTime() - Date.parse(shipment.dispatchedAt));
  const routeMeters = routeLength(shipment.route);
  return Math.max(0, Math.min(1, (elapsed * (32 / 3.6)) / Math.max(1, routeMeters)));
}
const markers = $derived.by(() => {
  const depotMarkers: MapMarker[] = (depots.current ?? []).map((depot) => ({
    id: depot.id,
    label: depot.name,
    detail: `Depot · capacity ${depot.capacity}`,
    lat: depot.point.lat,
    lng: depot.point.lng,
    tone: 'primary',
    shape: 'square',
    glyph: 'D',
  }));
  const shipmentMarkers: MapMarker[] = active.flatMap((shipment): MapMarker[] => {
    const p = progress(shipment);
    const point =
      shipment.status === 'in-transit'
        ? pointAlong(shipment.route, routeLength(shipment.route) * p)
        : (shipment.route[0] ?? shipment.destination);
    const vehicle = vehicles.current?.find((item) => item.id === shipment.vehicleId);
    return [
      {
        id: `vehicle-${shipment.id}`,
        label: vehicle?.name ?? shipment.reference,
        detail: `Delivering ${shipment.reference} · ${shipment.status}`,
        lat: point.lat,
        lng: point.lng,
        tone: shipment.status === 'in-transit' ? 'success' : 'warning',
        shape: 'triangle',
        glyph: 'V',
      },
      {
        id: `destination-${shipment.id}`,
        label: `${shipment.reference} destination`,
        detail: shipment.description,
        lat: shipment.destination.lat,
        lng: shipment.destination.lng,
        tone: 'neutral',
        shape: 'diamond',
        glyph: 'D',
      },
    ];
  });
  return [...depotMarkers, ...shipmentMarkers];
});
const routes = $derived(
  active
    .filter((s) => s.status === 'in-transit')
    .map(
      (s): MapRoute => ({
        id: s.id,
        label: `${s.reference} route`,
        stops: s.route,
        progress: progress(s),
        tone: 'success',
      })
    )
);

onMount(() => {
  void import('@protoyard/views-ui/map').then((module) => {
    MapView = module.SimulatedMap;
  });
});

async function dispatch(shipmentId: string) {
  error = '';
  const shipment = shipments.current?.find((s) => s.id === shipmentId);
  const vehicle = vehicles.current?.find((v) => v.depotId === shipment?.depotId);
  if (!vehicle) {
    error = 'No vehicle is available at this depot.';
    return;
  }
  const result = await runService(() => services.dispatch({ shipmentId, vehicleId: vehicle.id }), {
    success: `Dispatched ${shipment?.reference ?? 'shipment'}`,
  });
  if (!result.ok)
    error =
      result.error instanceof Error
        ? result.error.message
        : 'Dispatch failed. Check the simulated network and try again.';
}
async function reassign(shipmentId: string) {
  error = '';
  const vehicleId = reassignment[shipmentId];
  if (!vehicleId) {
    error = 'Choose a replacement vehicle first.';
    return;
  }
  const result = await runService(() => services.reassign(shipmentId, vehicleId), {
    success: 'Shipment reassigned',
  });
  if (!result.ok)
    error =
      result.error instanceof Error
        ? result.error.message
        : 'Reassignment failed. Check the simulated network and try again.';
}
</script>

<header class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div><p class="text-sm font-medium text-primary">Harbor Bay · fictional region</p><h1 class="text-2xl font-semibold tracking-tight">Live dispatch</h1><p class="mt-1 text-sm text-muted-foreground">Vehicle positions and ETAs move with simulated time. No real map tiles or network.</p></div>
  <span class="rounded-full border border-border px-3 py-1 text-sm">{active.filter((s) => s.status === 'in-transit').length} in transit</span>
</header>

{#if error}<div class="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>{/if}
{#if depots.loading || shipments.loading}
  <Skeleton class="h-[25rem] w-full rounded-xl" />
{:else if depots.error || shipments.error}
  <ErrorState title="Could not load dispatch data" message={String(depots.error ?? shipments.error)} />
{:else if !depots.current?.length}
  <EmptyState icon={Truck} title="No depots available" description="Add depot seed data to this scenario to start routing shipments." />
{:else}
  <div class="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
    <Card class="min-w-0 overflow-hidden p-3 sm:p-4">
      {#if MapView}<MapView {markers} {routes} label="Harbor Bay shipment map" listLabel="Depots and active shipments" />{:else}<Skeleton class="h-[24rem] w-full" />{/if}
    </Card>
    <section aria-labelledby="shipments-heading" class="space-y-3">
      <div class="flex items-center justify-between"><h2 id="shipments-heading" class="text-lg font-semibold">Shipments</h2><span class="text-sm text-muted-foreground">{active.length} active</span></div>
      {#each active as shipment (shipment.id)}
        {@const vehicle = vehicles.current?.find((v) => v.id === shipment.vehicleId)}
        {@const eta = shipment.status === 'in-transit' ? etaSeconds(routeLength(shipment.route) * (1 - progress(shipment)), 32) : null}
        <Card class="space-y-3 p-4">
          <div class="flex justify-between gap-3"><div><p class="font-semibold">{shipment.reference}</p><p class="text-sm text-muted-foreground">{shipment.description}</p></div><span class="h-fit rounded-full bg-muted px-2 py-1 text-xs">{shipment.status === 'ready' ? 'Ready' : 'In transit'}</span></div>
          <p class="text-xs text-muted-foreground">{vehicle?.name ?? 'Vehicle unassigned'} · ETA {eta === null ? 'Awaiting dispatch' : `${Math.ceil(eta / 60)} min`}</p>
          {#if canDispatch && shipment.status === 'ready'}<Button size="sm" onclick={() => dispatch(shipment.id)}>Dispatch shipment</Button>{/if}
          {#if canDispatch && shipment.status === 'in-transit'}
            <div class="flex flex-wrap items-center gap-2">
              <label class="sr-only" for={`vehicle-${shipment.id}`}>Replacement vehicle for {shipment.reference}</label>
              <select id={`vehicle-${shipment.id}`} class="min-h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={reassignment[shipment.id]}>
                <option value="">Reassign vehicle…</option>
                {#each (vehicles.current ?? []).filter((candidate) => candidate.depotId === shipment.depotId && candidate.id !== shipment.vehicleId) as candidate (candidate.id)}<option value={candidate.id}>{candidate.name}</option>{/each}
              </select>
              <Button size="sm" variant="outline" onclick={() => reassign(shipment.id)}>Reassign</Button>
            </div>
          {/if}
        </Card>
      {:else}
        <EmptyState title="No shipments in this scenario" description="Switch to Active dispatch in DevTools to load a sample route." />
      {/each}
    </section>
  </div>
{/if}
