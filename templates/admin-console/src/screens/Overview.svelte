<script lang="ts">
import { Building2, CircleDollarSign, OctagonPause, Users } from '@lucide/svelte';
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  StatCard,
} from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import { AUDIT_LABELS, type AuditType } from '../domain/services.ts';
import { useAdmin } from '../lib/context.ts';
import { fromNow, plural, usd } from '../lib/format.ts';
import { auditLog, tenantRows } from '../lib/queries.ts';

const { db, runtime } = useAdmin();
const clock = useClock();
const tenants = liveQuery(() => tenantRows(db), { initial: [] });
const recent = liveQuery(() => auditLog(db, 8), { initial: [] });

const live = $derived((tenants.current ?? []).filter((t) => t.status !== 'churned'));
const suspended = $derived(live.filter((t) => t.status === 'suspended').length);
const mrr = $derived(
  live.reduce((sum, t) => sum + (t.subscription?.status === 'canceled' ? 0 : t.mrrCents), 0)
);
const people = $derived(live.reduce((sum, t) => sum + t.people, 0));
const pastDue = $derived(live.filter((t) => t.subscription?.status === 'past_due').length);
const nameOf = (id: string | undefined) =>
  runtime.session.personas().find((p) => p.id === id)?.name ?? 'System';
</script>

<PageHeader title="Overview" description="Platform health at a glance. Numbers come from this prototype's simulated data." />

{#if tenants.error}
  <ErrorState title="Could not load tenants" message={String(tenants.error)} />
{:else}
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Live tenants" value={live.length} icon={Building2} hint={`${plural((tenants.current ?? []).length - live.length, 'churned tenant')}`} />
    <StatCard label="People" value={people} icon={Users} hint="Across live tenants" />
    <StatCard label="Monthly recurring revenue" value={usd(mrr)} icon={CircleDollarSign} hint={`${plural(pastDue, 'tenant')} past due`} />
    <StatCard label="Suspended" value={suspended} icon={OctagonPause} positive="down" hint="Blocked from the product" />
  </div>

  <Card class="mt-6">
    <CardHeader><CardTitle>Recent staff actions</CardTitle></CardHeader>
    <CardContent>
      {#if (recent.current ?? []).length === 0}
        <EmptyState size="sm" title="No staff actions yet" description="Suspensions, impersonations and billing changes show up here." />
      {:else}
        <ul class="divide-y divide-border">
          {#each recent.current ?? [] as event (event.id)}
            <li class="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
              <span class="min-w-0">
                <span class="font-medium">{AUDIT_LABELS[event.type as AuditType] ?? event.type}</span>
                <span class="text-muted-foreground">· {event.payload.message} · {nameOf(event.actorId)}</span>
              </span>
              <time class="text-xs text-muted-foreground" datetime={event.at}>{fromNow(event.at, clock.now)}</time>
            </li>
          {/each}
        </ul>
        <a class="mt-3 inline-block text-sm font-medium text-primary hover:underline" href="#/audit">Open the audit log</a>
      {/if}
    </CardContent>
  </Card>
{/if}
