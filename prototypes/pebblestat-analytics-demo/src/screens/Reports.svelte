<script lang="ts">
import { ExternalLink, PencilLine, Trash2 } from '@lucide/svelte';
import { describeFilter } from '@protoyard/analytics-ui/filters';
import { can, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { AlertDialog, Button, Card, EmptyState } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import RenameDialog from '../components/RenameDialog.svelte';
import type { SavedReport } from '../database/schema.ts';
import { EVENT_LABELS, EVENT_PROPERTIES } from '../domain/catalog.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useAnalytics } from '../lib/context.ts';
import { formatDate } from '../lib/format.ts';
import { currentProject } from '../lib/project.svelte.ts';

const { db, services } = useAnalytics();
const principal = usePrincipal();
const reports = liveQuery(
  () => db.reports.where('projectId').equals(currentProject.id).sortBy('name'),
  {
    initial: undefined,
    deps: () => currentProject.id,
  }
);
const people = liveQuery(
  async () =>
    new Map(
      (await db.table('py_personas').toArray()).map((p) => [p.id as string, p.name as string])
    ),
  { initial: new Map<string, string>() }
);

let renaming = $state<SavedReport | null>(null);
let renameOpen = $state(false);
let deleting = $state<SavedReport | null>(null);
let deleteOpen = $state(false);

// Mirrors the service rule (the service enforces it either way).
const canManage = (report: SavedReport) =>
  can(CAPABILITIES.reportsManageAll) ||
  (can(CAPABILITIES.reportsSave) && report.ownerId === principal.current?.persona.id);
const summary = (r: SavedReport) =>
  [
    `${r.config.measure === 'users' ? 'Unique users' : 'Events'} of ${r.config.eventType === 'all' ? 'all events' : (EVENT_LABELS[r.config.eventType] ?? r.config.eventType)}`,
    r.config.breakdown
      ? `by ${EVENT_PROPERTIES.find((p) => p.path === r.config.breakdown)?.label.toLowerCase() ?? r.config.breakdown}`
      : '',
    r.config.filter.conditions.length
      ? `where ${describeFilter(r.config.filter, EVENT_PROPERTIES)}`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
</script>

<PageHeader title="Reports" description="Saved Trends queries. Open one to see it with the current date range." />

{#if reports.current && reports.current.length === 0}
  <EmptyState title="No saved reports" description={can(CAPABILITIES.reportsSave) ? 'Build a query on Trends and choose “Save report”.' : 'Analysts save reports from Trends; they will appear here.'} />
{:else}
  <Card class="p-0">
    <ul class="divide-y divide-border" aria-busy={reports.current === undefined}>
      {#each reports.current ?? [] as report (report.id)}
        <li class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div class="min-w-0">
            <a class="font-medium text-primary underline-offset-2 hover:underline" href="#/trends?report={encodeURIComponent(report.id)}">{report.name}</a>
            <p class="text-sm text-muted-foreground">{summary(report)}</p>
            <p class="text-xs text-muted-foreground">By {people.current?.get(report.ownerId) ?? 'someone'} · updated {formatDate(report.updatedAt)}</p>
          </div>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" href="#/trends?report={encodeURIComponent(report.id)}"><ExternalLink class="size-4" aria-hidden="true" />Open<span class="sr-only"> {report.name}</span></Button>
            {#if canManage(report)}
              <Button
                variant="outline"
                size="sm"
                onclick={() => {
                  renaming = report;
                  renameOpen = true;
                }}><PencilLine class="size-4" aria-hidden="true" />Rename<span class="sr-only"> {report.name}</span></Button
              >
              <Button
                variant="ghost"
                size="sm"
                onclick={() => {
                  deleting = report;
                  deleteOpen = true;
                }}><Trash2 class="size-4" aria-hidden="true" />Delete<span class="sr-only"> {report.name}</span></Button
              >
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </Card>
{/if}

{#if renaming}
  {@const target = renaming}
  <RenameDialog bind:open={renameOpen} title="Rename report" current={target.name} save={(name) => services.reports.rename(target.id, { name })} />
{/if}
{#if deleting}
  {@const target = deleting}
  <AlertDialog
    bind:open={deleteOpen}
    destructive
    title={`Delete ${target.name}?`}
    description="The report is removed for everyone. Restore a snapshot from DevTools to undo."
    confirmLabel="Delete report"
    onConfirm={async () => {
      await runService(() => services.reports.remove(target.id), { success: 'Report deleted' });
    }}
  />
{/if}
