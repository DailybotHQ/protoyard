<script lang="ts" generics="T extends ScheduleTask">
import type { PrototypeRuntime } from '@protoyard/core';
import { runService, useClock } from '@protoyard/renderer-svelte';
import { addDays, daysBetween, type IsoDate } from '@protoyard/views/calendar';
import { createAxis, windowAxis } from '@protoyard/views/grid';
import {
  cascade,
  criticalPath,
  type Dependency,
  type ScheduleTask,
  type TaskChange,
} from '@protoyard/views/timeline';
import QueryState from '../states/QueryState.svelte';
import {
  DAY_WIDTH,
  dateOffset,
  durationLabel,
  HEADER_HEIGHT,
  progressValue,
  ROW_HEIGHT,
  type TimelineZoom,
  timelineRange,
  ZOOMS,
} from './model.ts';

let {
  query,
  dependencies,
  label = 'Project timeline',
  zoom = $bindable('week'),
  now,
  runtime,
  getTitle = (task: T) => String((task as T & { title?: unknown }).title ?? task.id),
  getProgress = (task: T) => {
    const value = (task as T & { progress?: unknown }).progress;
    return typeof value === 'number' ? value : undefined;
  },
  onReschedule,
  onOpen,
  onRetry,
  class: className,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  dependencies: readonly Dependency[];
  label?: string;
  zoom?: TimelineZoom;
  /** Fixed date for tests and stories; defaults to the runtime clock. */
  now?: Date;
  runtime?: PrototypeRuntime;
  getTitle?: (task: T) => string;
  getProgress?: (task: T) => number | undefined;
  /** Persist the full cascade through domain services. Its promise controls pending and rollback. */
  onReschedule?: (changes: readonly TaskChange[]) => unknown;
  onOpen?: (task: T) => void;
  onRetry?: () => void | Promise<void>;
  class?: string;
} = $props();

// svelte-ignore state_referenced_locally
const clock = now ? null : useClock(runtime);
const uid = $props.id();
const today = $derived((now ?? clock?.now ?? new Date(0)).toISOString().slice(0, 10) as IsoDate);
const tasks = $derived(query.current ?? []);
const range = $derived(timelineRange(tasks, today));
const width = $derived(DAY_WIDTH[zoom]);
const totalDays = $derived(Math.max(1, daysBetween(range.start, range.end) + 1));
const canvasWidth = $derived(totalDays * width);
const axis = $derived(createAxis({ count: tasks.length, size: ROW_HEIGHT }));

let scroller = $state<HTMLDivElement>();
let scrollTop = $state(0);
let viewportHeight = $state(440);
let interaction = $state<{
  id: string;
  mode: 'move' | 'resize-start' | 'resize-end';
  originX: number;
  original: ScheduleTask;
  draft: ScheduleTask;
} | null>(null);
let optimistic = $state<Record<string, { start: IsoDate; end: IsoDate }>>({});
let pending = $state<Record<string, true>>({});
let announcement = $state('');

const visible = $derived(windowAxis(axis, scrollTop, viewportHeight, 4));
const positionedTasks = $derived(
  tasks.map((task) => ({ ...task, ...(optimistic[task.id] ?? {}) }))
);
const critical = $derived(new Set(criticalPath(positionedTasks, dependencies).critical));
const activePreview = $derived.by(() => {
  if (!interaction) return [] as TaskChange[];
  try {
    return cascade(positionedTasks, dependencies, {
      id: interaction.id,
      start: interaction.draft.start,
      end: interaction.draft.end,
    }).changes;
  } catch {
    return [] as TaskChange[];
  }
});
const previewById = $derived(new Map(activePreview.map((change) => [change.id, change])));
const dayTicks = $derived.by(() => {
  const step = zoom === 'day' ? 1 : zoom === 'week' ? 7 : zoom === 'month' ? 30 : 90;
  const marks: { date: IsoDate; offset: number }[] = [];
  for (let day = 0; day < totalDays; day += step) {
    const date = addDays(range.start, day);
    marks.push({ date, offset: day * width });
  }
  return marks;
});
const todayOffset = $derived(dateOffset(today, range.start) * width);

function scheduled(task: T): ScheduleTask {
  const change = previewById.get(task.id);
  return {
    ...task,
    start: optimistic[task.id]?.start ?? change?.start ?? task.start,
    end: optimistic[task.id]?.end ?? change?.end ?? task.end,
  };
}

function taskStyle(task: ScheduleTask) {
  const position = scheduled(task as T);
  const left = dateOffset(position.start, range.start) * width;
  const days = Math.max(task.milestone ? 0 : 1, daysBetween(position.start, position.end) + 1);
  return `left:${left}px;width:${task.milestone ? 12 : Math.max(width * 0.7, days * width)}px`;
}

function begin(task: T, mode: 'move' | 'resize-start' | 'resize-end', event?: PointerEvent) {
  if (!onReschedule || pending[task.id]) return;
  const current = positionedTasks.find((item) => item.id === task.id) ?? task;
  interaction = {
    id: task.id,
    mode,
    originX: event?.clientX ?? 0,
    original: { ...current },
    draft: { ...current },
  };
  if (event) (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function pointerMove(event: PointerEvent) {
  if (!interaction) return;
  const delta = Math.round((event.clientX - interaction.originX) / width);
  if (delta === 0) return;
  const { original, mode } = interaction;
  const next =
    mode === 'move'
      ? { ...original, start: addDays(original.start, delta), end: addDays(original.end, delta) }
      : mode === 'resize-start'
        ? { ...original, start: addDays(original.start, delta) }
        : { ...original, end: addDays(original.end, delta) };
  if (next.start <= next.end) interaction = { ...interaction, draft: next };
}

async function commit() {
  if (!interaction || !onReschedule) return;
  const result = activePreview
    .map((change) => {
      const original = positionedTasks.find((task) => task.id === change.id);
      return {
        ...change,
        start: change.start ?? original?.start,
        end: change.end ?? original?.end,
      };
    })
    .filter((change): change is TaskChange & { start: IsoDate; end: IsoDate } =>
      Boolean(change.start && change.end)
    );
  interaction = null;
  if (result.length === 0) return;
  optimistic = {
    ...optimistic,
    ...Object.fromEntries(
      result.map((change) => [change.id, { start: change.start, end: change.end }])
    ),
  };
  pending = {
    ...pending,
    ...Object.fromEntries(result.map((change) => [change.id, true as const])),
  };
  announcement = 'Saving schedule changes…';
  const response = await runService(() => onReschedule(result));
  const nextPending = { ...pending };
  for (const change of result) delete nextPending[change.id];
  pending = nextPending;
  if (!response.ok) {
    const next = { ...optimistic };
    for (const change of result) delete next[change.id];
    optimistic = next;
    announcement = 'The schedule was not saved; dates were restored.';
  } else {
    announcement = `Saved ${result.length} schedule change${result.length === 1 ? '' : 's'}.`;
  }
}

function cancel() {
  interaction = null;
  announcement = 'Reschedule cancelled.';
}

function keyTask(task: T, event: KeyboardEvent) {
  if (!onReschedule) return;
  if (!interaction || interaction.id !== task.id) {
    if (event.key === ' ') {
      event.preventDefault();
      begin(task, event.shiftKey ? 'resize-end' : 'move');
      announcement = `Picked up ${getTitle(task)}. Use arrow keys to adjust dates; Enter saves, Escape cancels.`;
    }
    return;
  }
  event.preventDefault();
  if (event.key === 'Escape') return cancel();
  if (event.key === 'Enter' || event.key === ' ') return void commit();
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const delta = event.key === 'ArrowRight' ? 1 : -1;
  const { draft, mode } = interaction;
  const next =
    mode === 'move'
      ? { ...draft, start: addDays(draft.start, delta), end: addDays(draft.end, delta) }
      : mode === 'resize-start'
        ? { ...draft, start: addDays(draft.start, delta) }
        : { ...draft, end: addDays(draft.end, delta) };
  if (next.start <= next.end) interaction = { ...interaction, draft: next };
  announcement = `${getTitle(task)} preview: ${interaction.draft.start} to ${interaction.draft.end}.`;
}

function onScroll(event: Event) {
  const element = event.currentTarget as HTMLDivElement;
  scrollTop = element.scrollTop;
  viewportHeight = element.clientHeight || 440;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
</script>

<section class={`timeline ${className ?? ''}`} data-timeline data-zoom={zoom} aria-label={label}>
  <header class="toolbar">
    <h2>{label}</h2>
    <div class="zooms" role="group" aria-label="Timeline zoom">
      {#each ZOOMS as option}
        <button type="button" aria-pressed={zoom === option} onclick={() => (zoom = option)}>{option[0]?.toUpperCase()}{option.slice(1)}</button>
      {/each}
    </div>
  </header>
  <QueryState {query} label={label} onRetry={onRetry}>
    {#if tasks.length > 0}
      <div class="timeline-body" class:has-interaction={!!interaction}>
        <div class="task-table" role="treegrid" aria-label={`${label} tasks`} aria-colcount="4" aria-rowcount={tasks.length + 1}>
          <div class="table-head" role="row" aria-rowindex="1">
            <span role="columnheader">Task</span><span role="columnheader">Start</span><span role="columnheader">End</span><span role="columnheader">Duration</span>
          </div>
          <div class="table-viewport" style={`height:${Math.max(ROW_HEIGHT, viewportHeight)}px`}>
            {#each visible.items as row (tasks[row.index]?.id)}
              {@const task = tasks[row.index] as T}
              {@const dates = scheduled(task)}
              <div class="table-row" role="row" aria-rowindex={row.index + 2} style={`top:${row.start - scrollTop}px;height:${row.size}px`} data-task-row={task.id}>
                <span role="gridcell" class="task-name" title={getTitle(task)}>{#if critical.has(task.id)}<span class="critical-mark" aria-label="Critical path">●</span>{/if}{getTitle(task)}<span class="mini-bar" aria-hidden="true"><i style={`width:${progressValue(getProgress(task))}%`}></i></span></span>
                <span role="gridcell">{dates.start}</span><span role="gridcell">{dates.end}</span><span role="gridcell">{durationLabel(dates)}</span>
              </div>
            {/each}
          </div>
        </div>
        <div class="canvas-scroll" bind:this={scroller} onscroll={onScroll}>
          <div class="canvas" style={`width:${canvasWidth}px;height:${Math.max(ROW_HEIGHT, axis.total)}px`}>
            <div class="date-head" style={`height:${HEADER_HEIGHT}px`}>
              {#each dayTicks as tick (tick.date)}<span style={`left:${tick.offset}px;width:${Math.max(width, zoom === 'quarter' ? 80 : width * (zoom === 'week' ? 7 : zoom === 'month' ? 30 : 1))}px`}>{formatDate(tick.date)}</span>{/each}
            </div>
            {#if todayOffset >= 0 && todayOffset <= canvasWidth}
              <div class="today-line" data-today-line role="img" style={`left:${todayOffset}px;top:${HEADER_HEIGHT}px;height:${axis.total}px`} aria-label={`Today, ${formatDate(today)}`}></div>
            {/if}
                <svg class="dependencies" aria-hidden="true" style={`top:${HEADER_HEIGHT}px;width:${canvasWidth}px;height:${axis.total}px`}>
              <defs><marker id={`${uid}-dependency-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker></defs>
              {#each dependencies as dependency (`${dependency.from}:${dependency.to}`)}
                {@const fromIndex = tasks.findIndex((task) => task.id === dependency.from)}
                {@const toIndex = tasks.findIndex((task) => task.id === dependency.to)}
                {@const fromTask = positionedTasks.find((task) => task.id === dependency.from)}
                {@const toTask = positionedTasks.find((task) => task.id === dependency.to)}
                {#if fromIndex >= visible.start && fromIndex < visible.end && toIndex >= visible.start && toIndex < visible.end && fromTask && toTask}
                  {@const fromChange = previewById.get(dependency.from)}
                  {@const toChange = previewById.get(dependency.to)}
                  {@const fromEnd = fromChange?.end ?? fromTask.end}
                  {@const toStart = toChange?.start ?? toTask.start}
                  <path marker-end={`url(#${uid}-dependency-arrow)`} d={`M ${dateOffset(fromEnd, range.start) * width + width / 2} ${fromIndex * ROW_HEIGHT + ROW_HEIGHT / 2} C ${dateOffset(fromEnd, range.start) * width + width} ${fromIndex * ROW_HEIGHT + ROW_HEIGHT / 2}, ${dateOffset(toStart, range.start) * width} ${toIndex * ROW_HEIGHT + ROW_HEIGHT / 2}, ${dateOffset(toStart, range.start) * width + 2} ${toIndex * ROW_HEIGHT + ROW_HEIGHT / 2}`} />
                {/if}
              {/each}
            </svg>
            {#each visible.items as row (tasks[row.index]?.id)}
              {@const task = tasks[row.index] as T}
              {@const change = previewById.get(task.id)}
              {@const shown = scheduled(task)}
              <div class="bar-row" style={`top:${row.start + HEADER_HEIGHT}px;height:${row.size}px`}>
                <button type="button" class="task-bar" class:critical={critical.has(task.id)} class:milestone={task.milestone} class:preview={!!change} style={taskStyle(task)} aria-label={`${getTitle(task)}, ${formatDate(shown.start)} to ${formatDate(shown.end)}${task.milestone ? ', milestone' : ''}${pending[task.id] ? ', saving' : ''}`} aria-roledescription="reschedulable task" aria-busy={pending[task.id] ? 'true' : undefined} aria-pressed={interaction?.id === task.id} disabled={!!pending[task.id]} onpointerdown={(event) => begin(task, 'move', event)} onpointermove={pointerMove} onpointerup={() => void commit()} onpointercancel={cancel} onkeydown={(event) => keyTask(task, event)} onclick={() => onOpen?.(task)}>
                  <span class="progress" style={`width:${progressValue(getProgress(task))}%`}></span>
                  <span class="bar-label">{getTitle(task)}{task.milestone ? ' · milestone' : ''}{pending[task.id] ? ' · Saving' : ''}</span>
                  <span class="resize start" role="presentation" onpointerdown={(event) => { event.stopPropagation(); begin(task, 'resize-start', event); }}></span>
                  <span class="resize end" role="presentation" onpointerdown={(event) => { event.stopPropagation(); begin(task, 'resize-end', event); }}></span>
                </button>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </QueryState>
  <p class="sr-only" aria-live="polite">{announcement}</p>
</section>

<style>
.timeline{--line:#d7dce3;--ink:#202631;--muted:#657080;--surface:#fff;--accent:#526de5;--critical:#ce5064;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:.75rem;overflow:hidden;font:inherit}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.75rem 1rem;border-bottom:1px solid var(--line)}h2{font-size:1rem;margin:0}.zooms{display:flex;gap:.25rem}.zooms button{background:transparent;border:1px solid var(--line);border-radius:.375rem;padding:.3rem .55rem;color:inherit}.zooms button[aria-pressed=true]{background:#3b50c2;border-color:#3b50c2;color:white}.timeline-body{display:grid;grid-template-columns:minmax(33rem, 45%) minmax(0,1fr);min-height:16rem}.task-table{border-right:1px solid var(--line);min-width:0}.table-head,.table-row{display:grid;grid-template-columns:minmax(8rem,1fr) 7.2rem 7.2rem 5.6rem;align-items:center;gap:.4rem;padding:0 .65rem}.table-head{height:3rem;font-size:.72rem;color:var(--muted);font-weight:600;border-bottom:1px solid var(--line)}.table-viewport{position:relative;overflow:hidden}.table-row{position:absolute;left:0;right:0;border-bottom:1px solid color-mix(in srgb,var(--line) 65%,transparent);font-size:.72rem;white-space:nowrap}.task-name{overflow:hidden;text-overflow:ellipsis}.mini-bar{display:none}.critical-mark{color:var(--critical);font-size:.65rem;margin-right:.35rem}.canvas-scroll{min-width:0;overflow:auto;position:relative}.canvas{position:relative;min-height:100%}.date-head{position:sticky;top:0;z-index:4;background:var(--surface);border-bottom:1px solid var(--line);white-space:nowrap;overflow:hidden}.date-head span{position:absolute;top:0;height:100%;display:flex;align-items:center;padding-left:.45rem;border-left:1px solid var(--line);font-size:.7rem;color:var(--muted)}.today-line{position:absolute;border-left:2px solid var(--critical);z-index:3;pointer-events:none}.today-line:before{content:"Today";position:absolute;top:0;left:.15rem;font-size:.62rem;color:var(--critical);white-space:nowrap}.dependencies{position:absolute;left:0;overflow:visible;pointer-events:none;z-index:1}.dependencies path{fill:none;stroke:#8290a2;stroke-width:1.5;stroke-dasharray:3 2}.dependencies marker path{fill:#8290a2;stroke:none}.bar-row{position:absolute;left:0;right:0;border-bottom:1px solid color-mix(in srgb,var(--line) 65%,transparent);z-index:2}.task-bar{position:absolute;top:7px;height:29px;display:flex;align-items:center;border:1px solid #5168c9;border-radius:.35rem;background:#dfe5ff;color:#25356e;text-align:left;overflow:hidden;padding:0 .35rem;touch-action:none;cursor:grab}.task-bar:active{cursor:grabbing}.task-bar.critical{border-color:var(--critical);background:#ffe4e8;color:#721f30}.task-bar.preview{outline:2px dashed var(--accent);outline-offset:1px}.task-bar.milestone{border-radius:0;transform:rotate(45deg);height:14px;top:14px;background:var(--critical);border-color:var(--critical)}.progress{position:absolute;inset:0 auto 0 0;background:color-mix(in srgb,var(--accent) 20%,transparent);pointer-events:none}.critical .progress{background:color-mix(in srgb,var(--critical) 18%,transparent)}.bar-label{position:relative;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.7rem;pointer-events:none}.milestone .bar-label{display:none}.resize{position:absolute;top:0;bottom:0;width:7px;cursor:ew-resize}.resize.start{left:0}.resize.end{right:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:767px){.timeline-body{display:block}.task-table{border:0}.table-head,.table-viewport{height:auto!important}.table-head{grid-template-columns:1fr 6.5rem 6.5rem 5rem}.table-row{position:static!important;display:grid;grid-template-columns:1fr 6.5rem 6.5rem 5rem;min-height:3rem}.task-name{white-space:normal}.mini-bar{display:block;height:3px;margin-top:.25rem;background:var(--line);border-radius:2px}.mini-bar i{display:block;height:100%;background:var(--accent)}.canvas-scroll{display:none}.zooms button{padding:.25rem .4rem}}
.timeline-body{height:min(32rem,70vh);min-height:18rem}.task-table,.canvas-scroll{min-height:0}.canvas-scroll{height:100%}
@media(max-width:767px){.timeline-body{height:auto;min-height:0}}
:global(.dark) .timeline{--line:#3b4350;--ink:#e6e9ee;--muted:#a7b0be;--surface:#171b22;--accent:#8294ff}.timeline :global(button:focus-visible){outline:2px solid var(--accent);outline-offset:2px}
</style>
