<script lang="ts" generics="T extends import('@protoyard/views/timeline').TimelineItem">
/**
 * Host adapter over `@texuli/data/timeline` `TimelineView`: liveQuery + services.
 */
import type { PrototypeRuntime } from '@protoyard/core';
import { runService, useClock } from '@protoyard/renderer-svelte';
import type { Dependency, TaskChange, TimelineItem } from '@protoyard/views/timeline';
import { TimelineView as TexuliTimeline, type TimelineZoom } from '@texuli/data/timeline';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  dependencies = [],
  label = 'Project timeline',
  zoom = $bindable('week' as TimelineZoom),
  now,
  runtime,
  getTitle,
  getProgress,
  onReschedule,
  onOpen: _onOpen,
  onRetry,
  getGroup: _getGroup,
  maxRows: _maxRows,
  class: className,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  dependencies?: readonly Dependency[];
  label?: string;
  zoom?: TimelineZoom;
  now?: Date;
  runtime?: PrototypeRuntime;
  getTitle?: (task: T) => string;
  getProgress?: (task: T) => number | undefined;
  onReschedule?: (changes: readonly TaskChange[]) => unknown;
  onOpen?: (task: T) => void;
  onRetry?: () => void | Promise<void>;
  getGroup?: (task: T) => { id: string; label: string } | undefined;
  maxRows?: number;
  class?: string;
} = $props();

// svelte-ignore state_referenced_locally
const clock = now ? null : useClock(runtime);
const today = $derived(now ?? clock?.now ?? new Date(0));

async function persist(changes: readonly TaskChange[]): Promise<void> {
  if (!onReschedule) return;
  await runService(() => onReschedule(changes));
}
</script>

<QueryState {query} label={`Loading ${label.toLowerCase()}`} {onRetry} isEmpty={() => false}>
  {#snippet children(tasks)}
    <TexuliTimeline
      {tasks}
      {dependencies}
      {label}
      bind:zoom
      now={today}
      {getTitle}
      {getProgress}
      onReschedule={onReschedule ? persist : undefined}
      class={className}
    />
  {/snippet}
</QueryState>
