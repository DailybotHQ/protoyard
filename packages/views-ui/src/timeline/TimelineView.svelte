<script lang="ts" generics="T extends import('@protoyard/views/timeline').TimelineItem">
/**
 * Host adapter over `@texuli/data/timeline` `TimelineView`: liveQuery + services.
 * Texuli formats task-bar dates with month:'long' (and optional locale).
 * Grouping (`getGroup`, bands, `collapsed`, `onGroupAdd`), `maxRows`,
 * `onOpen`, row selection and `markers` pass straight through (Texuli 0.14.0), as do
 * `initialDate` and `formatTick` (Texuli 0.14.2). Without `initialDate` the axis opens
 * at the simulated today when it falls inside the plan. Texuli 0.14.4 holds that
 * opening day as rows load and zoom changes; `scrollToDate` (via `bind:this`) moves
 * the view to a date on demand.
 */
import type { PrototypeRuntime } from '@protoyard/core';
import { runService, useClock } from '@protoyard/renderer-svelte';
import type { Dependency, TaskChange, TimelineItem } from '@protoyard/views/timeline';
import {
  TimelineView as TexuliTimeline,
  type TimelineGroup,
  type TimelineLabels,
  type TimelineMarker,
  type TimelineTickContext,
  type TimelineZoom,
} from '@texuli/data/timeline';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  dependencies = [],
  label = 'Project timeline',
  zoom = $bindable('week' as TimelineZoom),
  now,
  runtime,
  locale = 'en',
  getTitle,
  getProgress,
  onReschedule,
  onOpen,
  onRetry,
  getGroup,
  maxRows,
  collapsed = $bindable<string[]>([]),
  onCollapsedChange,
  onGroupAdd,
  selectedRow = $bindable<string | undefined>(undefined),
  onRowSelect,
  markers,
  labels,
  initialDate,
  formatTick,
  class: className,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  dependencies?: readonly Dependency[];
  label?: string;
  zoom?: TimelineZoom;
  now?: Date;
  runtime?: PrototypeRuntime;
  /** BCP 47 locale for axis ticks and task-bar date names (full month). */
  locale?: string;
  getTitle?: (task: T) => string;
  getProgress?: (task: T) => number | undefined;
  onReschedule?: (changes: readonly TaskChange[]) => unknown;
  onOpen?: (task: T) => void;
  onRetry?: () => unknown;
  /** Groups rows under a disclosure header; a group's `band` spans that header. */
  getGroup?: (task: T) => TimelineGroup | undefined;
  /** Rows shown at most; Texuli adds a truncation notice past it. */
  maxRows?: number;
  /** Ids of collapsed groups (bindable; uncontrolled when omitted). */
  collapsed?: string[];
  onCollapsedChange?: (collapsed: string[]) => void;
  /** Shows an add action on every group header; runs through `runService`. */
  onGroupAdd?: (group: TimelineGroup & { items: readonly T[] }) => unknown;
  /** Id of the selected task (bindable); its row is highlighted. */
  selectedRow?: string;
  /** Makes rows selectable from the task list and the bar. */
  onRowSelect?: (task: T) => void;
  /** Vertical markers besides today (`{ at, label, tone }`). */
  markers?: readonly TimelineMarker[];
  /** Texuli timeline copy overrides. */
  labels?: Partial<TimelineLabels>;
  /** The day the axis opens at (`YYYY-MM-DD` or a `Date`). */
  initialDate?: string | Date;
  /** Axis tick text; Texuli's default keeps day-zoom labels compact. */
  formatTick?: (date: string, context: TimelineTickContext) => string;
  class?: string;
} = $props();

// svelte-ignore state_referenced_locally -- only subscribe when a runtime is in scope
const clock = now || !runtime ? null : useClock(runtime);
const today = $derived(now ?? clock?.now ?? new Date(0));

// The rendered Texuli timeline (absent while the query loads or fails).
let inner: { scrollToDate: (date: string | Date) => void } | undefined = $state();

/**
 * Places `date` where the opening day sits, as if the reader scrolled there
 * (Texuli 0.14.4). Does nothing while the query is loading or failed; an
 * invalid date does nothing and a date outside the axis goes to the nearest end.
 */
export function scrollToDate(date: string | Date): void {
  inner?.scrollToDate(date);
}

function addToGroup(group: TimelineGroup & { items: readonly T[] }): void {
  if (!onGroupAdd) return;
  void runService(() => onGroupAdd(group));
}

async function persist(changes: readonly TaskChange[]): Promise<void> {
  if (!onReschedule) return;
  await runService(() => onReschedule(changes));
}
</script>

<div data-timeline={label}>
  <QueryState
    {query}
    label={`Loading ${label.toLowerCase()}`}
    onRetry={onRetry ? () => { void onRetry(); } : undefined}
    isEmpty={() => false}
  >
    {#snippet children(tasks)}
      <TexuliTimeline
        bind:this={inner}
        {tasks}
        {dependencies}
        {label}
        bind:zoom
        now={today}
        {locale}
        {getTitle}
        {getProgress}
        onReschedule={onReschedule ? persist : undefined}
        {onOpen}
        {getGroup}
        {maxRows}
        bind:collapsed
        {onCollapsedChange}
        onGroupAdd={onGroupAdd ? addToGroup : undefined}
        bind:selectedRow
        {onRowSelect}
        {markers}
        {labels}
        {initialDate}
        {formatTick}
        class={className}
      />
    {/snippet}
  </QueryState>
</div>
