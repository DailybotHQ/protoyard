<script lang="ts">
import type { Blueprint, EntityInput, EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { can, liveQuery, navigate, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import type { TaskChange } from '@protoyard/views/timeline';
import { TimelineView } from '@protoyard/views-ui/timeline';
import { formatEntityHeading } from '../../format.ts';
import {
  groupTimelineRows,
  type TimelineRecord,
  type TimelineScreenSpec,
  timelineDatePatch,
} from './model.ts';

let {
  runtime,
  blueprint,
  services,
  screen,
  title,
  onOpenRecord,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  services: EntityServices;
  screen: TimelineScreenSpec;
  title?: string;
  onOpenRecord?: (row: Row) => void;
} = $props();

function requireEntity(name: string) {
  const found = blueprint.entities.find((candidate) => candidate.name === name);
  if (!found) throw new RangeError(`timeline screen: unknown entity "${name}"`);
  return found;
}

function requireService(name: string) {
  const found = services[name];
  if (!found) throw new RangeError(`timeline screen: no service for "${name}"`);
  return found;
}

// svelte-ignore state_referenced_locally
const entity = requireEntity(screen.entity);
// svelte-ignore state_referenced_locally
const service = requireService(screen.entity);

// svelte-ignore state_referenced_locally
const principal = usePrincipal(runtime);
let attempt = $state(0);
const rows = liveQuery(() => service.list(), {
  initial: undefined,
  deps: () => [attempt, principal.current?.persona.id],
});
const groups = $derived(groupTimelineRows(rows.current ?? [], entity, screen));
let weekPending = $state<Record<string, boolean>>({});
let weekMessage = $state('');
const query = {
  get current(): TimelineRecord[] | undefined {
    return rows.current === undefined ? undefined : groups.flatMap((group) => group.tasks);
  },
  get loading() {
    return rows.loading;
  },
  get error() {
    return rows.error;
  },
};
const canUpdate = $derived(
  can(`${entity.name}:update`, undefined, runtime) ||
    can(`${entity.name}:update:own`, undefined, runtime)
);
const label = $derived(title ?? `${formatEntityHeading(entity)} timeline`);

async function reschedule(changes: readonly TaskChange[]) {
  for (const change of changes) {
    if (!change.start || !change.end) continue;
    const task = groups.flatMap((group) => group.tasks).find((item) => item.id === change.id);
    if (!task) continue;
    await service.update(
      change.id,
      timelineDatePatch(
        entity,
        screen,
        task,
        change.start as TimelineRecord['start'],
        change.end as TimelineRecord['end']
      ) as EntityInput
    );
  }
}

async function shiftWeek(task: TimelineRecord, days: -7 | 7) {
  if (weekPending[task.id]) return;
  weekPending = { ...weekPending, [task.id]: true };
  const start = new Date(`${task.start}T00:00:00.000Z`);
  const end = new Date(`${task.end}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + days);
  end.setUTCDate(end.getUTCDate() + days);
  const startDate = start.toISOString().slice(0, 10) as TimelineRecord['start'];
  const endDate = end.toISOString().slice(0, 10) as TimelineRecord['end'];
  const result = await runService(() =>
    service.update(
      task.id,
      timelineDatePatch(entity, screen, task, startDate, endDate) as EntityInput
    )
  );
  const { [task.id]: _pending, ...rest } = weekPending;
  weekPending = rest;
  weekMessage = result.ok ? `Moved ${task.title} by one week.` : `Could not move ${task.title}.`;
}

function open(task: TimelineRecord) {
  if (onOpenRecord) onOpenRecord(task.row);
  else navigate(`/${entity.plural}/${encodeURIComponent(task.id)}`);
}
</script>

<section class="grid gap-3" data-timeline-screen={entity.name}>
  {#if groups.length === 0 && rows.current !== undefined && !rows.loading}
    <TimelineView
      {query}
      dependencies={[]}
      {label}
      {runtime}
      zoom={screen.zoom}
      onReschedule={canUpdate ? reschedule : undefined}
      onRetry={() => {
        attempt += 1;
      }}
    />
  {:else}
    {#each groups as group (group.key)}
      <section class="grid gap-2" data-timeline-group={group.key}>
        {#if screen.groupBy}<h3 class="text-sm font-semibold">{group.label}</h3>{/if}
        <TimelineView
          query={{ current: group.tasks, loading: rows.loading, error: rows.error }}
          dependencies={[]}
          label={`${label} — ${group.label}`}
          {runtime}
          zoom={screen.zoom}
          getTitle={(task) => task.title}
          onReschedule={canUpdate ? reschedule : undefined}
          onOpen={(task) => open(task)}
          onRetry={() => {
            attempt += 1;
          }}
        />
        {#if canUpdate}
          <details class="text-sm">
            <summary class="cursor-pointer font-medium">Move tasks by one week</summary>
            <ul class="mt-2 grid gap-2">
              {#each group.tasks as task (task.id)}
                <li class="flex flex-wrap items-center gap-2">
                  <span class="min-w-32 flex-1">{task.title}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={!!weekPending[task.id]}
                    onclick={() => shiftWeek(task, -7)}
                  >Earlier</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={!!weekPending[task.id]}
                    onclick={() => shiftWeek(task, 7)}
                  >Later</Button>
                </li>
              {/each}
            </ul>
          </details>
        {/if}
      </section>
    {/each}
  {/if}
  {#if rows.current && groups.length === 0 && rows.current.length > 0}
    <p class="text-sm text-muted-foreground">{rows.current.length} records have no valid {screen.startField} date.</p>
  {/if}
  <p class="sr-only" aria-live="polite">{weekMessage}</p>
</section>
