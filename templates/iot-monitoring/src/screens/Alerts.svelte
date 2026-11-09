<script lang="ts">
import { can, liveQuery, runService } from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, ErrorState, Notice, Skeleton } from '@protoyard/ui';
import { Heading, Text } from 'texuli/typography';
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

<header class="mb-5"><Text size="sm" weight="medium" tone="primary">Response desk</Text><Heading level={1} size="xl">Alerts and incidents</Heading><Text size="sm" tone="muted" class="mt-1">Threshold alerts are generated from fictional device readings. Actions are local simulations.</Text></header>
{#if error}<Notice tone="error" text={error} class="mb-4" />{/if}
{#if alerts.loading || incidents.loading}<Skeleton class="h-80 w-full" />{:else if alerts.error || incidents.error}<ErrorState title="Could not load alerts" message={String(alerts.error ?? incidents.error)} />{:else}
  <div class="grid gap-5 lg:grid-cols-2">
    <section class="min-w-0 space-y-3" aria-labelledby="alerts-heading">
      <Heading level={2} size="md" id="alerts-heading">Threshold alerts</Heading>
      {#each alerts.current ?? [] as alert (alert.id)}
        {@const device = (devices.current ?? []).find((item) => item.id === alert.deviceId)}
        <Card class="space-y-3 p-4">
          <div class="flex flex-wrap items-start justify-between gap-2"><div><Text weight="semibold">{device?.name ?? 'Unknown device'}</Text><Text size="sm" tone="muted">{alert.message}</Text></div><Badge variant="secondary">{alert.severity} · {alert.status}</Badge></div>
          <Text size="xs" tone="muted">Detected {new Date(alert.createdAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</Text>
          {#if alert.status !== 'resolved'}
            <div class="flex flex-wrap gap-2">
              {#if alert.status === 'open' && canAcknowledge}<Button size="sm" loading={pending === alert.id} onclick={() => acknowledge(alert.id)}>Acknowledge</Button>{/if}
              {#if canResolve}<Button size="sm" variant="outline" loading={pending === alert.id} onclick={() => resolve(alert.id)}>Resolve alert</Button>{/if}
            </div>
          {/if}
        </Card>
      {:else}<EmptyState title="No threshold alerts" description="Current readings are within their device thresholds." />{/each}
    </section>
    <section class="min-w-0 space-y-3" aria-labelledby="incidents-heading">
      <Heading level={2} size="md" id="incidents-heading">Incidents</Heading>
      {#each (incidents.current ?? []).filter((item) => item.status !== 'resolved') as incident (incident.id)}
        {@const device = (devices.current ?? []).find((item) => item.id === incident.deviceId)}
        <Card class="space-y-2 p-4"><div class="flex items-center justify-between gap-2"><Heading level={3} size="sm">{incident.title}</Heading><Badge variant="secondary">{incident.status}</Badge></div><Text size="sm" tone="muted">{device?.name ?? 'Device'} · opened {new Date(incident.openedAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}</Text><Text size="xs" tone="muted">Updated {new Date(incident.updatedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</Text></Card>
      {:else}<EmptyState title="No active incidents" description="Incidents open when telemetry breaches a device threshold." />{/each}
    </section>
  </div>
{/if}
