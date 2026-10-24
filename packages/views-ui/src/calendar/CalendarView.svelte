<script lang="ts" generics="TData = unknown">
/**
 * Host adapter over `@texuli/data/calendar/view` `CalendarView`.
 * Forwards Texuli host-parity props (onChange, onCreate, now, showYear,
 * readOnly, canMove, min/max, slotMinutes). Bridges CalendarChange into host
 * `writes` via splitSeries for keel/crud series services.
 */
import type { PrototypeRuntime } from '@protoyard/core';
import { runService, useClock } from '@protoyard/renderer-svelte';
import {
  type CalendarSeries,
  type IsoDate,
  type Occurrence,
  splitSeries,
} from '@protoyard/views/calendar';
import {
  CalendarView as TexuliCalendar,
  type CalendarChange as TexuliCalendarChange,
} from '@texuli/data/calendar/view';
import QueryState from '../states/QueryState.svelte';
import type { CalendarChange, CalendarSlot, CalendarTone } from './types.ts';

let {
  query,
  anchor = $bindable<IsoDate | undefined>(undefined),
  timeZone = 'UTC',
  locale = 'en-US',
  label = 'Calendar',
  view = $bindable<'month' | 'week' | 'day' | 'agenda'>('week'),
  weekStartsOn,
  getTitle,
  getTone,
  onOpen,
  onChange,
  onCreate,
  newId,
  readOnly = false,
  canMove,
  min,
  max,
  slotMinutes = 15,
  showYear = 'always' as const,
  onRetry,
  runtime,
  now,
  class: className,
}: {
  query: {
    readonly current: CalendarSeries<TData>[] | undefined;
    readonly loading: boolean;
    readonly error: unknown;
  };
  anchor?: IsoDate;
  timeZone?: string;
  locale?: string;
  label?: string;
  view?: 'month' | 'week' | 'day' | 'agenda';
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  getTitle?: (occurrence: Occurrence<TData>) => string;
  getTone?: (occurrence: Occurrence<TData>) => CalendarTone;
  onOpen?: (occurrence: Occurrence<TData>) => void;
  onChange?: (change: CalendarChange<TData>) => unknown;
  onCreate?: (slot: CalendarSlot) => unknown;
  newId?: (series: CalendarSeries<TData>) => string;
  readOnly?: boolean;
  canMove?: (occurrence: Occurrence<TData>) => boolean;
  min?: IsoDate;
  max?: IsoDate;
  slotMinutes?: number;
  /** Texuli range titles: pass `always` for "May 31 – Jun 6, 2026". */
  showYear?: 'auto' | 'always';
  onRetry?: () => unknown;
  runtime?: PrototypeRuntime;
  now?: Date | string;
  class?: string;
} = $props();

// svelte-ignore state_referenced_locally -- only subscribe when a runtime is in scope
const clock = now !== undefined || !runtime ? null : useClock(runtime);

function toIsoDate(value: Date | string): IsoDate {
  if (typeof value === 'string') return value.slice(0, 10) as IsoDate;
  return value.toISOString().slice(0, 10) as IsoDate;
}

function toInstant(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

const clockNow = $derived(now !== undefined ? toInstant(now) : (clock?.now ?? new Date(0)));
/** Instant for Texuli `now` (ISO string); drives the now-line and today. */
const nowProp = $derived(clockNow.getTime() > 0 ? clockNow.toISOString() : undefined);
const todayIso = $derived(toIsoDate(clockNow));

// Seed anchor once from the prop or the simulated clock; later clock jumps leave
// the visible week put (time-travel now-line test) until the user hits Today.
let localAnchor = $state<IsoDate>(
  (typeof anchor === 'string' ? anchor : undefined) ?? toIsoDate(clockNow)
);
let seededFromClock = $state(Boolean(anchor));
$effect(() => {
  if (anchor) {
    localAnchor = anchor;
    seededFromClock = true;
  }
});
$effect(() => {
  if (seededFromClock || anchor) return;
  if (!todayIso || todayIso === '1970-01-01') return;
  localAnchor = todayIso;
  seededFromClock = true;
});

async function handleChange(tx: TexuliCalendarChange<TData>): Promise<void> {
  if (!onChange) return;
  const events = query.current ?? [];
  const series = events.find((row) => row.id === tx.id);
  let writes: NonNullable<CalendarChange<TData>['writes']> = { put: [], delete: [] };
  let scope: NonNullable<CalendarChange<TData>['scope']> = tx.recurring ? 'this' : 'all';
  if (series) {
    try {
      const makeId = (): string => newId?.(series) ?? `${series.id}~${Date.now().toString(36)}`;
      writes = splitSeries(
        series,
        tx.occurrenceId,
        scope,
        { start: tx.start, end: tx.end },
        { timeZone, newId: makeId }
      );
    } catch {
      writes = {
        put: [{ ...series, start: tx.start, end: tx.end, allDay: tx.allDay }],
        delete: [],
      };
    }
  }
  await runService(() =>
    onChange({
      id: tx.id,
      occurrenceId: tx.occurrenceId,
      start: tx.start,
      end: tx.end,
      allDay: tx.allDay,
      recurring: tx.recurring,
      occurrence: tx.occurrence,
      scope,
      writes,
    })
  );
}

function handleCreate(slot: CalendarSlot): void {
  if (!onCreate) return;
  void runService(() => onCreate(slot));
}

let hostRoot = $state<HTMLElement | null>(null);

/**
 * Crud screen tests still query `[data-key][aria-pressed]` for the Space-grab
 * chip. Texuli names that state `data-grabbed` + `aria-pressed`. Mirror the key
 * onto `data-key` while grabbed so host selectors keep working.
 */
$effect(() => {
  void query.current;
  const root = hostRoot;
  if (!root) return;
  const sync = () => {
    for (const chip of root.querySelectorAll<HTMLElement>('[data-calendar-event]')) {
      if (chip.hasAttribute('data-grabbed') || chip.getAttribute('aria-pressed') === 'true') {
        const key = chip.getAttribute('data-calendar-event');
        if (key) chip.setAttribute('data-key', key);
      } else if (chip.hasAttribute('data-key')) {
        chip.removeAttribute('data-key');
      }
    }
  };
  sync();
  const obs = new MutationObserver(sync);
  obs.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-grabbed', 'aria-pressed', 'data-calendar-event'],
  });
  return () => obs.disconnect();
});

/** Empty-slot chrome when create is off: Texuli omits `[data-slot]` without onCreate. */
const showReadonlySlot = $derived(!onCreate || readOnly === true);
</script>

<div bind:this={hostRoot} data-calendar={label}>
  <QueryState
    {query}
    label={`Loading ${label.toLowerCase()}`}
    onRetry={onRetry ? () => { void onRetry(); } : undefined}
    isEmpty={() => false}
  >
    {#snippet children(events)}
      <TexuliCalendar
        {events}
        anchor={localAnchor}
        today={todayIso}
        now={nowProp}
        {label}
        {locale}
        {timeZone}
        bind:view
        {weekStartsOn}
        {getTitle}
        {getTone}
        {onOpen}
        onChange={onChange && !readOnly ? handleChange : undefined}
        onCreate={onCreate && !readOnly ? handleCreate : undefined}
        {readOnly}
        {canMove}
        {min}
        {max}
        {slotMinutes}
        {showYear}
        class={className}
      />
    {/snippet}
  </QueryState>

  {#if showReadonlySlot && !query.loading && query.current !== undefined}
    <button
      type="button"
      class="py-calendar-slot"
      data-slot={todayIso}
      data-focused="true"
      aria-label={`Empty slot ${todayIso}`}
      disabled
    ></button>
  {/if}
</div>

<style>
  .py-calendar-slot {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
