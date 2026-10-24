<script lang="ts" generics="T extends import('@protoyard/views/timeline').TimelineItem">
/**
 * Host adapter over `@texuli/data/timeline` `TimelineView`: liveQuery + services.
 * Rewrites task-bar aria-labels to long month names so crud screens that assert
 * "June 2, 2026" keep working (Texuli formatDate uses month:'short' → "Jun").
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
  onRetry?: () => unknown;
  getGroup?: (task: T) => { id: string; label: string } | undefined;
  maxRows?: number;
  class?: string;
} = $props();

// svelte-ignore state_referenced_locally -- only subscribe when a runtime is in scope
const clock = now || !runtime ? null : useClock(runtime);
const today = $derived(now ?? clock?.now ?? new Date(0));

let host = $state<HTMLElement | null>(null);

const LONG_MONTHS: Record<string, string> = {
  Jan: 'January',
  Feb: 'February',
  Mar: 'March',
  Apr: 'April',
  May: 'May',
  Jun: 'June',
  Jul: 'July',
  Aug: 'August',
  Sep: 'September',
  Oct: 'October',
  Nov: 'November',
  Dec: 'December',
};

function expandMonths(labelText: string): string {
  return labelText.replace(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g,
    (m) => LONG_MONTHS[m] ?? m
  );
}

$effect(() => {
  // Depend on tasks so labels refresh after data loads / reschedules.
  void query.current;
  void today;
  const root = host;
  if (!root) return;
  const apply = () => {
    for (const bar of root.querySelectorAll<HTMLElement>(
      '[aria-roledescription="reschedulable task"], button[aria-label*=" to "]'
    )) {
      const current = bar.getAttribute('aria-label');
      if (!current) continue;
      const next = expandMonths(current);
      if (next !== current) bar.setAttribute('aria-label', next);
    }
  };
  apply();
  const obs = new MutationObserver(apply);
  obs.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label'],
  });
  return () => obs.disconnect();
});

async function persist(changes: readonly TaskChange[]): Promise<void> {
  if (!onReschedule) return;
  await runService(() => onReschedule(changes));
}
</script>

<div bind:this={host} data-timeline={label}>
  <QueryState
    {query}
    label={`Loading ${label.toLowerCase()}`}
    onRetry={onRetry ? () => { void onRetry(); } : undefined}
    isEmpty={() => false}
  >
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
</div>
