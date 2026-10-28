<script lang="ts">
import { BellOff, BellPlus, BellRing, Flag, Trash2 } from '@lucide/svelte';
import { Sparkline } from '@protoyard/charts-ui/compact';
import { can, liveQuery, runService, useClock, usePrincipal } from '@protoyard/renderer-svelte';
import { AlertDialog, Badge, Button, Card, EmptyState } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import AnnotationDialog from '../components/AnnotationDialog.svelte';
import MetricAlertDialog from '../components/MetricAlertDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import type { AlertCheck, MetricAlert } from '../database/schema.ts';
import { EVENT_LABELS } from '../domain/catalog.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useAnalytics } from '../lib/context.ts';
import { formatDate, fromNow } from '../lib/format.ts';
import { currentProject } from '../lib/project.svelte.ts';

const { db, services } = useAnalytics();
const principal = usePrincipal();
const clock = useClock();
const data = liveQuery(
  async () => {
    const alerts = await db.alerts.where('projectId').equals(currentProject.id).sortBy('name');
    const checks = new Map<string, AlertCheck[]>();
    for (const alert of alerts) {
      const rows = await db.alertChecks.where('alertId').equals(alert.id).sortBy('at');
      checks.set(alert.id, rows.slice(-21));
    }
    return { alerts, checks };
  },
  { initial: undefined, deps: () => currentProject.id }
);

let createOpen = $state(false);
let annotateOpen = $state(false);
const notes = liveQuery(
  async () =>
    (await db.annotations.where('projectId').equals(currentProject.id).sortBy('at')).reverse(),
  { initial: [], deps: () => currentProject.id }
);
const people = liveQuery(
  async () =>
    new Map(
      (await db.table('py_personas').toArray()).map((p) => [p.id as string, p.name as string])
    ),
  { initial: new Map<string, string>() }
);
const KIND_LABELS = { release: 'Release', incident: 'Incident', campaign: 'Campaign' } as const;
let deleting = $state<MetricAlert | null>(null);
let deleteOpen = $state(false);
const canManage = (alert: MetricAlert) =>
  can(CAPABILITIES.alertsManageAll) ||
  (can(CAPABILITIES.alertsManage) && alert.ownerId === principal.current?.persona.id);
const rule = (a: MetricAlert) =>
  `${EVENT_LABELS[a.eventType] ?? a.eventType} ${a.operator} ${a.threshold.toLocaleString('en-US')} per day (typical ${a.baseline.toLocaleString('en-US')})`;
</script>

<PageHeader title="Alerts & annotations" description="Daily thresholds on event counts, checked once a day as simulated time advances, and the notes shown on the charts.">
  {#snippet actions()}
    {#if can(CAPABILITIES.alertsManage)}
      <Button size="sm" onclick={() => (createOpen = true)}><LucideIcon icon={BellPlus} class="size-4" />New alert</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if data.current && data.current.alerts.length === 0}
  <EmptyState title="No alerts yet" description="Create an alert to be told when a daily count crosses a threshold." />
{:else}
  <div class="grid gap-4 md:grid-cols-2" aria-busy={data.current === undefined}>
    {#each data.current?.alerts ?? [] as alert (alert.id)}
      {@const checks = data.current?.checks.get(alert.id) ?? []}
      <Card class="grid gap-3 p-5" data-alert={alert.id}>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="font-semibold">{alert.name}</h2>
            <p class="text-sm text-muted-foreground">{rule(alert)}</p>
          </div>
          {#if alert.muted}
            <Badge variant="outline"><LucideIcon icon={BellOff} class="size-3" />Muted</Badge>
          {:else if alert.status === 'firing'}
            <Badge variant="destructive"><LucideIcon icon={BellRing} class="size-3" />Firing</Badge>
          {:else}
            <Badge variant="secondary">OK</Badge>
          {/if}
        </div>
        {#if checks.length > 1}
          <Sparkline values={checks.map((c) => c.value)} variant="bar" period="{checks.length} days of checks" />
        {/if}
        <p class="text-xs text-muted-foreground">
          {#if alert.lastCheckedAt}Last check {fromNow(alert.lastCheckedAt, clock.now)}: {alert.lastValue?.toLocaleString('en-US')}{:else}Not checked yet{/if}
          {#if alert.lastFiredAt} · last fired {fromNow(alert.lastFiredAt, clock.now)}{/if}
        </p>
        {#if canManage(alert)}
          <div class="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onclick={() => runService(() => services.alerts.setMuted(alert.id, !alert.muted), { success: alert.muted ? 'Alert unmuted' : 'Alert muted' })}
            >
              {alert.muted ? 'Unmute' : 'Mute'}<span class="sr-only"> {alert.name}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => {
                deleting = alert;
                deleteOpen = true;
              }}><LucideIcon icon={Trash2} class="size-4" />Delete<span class="sr-only"> {alert.name}</span></Button
            >
          </div>
        {/if}
      </Card>
    {/each}
  </div>
{/if}

<section class="mt-10 grid gap-3" aria-labelledby="annotations-title">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 id="annotations-title" class="text-base font-semibold">Annotations</h2>
    {#if can(CAPABILITIES.annotationsCreate)}
      <Button variant="outline" size="sm" onclick={() => (annotateOpen = true)}><LucideIcon icon={Flag} class="size-4" />Add annotation</Button>
    {/if}
  </div>
  {#if (notes.current ?? []).length === 0}
    <p class="text-sm text-muted-foreground">No annotations yet. They mark releases, incidents and campaigns on the trend charts.</p>
  {:else}
    <Card class="p-0">
      <ul class="divide-y divide-border">
        {#each notes.current ?? [] as note (note.id)}
          <li class="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <span class="min-w-0">
              <Badge variant={note.kind === 'incident' ? 'destructive' : 'outline'}>{KIND_LABELS[note.kind]}</Badge>
              <span class="ml-2 font-medium">{note.title}</span>
              <span class="block text-xs text-muted-foreground"><time datetime={note.at}>{formatDate(note.at)}</time> · by {people.current?.get(note.authorId) ?? 'someone'}</span>
            </span>
            {#if can(CAPABILITIES.annotationsManageAll) || (can(CAPABILITIES.annotationsCreate) && note.authorId === principal.current?.persona.id)}
              <Button variant="ghost" size="sm" onclick={() => runService(() => services.annotations.remove(note.id), { success: 'Annotation removed' })}>
                <LucideIcon icon={Trash2} class="size-4" />Remove<span class="sr-only"> {note.title}</span>
              </Button>
            {/if}
          </li>
        {/each}
      </ul>
    </Card>
  {/if}
</section>

<MetricAlertDialog bind:open={createOpen} projectId={currentProject.id} />
<AnnotationDialog bind:open={annotateOpen} projectId={currentProject.id} />
{#if deleting}
  {@const target = deleting}
  <AlertDialog
    bind:open={deleteOpen}
    destructive
    title={`Delete ${target.name}?`}
    description="The alert and its check history are removed. Restore a snapshot from DevTools to undo."
    confirmLabel="Delete alert"
    onConfirm={async () => {
      await runService(() => services.alerts.remove(target.id), { success: 'Alert deleted' });
    }}
  />
{/if}
