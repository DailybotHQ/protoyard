<script lang="ts">
import { can, liveQuery, runService } from '@protoyard/renderer-svelte';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import { CAPABILITIES } from '../domain/policy.ts';
import { useMonitoring } from '../lib/context.svelte.ts';

const { db, services } = useMonitoring();
const alerts = liveQuery(() => db.alerts.orderBy('createdAt').reverse().toArray(), { initial: [] });
const incidents = liveQuery(() => db.incidents.orderBy('updatedAt').reverse().toArray(), {
  initial: [],
});
const devices = liveQuery(() => db.devices.toArray(), { initial: [] });
let error = $state('');
let pending = $state<string | null>(null);
const canAcknowledge = $derived(can(CAPABILITIES.acknowledge));
const canResolve = $derived(can(CAPABILITIES.resolve));
async function acknowledge(alertId: string) {
  error = '';
  pending = alertId;
  const result = await runService(() => services.acknowledgeAlert({ alertId }), {
    success: 'Alert acknowledged',
  });
  pending = null;
  if (!result.ok)
    error =
      result.error instanceof Error ? result.error.message : 'Could not acknowledge this alert.';
}
async function resolve(alertId: string) {
  error = '';
  pending = alertId;
  const result = await runService(() => services.resolveAlert({ alertId }), {
    success: 'Alert resolved',
  });
  pending = null;
  if (!result.ok)
    error = result.error instanceof Error ? result.error.message : 'Could not resolve this alert.';
}
</script>

<header class="mb-5"><p class="text-sm font-medium text-primary">Response desk</p><h1 class="text-2xl font-semibold tracking-tight">Alerts and incidents</h1><p class="mt-1 text-sm text-muted-foreground">Threshold alerts are generated from fictional device readings. Actions are local simulations.</p></header>
{#if error}<p class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>{/if}
{#if alerts.loading || incidents.loading}<Skeleton class="h-80 w-full" />{:else if alerts.error || incidents.error}<ErrorState title="Could not load alerts" message={String(alerts.error ?? incidents.error)} />{:else}
  <div class="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
    <section class="space-y-3" aria-labelledby="alerts-heading">
      <h2 id="alerts-heading" class="text-lg font-semibold">Threshold alerts</h2>
      {#each alerts.current ?? [] as alert (alert.id)}
        {@const device = (devices.current ?? []).find((item) => item.id === alert.deviceId)}
        <Card class="space-y-3 p-4">
          <div class="flex flex-wrap items-start justify-between gap-2"><div><p class="font-semibold">{device?.name ?? 'Unknown device'}</p><p class="text-sm text-muted-foreground">{alert.message}</p></div><span class="rounded-full bg-muted px-2 py-1 text-xs">{alert.severity} · {alert.status}</span></div>
          <p class="text-xs text-muted-foreground">Detected {new Date(alert.createdAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</p>
          {#if alert.status !== 'resolved'}
            <div class="flex flex-wrap gap-2">
              {#if alert.status === 'open' && canAcknowledge}<Button size="sm" loading={pending === alert.id} onclick={() => acknowledge(alert.id)}>Acknowledge</Button>{/if}
              {#if canResolve}<Button size="sm" variant="outline" loading={pending === alert.id} onclick={() => resolve(alert.id)}>Resolve alert</Button>{/if}
            </div>
          {/if}
        </Card>
      {:else}<EmptyState title="No threshold alerts" description="Current readings are within their device thresholds." />{/each}
    </section>
    <section class="space-y-3" aria-labelledby="incidents-heading">
      <h2 id="incidents-heading" class="text-lg font-semibold">Incidents</h2>
      {#each (incidents.current ?? []).filter((item) => item.status !== 'resolved') as incident (incident.id)}
        {@const device = (devices.current ?? []).find((item) => item.id === incident.deviceId)}
        <Card class="space-y-2 p-4"><div class="flex items-center justify-between gap-2"><h3 class="font-semibold">{incident.title}</h3><span class="rounded-full bg-muted px-2 py-1 text-xs">{incident.status}</span></div><p class="text-sm text-muted-foreground">{device?.name ?? 'Device'} · opened {new Date(incident.openedAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}</p><p class="text-xs text-muted-foreground">Updated {new Date(incident.updatedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</p></Card>
      {:else}<EmptyState title="No active incidents" description="Incidents open when telemetry breaches a device threshold." />{/each}
    </section>
  </div>
{/if}
